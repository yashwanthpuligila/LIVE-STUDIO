import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Webcam background images the user uploaded, copied into the app's data folder. */
export class BackgroundsStore {
  private dir: string;

  constructor() {
    this.dir = path.join(app.getPath('userData'), 'backgrounds');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Only plain file names we created are accepted, never paths. */
  private resolve(name: string): string | null {
    const base = path.basename(String(name));
    if (base !== name) return null;
    const ext = path.extname(base).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) return null;
    return path.join(this.dir, base);
  }

  public list(): string[] {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => this.resolve(f))
        .map((f) => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .map((x) => x.f);
    } catch {
      return [];
    }
  }

  /** Opens a file picker and copies the chosen image in. Returns its stored name, or null if cancelled. */
  public async choose(win: BrowserWindow | null): Promise<string | null> {
    const options = {
      title: 'Choose a background image',
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;

    const src = result.filePaths[0];
    const ext = path.extname(src).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error('Unsupported image type');
    if (fs.statSync(src).size > MAX_IMAGE_BYTES) throw new Error('Image is larger than 25 MB');

    const name = `bg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.copyFileSync(src, path.join(this.dir, name));
    return name;
  }

  public read(name: string): Buffer | null {
    const file = this.resolve(name);
    if (!file || !fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  }

  public remove(name: string): boolean {
    const file = this.resolve(name);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }
}
