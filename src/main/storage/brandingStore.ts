import { app } from 'electron';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { BrandClip, BrandClipKind, BrandingInfo } from '../../shared/types';
import { getFFmpegPath } from '../utils/ffmpegHelper';
import { EncoderDetector, buildEncoderArgs } from '../recording/encoderDetector';

interface BrandingFile {
  pin?: { salt: string; hash: string };
  intro?: BrandClip;
  outro?: BrandClip;
}

const MIN_PIN_LENGTH = 4;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

/**
 * Admin-controlled lecture branding (intro/outro clips) guarded by an admin PIN.
 * Clips are copied into the app's data folder and normalized once on import, so professors
 * can't swap them and every laptop gets a format Chromium decodes cheaply (H.264/AAC MP4, <=1080p).
 */
export class BrandingStore {
  private dir: string;
  private filePath: string;
  private data: BrandingFile;
  private failedAttempts: number[] = [];

  constructor() {
    this.dir = path.join(app.getPath('userData'), 'branding');
    this.filePath = path.join(this.dir, 'branding.json');
    fs.mkdirSync(this.dir, { recursive: true });
    this.data = this.load();
  }

  private load(): BrandingFile {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private clipPath(kind: BrandClipKind): string {
    return path.join(this.dir, `${kind}.mp4`);
  }

  public getInfo(): BrandingInfo {
    const valid = (kind: BrandClipKind) => (this.data[kind] && fs.existsSync(this.clipPath(kind)) ? this.data[kind]! : null);
    return { hasAdminPin: !!this.data.pin, intro: valid('intro'), outro: valid('outro') };
  }

  private hashPin(pin: string, salt: string): string {
    return crypto.scryptSync(pin, salt, 32).toString('hex');
  }

  /** Throws unless the PIN is correct. Repeated failures lock admin actions for a minute. */
  public assertPin(pin: string) {
    const now = Date.now();
    this.failedAttempts = this.failedAttempts.filter((t) => now - t < LOCKOUT_MS);
    if (this.failedAttempts.length >= LOCKOUT_ATTEMPTS) {
      throw new Error('Too many wrong PIN attempts. Try again in a minute.');
    }
    const stored = this.data.pin;
    if (!stored) throw new Error('Admin PIN has not been set up yet.');
    const actual = Buffer.from(this.hashPin(String(pin ?? ''), stored.salt), 'hex');
    const expected = Buffer.from(stored.hash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      this.failedAttempts.push(now);
      throw new Error('Incorrect admin PIN.');
    }
    this.failedAttempts = [];
  }

  /** First-time setup needs no current PIN; changing it afterwards does. */
  public setPin(currentPin: string | null, nextPin: string): BrandingInfo {
    if (this.data.pin) this.assertPin(currentPin ?? '');
    if (!nextPin || nextPin.length < MIN_PIN_LENGTH) {
      throw new Error(`Admin PIN must be at least ${MIN_PIN_LENGTH} characters.`);
    }
    const salt = crypto.randomBytes(16).toString('hex');
    this.data.pin = { salt, hash: this.hashPin(nextPin, salt) };
    this.save();
    return this.getInfo();
  }

  public async importClip(kind: BrandClipKind, sourcePath: string, pin: string): Promise<BrandingInfo> {
    this.assertPin(pin);
    if (!fs.existsSync(sourcePath)) throw new Error('Selected file no longer exists.');

    const target = this.clipPath(kind);
    const temp = path.join(this.dir, `${kind}.importing.mp4`);
    await EncoderDetector.detectEncoders().catch(() => undefined);
    const encoder = EncoderDetector.getActiveEncoder();
    const encode = (codec: string) =>
      this.runFfmpeg([
        '-y', '-hide_banner',
        '-i', sourcePath,
        '-map', '0:v:0', '-map', '0:a:0?',
        // Never upscale; cap at 1080p and keep even dimensions for H.264
        '-vf', "scale='min(1920,iw)':-2",
        ...buildEncoderArgs(codec, { bitrateKbps: 6000, fps: 30, mode: 'file' }),
        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        temp,
      ]);

    let result = encoder.type === 'hardware' ? await encode(encoder.codec) : null;
    if (!result?.ok) result = await encode('libx264');
    if (!result.ok) {
      try { fs.unlinkSync(temp); } catch {}
      throw new Error('This video could not be read. Please choose an MP4, MOV, MKV or WebM file.');
    }

    fs.renameSync(temp, target);
    const m = result.stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const durationSec = m ? Math.round(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) : 0;
    this.data[kind] = {
      originalName: path.basename(sourcePath),
      durationSec,
      sizeBytes: fs.statSync(target).size,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.getInfo();
  }

  public removeClip(kind: BrandClipKind, pin: string): BrandingInfo {
    this.assertPin(pin);
    try { fs.unlinkSync(this.clipPath(kind)); } catch {}
    delete this.data[kind];
    this.save();
    return this.getInfo();
  }

  public readClip(kind: BrandClipKind): Buffer | null {
    if (!this.getInfo()[kind]) return null;
    return fs.readFileSync(this.clipPath(kind));
  }

  private runFfmpeg(args: string[]): Promise<{ ok: boolean; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(getFFmpegPath(), args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        // Keep the head (has "Duration:") and a bounded tail for errors
        stderr = stderr.length < 4000 ? stderr + d.toString() : stderr.slice(0, 2000) + d.toString().slice(-2000);
      });
      proc.on('close', (code) => resolve({ ok: code === 0, stderr }));
      proc.on('error', (e) => resolve({ ok: false, stderr: e.message }));
    });
  }
}
