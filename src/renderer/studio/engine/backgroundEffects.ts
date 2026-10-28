import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { WebcamBackground } from '../../../shared/types';

// Output is capped so blur + compositing stay cheap on low-end laptops; the webcam is a small PiP anyway
const MAX_OUTPUT_WIDTH = 960;
const BLUR_PX = { light: 8, strong: 18 };

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** One shared person-segmentation model, loaded on first use from the bundled ./mediapipe assets. */
function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const base = new URL('./mediapipe/', document.baseURI).href;
      const fileset = await FilesetResolver.forVisionTasks(base + 'wasm');
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: base + 'selfie_segmenter_landscape.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((err) => {
      segmenterPromise = null; // allow a retry later
      throw err;
    });
  }
  return segmenterPromise;
}

/** Draws `img` scaled to cover w x h (centre-cropped). */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/**
 * Replaces or blurs the background behind the person in a webcam feed. Runs on every new camera
 * frame and keeps the result in `canvas`, which the composition draws instead of the raw video.
 */
export class BackgroundProcessor {
  readonly canvas = document.createElement('canvas');
  ready = false;
  failed = false;

  private ctx = this.canvas.getContext('2d')!;
  private mask = document.createElement('canvas');
  private maskCtx = this.mask.getContext('2d')!;
  private person = document.createElement('canvas');
  private personCtx = this.person.getContext('2d')!;
  private maskData: ImageData | null = null;
  private segmenter: ImageSegmenter | null = null;
  private frameHandle: number | null = null;
  private destroyed = false;
  private lastTimestamp = 0;

  private effect: WebcamBackground = { mode: 'none' };
  private image: (CanvasImageSource & { width: number; height: number }) | null = null;

  constructor(
    readonly video: HTMLVideoElement,
    private onFrame: () => void
  ) {
    getSegmenter()
      .then((seg) => {
        if (this.destroyed) return;
        this.segmenter = seg;
        this.schedule();
      })
      .catch((err) => {
        this.failed = true;
        console.error('[Background] Could not load person segmentation:', err);
      });
  }

  setEffect(effect: WebcamBackground, image: (CanvasImageSource & { width: number; height: number }) | null) {
    this.effect = effect;
    this.image = image;
  }

  destroy() {
    this.destroyed = true;
    if (this.frameHandle !== null) this.video.cancelVideoFrameCallback(this.frameHandle);
    this.frameHandle = null;
  }

  private schedule() {
    if (this.destroyed) return;
    this.frameHandle = this.video.requestVideoFrameCallback(() => {
      this.frameHandle = null;
      try {
        this.process();
      } catch (err) {
        console.warn('[Background] Frame skipped:', err);
      }
      this.schedule();
    });
  }

  private process() {
    const v = this.video;
    const seg = this.segmenter;
    if (!seg || v.readyState < 2 || !v.videoWidth || this.effect.mode === 'none') return;

    const scale = Math.min(1, MAX_OUTPUT_WIDTH / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    for (const c of [this.canvas, this.person]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }

    // VIDEO mode needs strictly increasing timestamps
    const ts = Math.max(performance.now(), this.lastTimestamp + 1);
    this.lastTimestamp = ts;
    seg.segmentForVideo(v, ts, (result) => {
      const conf = result.confidenceMasks?.[0];
      if (!conf) return;
      const mw = conf.width;
      const mh = conf.height;
      const values = conf.getAsFloat32Array();
      if (this.mask.width !== mw || this.mask.height !== mh || !this.maskData) {
        this.mask.width = mw;
        this.mask.height = mh;
        this.maskData = this.maskCtx.createImageData(mw, mh);
      }
      const px = this.maskData.data;
      for (let i = 0; i < values.length; i++) {
        // Smoothstep 0.25..0.75 sharpens the edge without making it jagged
        let a = (values[i] - 0.25) / 0.5;
        a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
        const o = i * 4;
        px[o] = 255;
        px[o + 1] = 255;
        px[o + 2] = 255;
        px[o + 3] = a * 255;
      }
      this.maskCtx.putImageData(this.maskData, 0, 0);
    });

    // 1. Background
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    if (this.effect.mode === 'blur') {
      const blur = BLUR_PX[this.effect.blur ?? 'strong'];
      ctx.filter = `blur(${blur}px)`;
      // Draw oversized so the blur doesn't pull dark edges in from outside the frame
      ctx.drawImage(v, -blur * 2, -blur * 2, w + blur * 4, h + blur * 4);
      ctx.filter = 'none';
    } else if (this.image) {
      drawCover(ctx, this.image, w, h);
    } else {
      ctx.fillStyle = '#1f2330';
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Person: soft-edged mask, then the camera image kept only where the mask is
    const p = this.personCtx;
    p.globalCompositeOperation = 'source-over';
    p.clearRect(0, 0, w, h);
    p.filter = 'blur(2px)';
    p.drawImage(this.mask, 0, 0, w, h);
    p.filter = 'none';
    p.globalCompositeOperation = 'source-in';
    p.drawImage(v, 0, 0, w, h);
    p.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.person, 0, 0);
    this.ready = true;
    this.onFrame();
  }
}

// --- Built-in background presets (drawn, so nothing extra to ship) ---

export const BACKGROUND_PRESETS: { id: string; name: string }[] = [
  { id: 'klh-maroon', name: 'KLH Maroon' },
  { id: 'studio-dark', name: 'Dark Studio' },
  { id: 'soft-blue', name: 'Soft Blue' },
  { id: 'warm-office', name: 'Warm Office' },
  { id: 'chalkboard', name: 'Chalkboard' },
  { id: 'clean-light', name: 'Clean Light' },
];

const presetCache = new Map<string, HTMLCanvasElement>();

export function getPresetBackground(id: string): HTMLCanvasElement {
  const cached = presetCache.get(id);
  if (cached) return cached;
  const w = 1280;
  const h = 720;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const linear = (stops: [number, string][], x1 = 0, y1 = 0, x2 = w, y2 = h) => {
    const grad = g.createLinearGradient(x1, y1, x2, y2);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };
  const glow = (x: number, y: number, r: number, col: string) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };

