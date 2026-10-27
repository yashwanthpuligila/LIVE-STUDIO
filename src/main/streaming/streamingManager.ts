import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { BrowserWindow } from 'electron';
import { getFFmpegPath } from '../utils/ffmpegHelper';
import { EncoderDetector, buildEncoderArgs } from '../recording/encoderDetector';
import { getHardwareProfile } from '../system/hardwareProfile';
import { StreamConfig, StreamStats, StreamStatus } from '../../shared/types';
import OBSWebSocket from 'obs-websocket-js';

export class StreamingManager {
  private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
  private status: StreamStatus = 'idle';
  private stats: StreamStats = {
    fps: 0,
    bitrateKbps: 0,
    totalBytes: 0,
    droppedFrames: 0,
    uptimeSec: 0,
  };
  private startTime: number = 0;
  private statsTimer: NodeJS.Timeout | null = null;
  private getMainWindow: () => BrowserWindow | null;
  private obsClient: OBSWebSocket | null = null;
  private isObsConnected: boolean = false;

  // Chunks received before the stream is confirmed live, replayed if we must restart FFmpeg
  // with a fallback encoder (the first chunk carries the WebM/MKV header, so it can't be skipped).
  private startupChunks: Buffer[] = [];
  private startupBytes = 0;
  private static readonly STARTUP_BUFFER_LIMIT = 16 * 1024 * 1024;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  public getStatus(): { status: StreamStatus; stats: StreamStats } {
    return { status: this.status, stats: this.stats };
  }

  public async startStream(config: StreamConfig): Promise<void> {
    if (this.status === 'live' || this.status === 'connecting') {
      throw new Error('A stream is already active or connecting');
    }

    if (!config.streamKey || !config.streamKey.trim()) {
      throw new Error('YouTube Stream Key is required');
    }

    const rtmpBase = (config.rtmpUrl || 'rtmps://a.rtmp.youtube.com/live2').replace(/\/+$/, '');
    const fullTargetUrl = `${rtmpBase}/${config.streamKey.trim()}`;

    this.status = 'connecting';
    this.notifyStatusChange();

    this.startTime = Date.now();
    this.stats = {
      fps: 0,
      bitrateKbps: 0,
      totalBytes: 0,
      droppedFrames: 0,
      uptimeSec: 0,
    };
    this.startupChunks = [];
    this.startupBytes = 0;

    await EncoderDetector.detectEncoders().catch(() => undefined);
    const encoder = EncoderDetector.getActiveEncoder();
    const lowEnd = (await getHardwareProfile()).tier === 'low';

    try {
      this.spawnFfmpeg(config, fullTargetUrl, encoder.isAvailable ? encoder.codec : 'libx264', lowEnd);
    } catch (err: any) {
      this.status = 'error';
      this.notifyStatusChange(`Failed to spawn FFmpeg: ${err.message}`);
      throw err;
    }

    // Start stats interval
    this.statsTimer = setInterval(() => {
      if (this.status === 'live') {
        this.stats.uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
        this.emitStats();
      }
    }, 1000);
  }

