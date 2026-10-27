import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { BrowserWindow } from 'electron';
import { getFFmpegPath } from '../utils/ffmpegHelper';
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

    const ffmpegPath = getFFmpegPath();
    const videoBitrate = config.videoBitrate || 4500;
    const audioBitrate = config.audioBitrate || 160;

    // FFmpeg args for YouTube Live RTMPS output
    const args = [
      '-y',
      '-re',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', `${videoBitrate}k`,
      '-maxrate', `${videoBitrate}k`,
      '-bufsize', `${videoBitrate * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-g', `${(config.fps || 60) * 2}`, // 2 second GOP for YouTube Live
      '-keyint_min', `${config.fps || 60}`,
      '-c:a', 'aac',
      '-b:a', `${audioBitrate}k`,
      '-ar', '44100',
      '-f', 'flv',
      fullTargetUrl,
    ];

    try {
      this.ffmpegProcess = spawn(ffmpegPath, args, { windowsHide: true });
    } catch (err: any) {
      this.status = 'error';
      this.notifyStatusChange(`Failed to spawn FFmpeg: ${err.message}`);
      throw err;
    }

    this.startTime = Date.now();
    this.stats = {
      fps: 0,
      bitrateKbps: 0,
      totalBytes: 0,
      droppedFrames: 0,
      uptimeSec: 0,
    };

    // Stderr parsing for YouTube connection and live statistics
    this.ffmpegProcess.stderr.on('data', (data: Buffer) => {
      const line = data.toString();
      
      // Parse FFmpeg progress line:
      // frame=  120 fps= 60 q=24.0 size=    1240kB time=00:00:02.00 bitrate=5080.0kbits/s speed=1.0x
      if (line.includes('fps=') || line.includes('bitrate=')) {
        if (this.status === 'connecting') {
          this.status = 'live';
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
      if (line.toLowerCase().includes('connection refused') ||
          line.toLowerCase().includes('failed to connect') ||
          line.toLowerCase().includes('handshake failed') ||
          line.toLowerCase().includes('server error') ||
          line.toLowerCase().includes('authentication failed')) {
        console.error('FFmpeg streaming error:', line);
        this.status = 'error';
        this.notifyStatusChange('Connection to YouTube Live failed. Please verify your stream key and network.');
      }
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg stream process exited with code ${code}`);
      if (this.status === 'live' || this.status === 'connecting') {
        this.status = code === 0 ? 'idle' : 'error';
        this.notifyStatusChange(code !== 0 ? `Stream interrupted (exit code ${code})` : undefined);
      }
      this.cleanup();
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('FFmpeg process error:', err);
      this.status = 'error';
      this.notifyStatusChange(`Stream error: ${err.message}`);
      this.cleanup();
    });

    // Start stats interval
    this.statsTimer = setInterval(() => {
      if (this.status === 'live') {
        this.stats.uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
        this.emitStats();
      }
    }, 1000);
  }

  public writeChunk(chunk: Buffer) {
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
