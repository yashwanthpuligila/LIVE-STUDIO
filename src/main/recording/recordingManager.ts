import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getFFmpegPath } from '../utils/ffmpegHelper';
import { RecordingItem, RecordingStatus } from '../../shared/types';
import { RecordingsStore } from '../storage/recordingsStore';
import { EncoderDetector } from './encoderDetector';

interface ActiveSession {
  id: string;
  filename: string;
  outputDir: string;
  tempWebmPath: string;
  finalMp4Path: string;
  thumbnailPath: string;
  resolution: string;
  fps: number;
  writeStream: fs.WriteStream | null;
  startTime: number;
  pauseTime: number;
  totalPausedDuration: number;
  status: RecordingStatus;
  bytesWritten: number;
  writeErrors: number;
  usedEncoder: string;
}

export class RecordingManager {
  private activeSession: ActiveSession | null = null;
  private recordingsStore: RecordingsStore;

  constructor(recordingsStore: RecordingsStore) {
    this.recordingsStore = recordingsStore;
  }

  public getStatus(): {
    status: RecordingStatus;
    durationSec: number;
    bytesWritten: number;
    writeErrors: number;
  } {
    if (!this.activeSession) {
      return { status: 'idle', durationSec: 0, bytesWritten: 0, writeErrors: 0 };
    }
    const now = Date.now();
    let duration = 0;
    if (this.activeSession.status === 'recording') {
      duration = Math.max(0, Math.floor((now - this.activeSession.startTime - this.activeSession.totalPausedDuration) / 1000));
    } else if (this.activeSession.status === 'paused') {
      duration = Math.max(0, Math.floor((this.activeSession.pauseTime - this.activeSession.startTime - this.activeSession.totalPausedDuration) / 1000));
    }
    return {
      status: this.activeSession.status,
      durationSec: duration,
      bytesWritten: this.activeSession.bytesWritten,
      writeErrors: this.activeSession.writeErrors,
    };
  }

  public startRecording(options: {
    outputDir?: string;
    resolution?: string;
    fps?: number;
  }): { id: string; filename: string } {
    if (this.activeSession && (this.activeSession.status === 'recording' || this.activeSession.status === 'paused')) {
      throw new Error('A recording session is already in progress');
    }

    const userData = app.getPath('userData');
    const tempDir = path.join(userData, 'temp_recordings');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const id = `rec_${Date.now()}`;
    const filename = `LiveStudio_${timestamp}.mp4`;
    
    const outputDir = options.outputDir && fs.existsSync(options.outputDir)
      ? options.outputDir
      : path.join(app.getPath('videos') || userData, 'LiveStudio');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const thumbsDir = path.join(outputDir, '.thumbnails');
    if (!fs.existsSync(thumbsDir)) {
      fs.mkdirSync(thumbsDir, { recursive: true });
    }

    const tempWebmPath = path.join(tempDir, `${id}.webm`);
    const finalMp4Path = path.join(outputDir, filename);
    const thumbnailPath = path.join(thumbsDir, `${id}.jpg`);

    const writeStream = fs.createWriteStream(tempWebmPath, { flags: 'a' });
    writeStream.on('error', (err) => {
      console.error('Recording file write error:', err);
      if (this.activeSession) {
        this.activeSession.writeErrors++;
      }
    });

    this.activeSession = {
      id,
      filename,
      outputDir,
      tempWebmPath,
      finalMp4Path,
      thumbnailPath,
      resolution: options.resolution || '1920x1080',
      fps: options.fps || 30,
      writeStream,
      startTime: Date.now(),
      pauseTime: 0,
      totalPausedDuration: 0,
      status: 'recording',
      bytesWritten: 0,
      writeErrors: 0,
      usedEncoder: 'Detecting...',
    };

    return { id, filename };
  }

  public writeChunk(chunk: Buffer) {
    if (!this.activeSession || !this.activeSession.writeStream) {
      return;
    }
    if (this.activeSession.status === 'recording') {
      try {
        this.activeSession.writeStream.write(chunk);
        this.activeSession.bytesWritten += chunk.length;
      } catch (e) {
        this.activeSession.writeErrors++;
        console.error('Error writing chunk:', e);
      }
    }
  }

  public pauseRecording() {
    if (this.activeSession && this.activeSession.status === 'recording') {
      this.activeSession.status = 'paused';
      this.activeSession.pauseTime = Date.now();
    }
  }

  public resumeRecording() {
    if (this.activeSession && this.activeSession.status === 'paused') {
      this.activeSession.status = 'recording';
      const pauseDuration = Date.now() - this.activeSession.pauseTime;
      this.activeSession.totalPausedDuration += pauseDuration;
      this.activeSession.pauseTime = 0;
    }
  }

