import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getFFmpegPath } from '../utils/ffmpegHelper';

export interface EncoderCapability {
  id: string;
  name: string;
  type: 'hardware' | 'software';
  codec: string;
  isAvailable: boolean;
  testError?: string;
}

export interface EncodeTarget {
  bitrateKbps: number;
  fps: number;
  // 'stream' = constant bitrate + low latency for RTMP; 'file' = quality-oriented for MP4 export
  mode: 'stream' | 'file';
  // Low-end machines: trade a little compression for much less CPU (only affects libx264)
  lowEnd?: boolean;
}

// Ordered by preference: dedicated GPU encoders first, then iGPU, then OS fallback, then CPU
const CANDIDATES: Omit<EncoderCapability, 'isAvailable'>[] = [
  { id: 'h264_nvenc', name: 'NVIDIA NVENC (Hardware)', type: 'hardware', codec: 'h264_nvenc' },
  { id: 'h264_amf', name: 'AMD AMF (Hardware)', type: 'hardware', codec: 'h264_amf' },
  { id: 'h264_qsv', name: 'Intel QuickSync (Hardware)', type: 'hardware', codec: 'h264_qsv' },
  { id: 'h264_mf', name: 'Windows Media Foundation (Hardware)', type: 'hardware', codec: 'h264_mf' },
  { id: 'libx264', name: 'x264 Software Encoder (CPU)', type: 'software', codec: 'libx264' },
];

const CACHE_VERSION = 2;
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** FFmpeg video-encoder arguments for a codec, shared by recording export and live streaming. */
export function buildEncoderArgs(codec: string, t: EncodeTarget): string[] {
  const b = `${t.bitrateKbps}k`;
  const gop = `${Math.max(1, Math.round(t.fps * 2))}`; // 2-second keyframe interval
  const rate = ['-b:v', b, '-maxrate', b, '-bufsize', `${t.bitrateKbps * 2}k`];
  const live = t.mode === 'stream';

  switch (codec) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', ...(live ? ['-tune', 'll', '-rc', 'cbr'] : ['-rc', 'vbr']), ...rate, '-g', gop, '-pix_fmt', 'yuv420p'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-usage', live ? 'lowlatency' : 'transcoding', '-rc', live ? 'cbr' : 'vbr_peak', ...rate, '-g', gop, '-pix_fmt', 'nv12'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-look_ahead', '0', ...rate, '-g', gop, '-pix_fmt', 'nv12'];
    case 'h264_mf':
      return ['-c:v', 'h264_mf', ...(live ? ['-rate_control', 'cbr', '-scenario', 'live_streaming'] : []), ...rate, '-g', gop, '-pix_fmt', 'nv12'];
    default: {
      const preset = t.lowEnd ? 'ultrafast' : 'veryfast';
      return live
        ? ['-c:v', 'libx264', '-preset', preset, '-tune', 'zerolatency', ...rate, '-g', gop, '-keyint_min', `${t.fps}`, '-pix_fmt', 'yuv420p']
        : ['-c:v', 'libx264', '-preset', preset, '-crf', '22', '-maxrate', b, '-bufsize', `${t.bitrateKbps * 2}k`, '-pix_fmt', 'yuv420p'];
    }
  }
}

export class EncoderDetector {
  private static cachedEncoders: EncoderCapability[] | null = null;
  private static activeEncoder: EncoderCapability | null = null;
  private static pending: Promise<EncoderCapability[]> | null = null;
  private static preferredId: string | null = null;

  // null outside a running Electron app (e.g. the Node test runner): caching is simply skipped
  private static get cachePath(): string | null {
    return app?.getPath ? path.join(app.getPath('userData'), 'encoder_cache.json') : null;
  }

  /** Remember a user-chosen encoder so it is applied as soon as detection finishes. */
  public static setPreferred(encoderId: string | undefined) {
    this.preferredId = encoderId || null;
    if (this.cachedEncoders && encoderId) this.setActiveEncoder(encoderId);
  }

  public static async detectEncoders(hardwareKey = ''): Promise<EncoderCapability[]> {
    if (this.cachedEncoders) return this.cachedEncoders;
    if (this.pending) return this.pending;

    this.pending = (async () => {
      const ffmpegPath = getFFmpegPath();
      const cacheKey = this.buildCacheKey(ffmpegPath, hardwareKey);

      let results = this.readCache(cacheKey);
      if (!results) {
        // Sequential on purpose: probing in parallel spikes CPU on low-end laptops during startup
        results = [];
        for (const candidate of CANDIDATES) {
          const r = await this.testEncoder(ffmpegPath, candidate.codec);
          results.push({ ...candidate, isAvailable: r.success, testError: r.error });
        }
        this.writeCache(cacheKey, results);
      }

      this.cachedEncoders = results;
      this.activeEncoder =
        (this.preferredId && results.find((e) => e.id === this.preferredId && e.isAvailable)) ||
        results.find((e) => e.isAvailable && e.type === 'hardware') ||
        results.find((e) => e.isAvailable) ||
        results[results.length - 1];
      return results;
    })();

    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  public static getActiveEncoder(): EncoderCapability {
    if (this.activeEncoder) return this.activeEncoder;
    return {
      id: 'libx264',
      name: 'x264 Software Encoder (CPU)',
      type: 'software',
      codec: 'libx264',
      isAvailable: true,
    };
  }

  public static setActiveEncoder(encoderId: string): boolean {
    if (!this.cachedEncoders) return false;
    const found = this.cachedEncoders.find(e => e.id === encoderId && e.isAvailable);
    if (found) {
      this.activeEncoder = found;
      return true;
    }
    return false;
  }

  private static buildCacheKey(ffmpegPath: string, hardwareKey: string): string {
    let size = 0;
    try { size = fs.statSync(ffmpegPath).size; } catch {}
    return `${CACHE_VERSION}|${ffmpegPath}|${size}|${hardwareKey}`;
  }

  private static readCache(key: string): EncoderCapability[] | null {
    const file = this.cachePath;
    if (!file) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (raw.key === key && Date.now() - raw.savedAt < CACHE_MAX_AGE_MS && Array.isArray(raw.encoders)) {
        return raw.encoders;
      }
    } catch {}
    return null;
  }

  private static writeCache(key: string, encoders: EncoderCapability[]) {
    const file = this.cachePath;
    if (!file) return;
    try {
      fs.writeFileSync(file, JSON.stringify({ key, savedAt: Date.now(), encoders }), 'utf-8');
    } catch (e) {
      console.warn('[Encoders] Could not write cache:', e);
    }
  }

  private static testEncoder(ffmpegPath: string, codec: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // 256x256 (not 64x64): NVENC/AMF reject frames below ~145px, which made them look unavailable.
      // Test with the real live-stream arguments so "available" means the exact flags we use will work.
      const args = [
        '-hide_banner',
        '-f', 'lavfi',
        '-i', 'color=c=black:s=256x256:r=30:d=0.2',
        ...buildEncoderArgs(codec, { bitrateKbps: 2500, fps: 30, mode: 'stream' }),
        '-f', 'null',
        '-',
      ];

      let settled = false;
      const done = (r: { success: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      };

      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => done(code === 0 ? { success: true } : { success: false, error: stderr.slice(-150) }));
      proc.on('error', (err) => done({ success: false, error: err.message }));

      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        done({ success: false, error: 'Encoder test timed out' });
      }, 5000);
    });
  }
}
