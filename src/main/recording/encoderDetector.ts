import { spawn } from 'child_process';
import { getFFmpegPath } from '../utils/ffmpegHelper';

export interface EncoderCapability {
  id: string;
  name: string;
  type: 'hardware' | 'software';
  codec: string;
  isAvailable: boolean;
  testError?: string;
}

export class EncoderDetector {
  private static cachedEncoders: EncoderCapability[] | null = null;
  private static activeEncoder: EncoderCapability | null = null;

  public static async detectEncoders(): Promise<EncoderCapability[]> {
    if (this.cachedEncoders) {
      return this.cachedEncoders;
    }

    const ffmpegPath = getFFmpegPath();
    const candidateEncoders: Omit<EncoderCapability, 'isAvailable'>[] = [
      { id: 'h264_qsv', name: 'Intel QuickSync (Hardware)', type: 'hardware', codec: 'h264_qsv' },
      { id: 'h264_nvenc', name: 'NVIDIA NVENC (Hardware)', type: 'hardware', codec: 'h264_nvenc' },
      { id: 'h264_amf', name: 'AMD AMF (Hardware)', type: 'hardware', codec: 'h264_amf' },
      { id: 'h264_mf', name: 'Windows Media Foundation (Hardware)', type: 'hardware', codec: 'h264_mf' },
      { id: 'libx264', name: 'x264 Software Encoder (CPU)', type: 'software', codec: 'libx264' },
    ];

    const results: EncoderCapability[] = [];

    for (const candidate of candidateEncoders) {
      const isWorking = await this.testEncoder(ffmpegPath, candidate.codec);
      results.push({
        ...candidate,
        isAvailable: isWorking.success,
        testError: isWorking.error,
      });
    }

    this.cachedEncoders = results;
    
    // Choose best available: first working hardware encoder, or software fallback
    const best = results.find(e => e.isAvailable && e.type === 'hardware') ||
                 results.find(e => e.isAvailable && e.type === 'software') ||
                 results[results.length - 1]; // fallback to libx264
    
    this.activeEncoder = best;
    return results;
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

  private static testEncoder(ffmpegPath: string, codec: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Create a 1-frame dummy test video in memory to verify encoder initialization
      const args = [
        '-f', 'lavfi',
        '-i', 'color=c=black:s=64x64:d=0.1',
        '-c:v', codec,
        '-f', 'null',
        '-',
      ];

      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr.slice(-150) });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      // Timeout safety
      setTimeout(() => {
        try { proc.kill(); } catch {}
        resolve({ success: false, error: 'Encoder test timed out' });
      }, 3000);
    });
  }
}