  public async stopRecording(): Promise<RecordingItem> {
    if (!this.activeSession) {
      throw new Error('No active recording session to stop');
    }

    const session = this.activeSession;
    session.status = 'processing';

    // Close write stream
    await new Promise<void>((resolve) => {
      if (session.writeStream) {
        session.writeStream.end(() => resolve());
      } else {
        resolve();
      }
    });

    // Check temp webm file
    if (!fs.existsSync(session.tempWebmPath)) {
      this.activeSession = null;
      throw new Error('Recording chunk file was not created');
    }

    const tempStat = fs.statSync(session.tempWebmPath);
    if (tempStat.size === 0) {
      try { fs.unlinkSync(session.tempWebmPath); } catch {}
      this.activeSession = null;
      throw new Error('Recorded file contains no data (0 bytes). Check that screen was selected.');
    }

    const ffmpegPath = getFFmpegPath();
    const activeEncoder = EncoderDetector.getActiveEncoder();
    let successfulEncoder = activeEncoder.name;

    // Helper to run ffmpeg with specific encoder parameters
    const runTranscode = (encoderArgs: string[]): Promise<boolean> => {
      return new Promise((resolve) => {
        const fullArgs = [
          '-y',
          '-i', session.tempWebmPath,
          ...encoderArgs,
          '-c:a', 'aac',
          '-b:a', '160k',
          '-movflags', '+faststart',
          session.finalMp4Path,
        ];

        const proc = spawn(ffmpegPath, fullArgs, { windowsHide: true });
        let stderr = '';

        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(session.finalMp4Path)) {
            const stat = fs.statSync(session.finalMp4Path);
            if (stat.size > 1000) {
              resolve(true);
              return;
            }
          }
          console.warn(`Transcode attempt failed (code ${code}):`, stderr.slice(-200));
          resolve(false);
        });

        proc.on('error', (err) => {
          console.warn('Transcode process error:', err.message);
          resolve(false);
        });
      });
    };

    // Stage 1: Try chosen hardware encoder if available
    let success = false;
    if (activeEncoder.type === 'hardware' && activeEncoder.isAvailable) {
      console.log(`[Recording] Attempting hardware encoding with ${activeEncoder.codec}...`);
      let hwArgs: string[] = [];
      if (activeEncoder.codec === 'h264_qsv') {
        hwArgs = ['-c:v', 'h264_qsv', '-b:v', '5000k', '-preset', 'veryfast', '-pix_fmt', 'nv12'];
      } else if (activeEncoder.codec === 'h264_mf') {
        hwArgs = ['-c:v', 'h264_mf', '-b:v', '5000k'];
      } else if (activeEncoder.codec === 'h264_nvenc') {
        hwArgs = ['-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', '5000k', '-pix_fmt', 'yuv420p'];
      } else {
        hwArgs = ['-c:v', activeEncoder.codec, '-b:v', '5000k'];
      }

      success = await runTranscode(hwArgs);
      if (success) {
        successfulEncoder = `${activeEncoder.name} (Accelerated)`;
      } else {
        console.warn(`[Recording] Hardware encoder ${activeEncoder.codec} failed. Falling back to software libx264...`);
      }
    }

    // Stage 2: Software fallback with libx264
    if (!success) {
      console.log('[Recording] Encoding with libx264 (CPU)...');
      const swArgs = [
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
      ];
      success = await runTranscode(swArgs);
      if (success) {
        successfulEncoder = 'x264 Software Encoder (CPU)';
      }
    }

    // Stage 3: Direct remux fallback if transcode failed
    if (!success) {
      console.log('[Recording] Transcode failed, falling back to direct stream copy...');
      const copyArgs = ['-c', 'copy'];
      success = await runTranscode(copyArgs);
      if (success) {
        successfulEncoder = 'Direct Stream Copy (Remux)';
      }
    }

    if (!success || !fs.existsSync(session.finalMp4Path)) {
      this.activeSession = null;
      throw new Error('Failed to finalize and transcode MP4 recording with available encoders');
    }

    session.usedEncoder = successfulEncoder;

    // 2. Generate video thumbnail at 0.5s
    await new Promise<void>((resolve) => {
      const args = [
        '-y',
        '-ss', '00:00:00.500',
        '-i', session.finalMp4Path,
        '-vframes', '1',
        '-vf', 'scale=480:-1',
        '-q:v', '2',
        session.thumbnailPath,
      ];

      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });

    // Clean up temporary webm file
    try {
      if (fs.existsSync(session.tempWebmPath)) {
        fs.unlinkSync(session.tempWebmPath);
      }
    } catch (e) {
      console.warn('Failed to delete temp webm:', e);
    }

    const finalStat = fs.statSync(session.finalMp4Path);
    const durationSec = Math.max(1, Math.round((Date.now() - session.startTime - session.totalPausedDuration) / 1000));

    // Convert thumbnail to base64
    let thumbData = '';
    if (fs.existsSync(session.thumbnailPath)) {
      try {
        const thumbBuf = fs.readFileSync(session.thumbnailPath);
        thumbData = `data:image/jpeg;base64,${thumbBuf.toString('base64')}`;
      } catch {}
    }

    const recordingItem: RecordingItem = {
      id: session.id,
      title: session.filename.replace('.mp4', ''),
      filename: session.filename,
      filePath: session.finalMp4Path,
      thumbnailPath: thumbData || session.thumbnailPath,
      durationSec,
      fileSize: finalStat.size,
      resolution: session.resolution,
      fps: session.fps,
      createdAt: new Date().toISOString(),
      encoder: successfulEncoder,
      tags: ['Tutorial', 'Screen Capture', successfulEncoder.includes('Accelerated') ? 'Hardware Accel' : 'Software'],
    };

    // Store in recordings registry
    this.recordingsStore.add(recordingItem);

    this.activeSession = null;
    return recordingItem;
  }
}