  private spawnFfmpeg(config: StreamConfig, targetUrl: string, codec: string, lowEnd: boolean) {
    const fps = config.fps || 30;
    const args = [
      '-hide_banner',
      // Live pipe input: no -re (it throttles reading and adds latency/buffer growth)
      '-fflags', '+genpts',
      '-f', 'matroska',
      '-i', 'pipe:0',
      ...buildEncoderArgs(codec, {
        bitrateKbps: config.videoBitrate || 4500,
        fps,
        mode: 'stream',
        lowEnd,
      }),
      // Composition only emits frames when the picture changes; YouTube needs constant frame rate
      '-fps_mode', 'cfr',
      '-r', `${fps}`,
      '-c:a', 'aac',
      '-b:a', `${config.audioBitrate || 160}k`,
      '-ar', '44100',
      '-f', 'flv',
      targetUrl,
    ];

    console.log(`[Streaming] Starting FFmpeg with ${codec}`);
    const proc = spawn(getFFmpegPath(), args, { windowsHide: true });
    this.ffmpegProcess = proc;

    // EPIPE on stdin after FFmpeg exits would otherwise be an unhandled 'error' event and crash the main process
    proc.stdin.on('error', (err) => console.warn('[Streaming] FFmpeg stdin closed:', err.message));

    // Stderr parsing for YouTube connection and live statistics
    proc.stderr.on('data', (data: Buffer) => {
      if (proc !== this.ffmpegProcess) return;
      const line = data.toString();

      // Parse FFmpeg progress line:
      // frame=  120 fps= 60 q=24.0 size=    1240kB time=00:00:02.00 bitrate=5080.0kbits/s speed=1.0x
      if (line.includes('fps=') || line.includes('bitrate=')) {
        if (this.status === 'connecting') {
          this.status = 'live';
          this.startupChunks = [];
          this.startupBytes = 0;
          this.notifyStatusChange();
        }

        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        const bitrateMatch = line.match(/bitrate=\s*([\d.]+)kbits\/s/);
        const sizeMatch = line.match(/size=\s*(\d+)kB/);

        if (fpsMatch) this.stats.fps = Math.round(parseFloat(fpsMatch[1]));
        if (bitrateMatch) this.stats.bitrateKbps = Math.round(parseFloat(bitrateMatch[1]));
        if (sizeMatch) this.stats.totalBytes = parseInt(sizeMatch[1], 10) * 1024;
      }

      // Check for connection / error messages
      const lower = line.toLowerCase();
      if (lower.includes('connection refused') ||
          lower.includes('failed to connect') ||
          lower.includes('handshake failed') ||
          lower.includes('server error') ||
          lower.includes('authentication failed')) {
        console.error('FFmpeg streaming error:', line);
        this.status = 'error';
        this.notifyStatusChange('Connection to YouTube Live failed. Please verify your stream key and network.');
      }
    });

    proc.on('close', (code) => {
      if (proc !== this.ffmpegProcess) return;
      console.log(`FFmpeg stream process exited with code ${code}`);

      // Hardware encoder failed before going live: retry once on the CPU encoder
      if (this.status === 'connecting' && code !== 0 && codec !== 'libx264' && this.startupChunks.length > 0) {
        console.warn(`[Streaming] ${codec} failed during startup, retrying with libx264`);
        const replay = this.startupChunks;
        try {
          this.spawnFfmpeg(config, targetUrl, 'libx264', lowEnd);
          for (const c of replay) this.ffmpegProcess?.stdin.write(c);
          return;
        } catch (e) {
          console.error('[Streaming] Fallback spawn failed:', e);
        }
      }

      if (this.status === 'live' || this.status === 'connecting') {
        this.status = code === 0 ? 'idle' : 'error';
        this.notifyStatusChange(code !== 0 ? `Stream interrupted (exit code ${code})` : undefined);
      }
      this.cleanup();
    });

    proc.on('error', (err) => {
      if (proc !== this.ffmpegProcess) return;
      console.error('FFmpeg process error:', err);
      this.status = 'error';
      this.notifyStatusChange(`Stream error: ${err.message}`);
      this.cleanup();
    });
  }

  public writeChunk(chunk: Buffer) {
    if (this.status === 'connecting' && this.startupBytes < StreamingManager.STARTUP_BUFFER_LIMIT) {
      this.startupChunks.push(chunk);
      this.startupBytes += chunk.length;
    }
    if (this.ffmpegProcess && this.ffmpegProcess.stdin && !this.ffmpegProcess.stdin.destroyed) {
      try {
        this.ffmpegProcess.stdin.write(chunk);
      } catch (err) {
        console.error('Error writing stream chunk to FFmpeg stdin:', err);
      }
    }
  }

  public async stopStream(): Promise<void> {
    if (this.status === 'idle') return;

    this.status = 'stopping';
    this.notifyStatusChange();

    if (this.ffmpegProcess) {
      if (this.ffmpegProcess.stdin) {
        try {
          this.ffmpegProcess.stdin.end();
        } catch {}
      }

      // Wait up to 3 seconds for graceful shutdown before killing
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.ffmpegProcess) {
            try { this.ffmpegProcess.kill('SIGKILL'); } catch {}
          }
          resolve();
        }, 3000);

        if (this.ffmpegProcess) {
          this.ffmpegProcess.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    }

    this.status = 'idle';
    this.notifyStatusChange();
    this.cleanup();
  }

  private cleanup() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.ffmpegProcess = null;
    this.startupChunks = [];
    this.startupBytes = 0;
  }

  private notifyStatusChange(errorMessage?: string) {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('streaming:status-changed', {
        status: this.status,
        error: errorMessage,
      });
    }
  }

  private emitStats() {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('streaming:stats', this.stats);
    }
  }

  // --- Mode A: OBS Studio WebSocket Support ---
  public async connectObs(url = 'ws://localhost:4455', password = ''): Promise<{ connected: boolean; version?: string }> {
    try {
      this.obsClient = new OBSWebSocket();
      const res = await this.obsClient.connect(url, password);
      this.isObsConnected = true;
      return { connected: true, version: res.obsWebSocketVersion };
    } catch (e: any) {
      this.isObsConnected = false;
      return { connected: false };
    }
  }

  public async disconnectObs(): Promise<void> {
    if (this.obsClient) {
      try {
        await this.obsClient.disconnect();
      } catch {}
      this.obsClient = null;
      this.isObsConnected = false;
    }
  }

  public getObsStatus(): { isConnected: boolean } {
    return { isConnected: this.isObsConnected };
  }
}