  switch (id) {
    case 'klh-maroon':
      linear([[0, '#4a1214'], [0.6, '#7a1f22'], [1, '#9b2b2a']]);
      glow(w * 0.8, h * 0.2, w * 0.5, 'rgba(255,190,150,0.18)');
      ['#f59e0b', '#ec4899', '#3b82f6', '#22c55e'].forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect((w / 4) * i, h - 10, w / 4 + 1, 10);
      });
      break;
    case 'studio-dark':
      linear([[0, '#0b0f1a'], [1, '#1c2333']]);
      glow(w * 0.5, h * 0.35, w * 0.55, 'rgba(90,120,200,0.22)');
      break;
    case 'soft-blue':
      linear([[0, '#dbeafe'], [1, '#93c5fd']]);
      glow(w * 0.25, h * 0.2, w * 0.4, 'rgba(255,255,255,0.6)');
      break;
    case 'warm-office':
      linear([[0, '#e9d8c4'], [0.65, '#c9a782'], [1, '#8b6a4a']], 0, 0, 0, h);
      // Soft out-of-focus lights
      [[0.15, 0.3, 90], [0.32, 0.18, 60], [0.72, 0.25, 110], [0.86, 0.5, 70], [0.55, 0.42, 50]].forEach(([x, y, r]) =>
        glow(w * x, h * y, r, 'rgba(255,240,210,0.55)')
      );
      break;
    case 'chalkboard':
      linear([[0, '#1f3b2d'], [1, '#13261d']]);
      glow(w * 0.5, h * 0.4, w * 0.6, 'rgba(255,255,255,0.06)');
      g.fillStyle = '#6b4a2b';
      g.fillRect(0, h - 26, w, 26);
      break;
    default:
      linear([[0, '#f8fafc'], [1, '#e2e8f0']]);
      glow(w * 0.7, h * 0.3, w * 0.5, 'rgba(255,255,255,0.8)');
  }
  presetCache.set(id, c);
  return c;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Resolves a background reference ('preset:<id>' or 'file:<name>') to something drawable. */
export async function loadBackgroundImage(ref: string | undefined): Promise<(CanvasImageSource & { width: number; height: number }) | null> {
  if (!ref) return null;
  if (ref.startsWith('preset:')) return getPresetBackground(ref.slice(7));
  if (!ref.startsWith('file:')) return null;
  const name = ref.slice(5);
  let pending = imageCache.get(name);
  if (!pending) {
    pending = (async () => {
      const buf = await window.electronAPI.backgrounds.read(name);
      if (!buf) return null;
      const url = URL.createObjectURL(new Blob([buf]));
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    })().catch((err) => {
      console.warn('[Background] Could not load image', name, err);
      imageCache.delete(name);
      return null;
    });
    imageCache.set(name, pending);
  }
  return pending;
}
