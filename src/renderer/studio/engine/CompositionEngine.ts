import { LectureInfo, Scene, SceneSource } from '../../../shared/types';
import { drawLaser, LaserPoint } from '../../annotations/annotationRenderer';
import { BackgroundProcessor } from './backgroundEffects';
import { WebcamBackground } from '../../../shared/types';

export interface CompositionEngineOptions {
  width: number;
  height: number;
  fps: number;
}


// KLH brand palette: maroon from the wordmark, accent stripe from the multicolour "H"
const BRAND_MAROON = '#9B2B2A';
const BRAND_MAROON_DARK = '#7A1F22';
const BRAND_ACCENTS = ['#F28C28', '#E6007E', '#29ABE2', '#8CC63F'];
const OVERLAY_FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
  return t + '\u2026';
}

// Even when nothing changes, emit a frame this often so recorders/streams keep a live timeline
const HEARTBEAT_MS = 1000;

export class CompositionEngine {
  private width: number;
  private height: number;
  private fps: number;

  public canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isRunning: boolean = false;

  // A single setInterval drives composition. With the backgrounding flags set in main, it keeps
  // running when the window is minimized or occluded, so a second rAF loop is unnecessary.
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = 0;
  private lastRenderTime: number = 0;

  // Dirty tracking: only redraw + emit a frame when some input actually produced new pixels.
  // A static desktop then costs almost nothing to record (the encoder sees far fewer frames).
  private dirty: boolean = true;
  private captureTrack: CanvasCaptureMediaStreamTrack | null = null;

  // Real-time FPS and dropped frame measurement (based on scheduler ticks, not emitted frames)
  private frameCount: number = 0;
  private measuredFps: number = 0;
  private fpsWindowStart: number = 0;
  private droppedFrames: number = 0;
  private renderedFrames: number = 0;

  // Video element cache for scene sources
  private videoElements: Map<string, HTMLVideoElement> = new Map();
  // Webcam background blur/replacement, per source
  private backgrounds = new Map<string, { effect: WebcamBackground; image: (CanvasImageSource & { width: number; height: number }) | null }>();
  private bgProcessors = new Map<string, BackgroundProcessor>();
  // MediaStreams for sources
  private sourceStreams: Map<string, MediaStream> = new Map();
  // Primary desktop screen video element reference for cross-scene fallback
  private primaryScreenVideo: HTMLVideoElement | null = null;

  // Active scene (sources pre-sorted by zIndex) & annotation canvas reference
  private activeScene: Scene | null = null;
  private sortedSources: SceneSource[] = [];
  private annotationCanvas: HTMLCanvasElement | null = null;
  private annotationHasContent: boolean = false;
  private laserPointsGetter: (() => LaserPoint[]) | null = null;
  private laserWasVisible: boolean = false;

  // Lecture branding overlays, pre-rendered to bitmaps and rebuilt only when their inputs change
  private lecture: LectureInfo | null = null;
  private logo: HTMLImageElement | null = null;
  private bannerCache: { key: string; canvas: HTMLCanvasElement | null } | null = null;
  // Height of the banner strip in the last frame; sources are laid out below it
  private contentTop = 0;
  private tagCache: { key: string; canvas: HTMLCanvasElement | null } | null = null;

  // Intro/outro clip currently replacing the scene (null when the live scene is shown)
  private clipVideo: HTMLVideoElement | null = null;

  // Mixed output stream
  private outputStream: MediaStream | null = null;

  // Low-end optimization toggle (Intel Core i3 mode)
  public lowEndOptimization: boolean = true;

  constructor(options: CompositionEngineOptions = { width: 1920, height: 1080, fps: 30 }) {
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });
    if (!context) throw new Error('Could not get 2D context for master canvas');
    this.ctx = context;
  }

  public setResolution(width: number, height: number, fps: number) {
    if (this.width === width && this.height === height && this.fps === fps) return;
    this.width = width;
    this.height = height;
    this.fps = fps;

    this.canvas.width = width;
    this.canvas.height = height;
    this.markDirty();

    // Restart timer with new interval
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  public markDirty() {
    this.dirty = true;
  }

  public setAnnotationSource(canvas: HTMLCanvasElement | null, getLaserPoints: () => LaserPoint[]) {
    this.annotationCanvas = canvas;
    this.laserPointsGetter = getLaserPoints;
    this.markDirty();
  }

  /** Call whenever annotation strokes change; skips compositing an empty 1080p layer every frame. */
  public setAnnotationHasContent(hasContent: boolean) {
    this.annotationHasContent = hasContent;
    this.markDirty();
  }

  public setLectureOverlay(info: LectureInfo | null, logo?: HTMLImageElement | null) {
    this.lecture = info;
    if (logo !== undefined) this.logo = logo;
    this.markDirty();
  }

  /**
   * Show a clip full-frame (intro/outro) instead of the live scene until it ends. It goes through
   * the same canvas as everything else, so recordings need no post-processing to include it.
   */
  public playClip(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (this.clipVideo === video) this.clipVideo = null;
        this.markDirty();
        resolve();
      };
      video.addEventListener('ended', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
      // Safety net in case 'ended' never fires (corrupt file, decoder stall)
      video.addEventListener('loadedmetadata', () => {
        const ms = (Number.isFinite(video.duration) ? video.duration : 600) * 1000 + 5000;
        timer = setTimeout(finish, ms);
      }, { once: true });

      this.clipVideo = video;
      this.watchVideoFrames(video);
      this.markDirty();
      video.play().catch(finish);
    });
  }

  public isPlayingClip(): boolean {
    return this.clipVideo !== null;
  }

  public setScene(scene: Scene) {
    this.activeScene = scene;
    this.sortedSources = [...scene.sources].sort((a, b) => a.zIndex - b.zIndex);
    this.markDirty();
  }

  // Attach a screen/window media stream to a source ID
  public async setSourceStream(sourceId: string, stream: MediaStream, isScreen: boolean = false) {
    const oldStream = this.sourceStreams.get(sourceId);
    this.detachVideo(sourceId);
    // Release the previous capture (camera/screen) unless the caller is re-attaching the same stream
    if (oldStream && oldStream !== stream) {
      oldStream.getVideoTracks().forEach((t) => t.stop());
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.watchVideoFrames(video);

    try {
      await video.play();
    } catch (e) {
      console.warn('Source video play error:', e);
    }

    this.videoElements.set(sourceId, video);
    this.sourceStreams.set(sourceId, stream);

    if (isScreen || sourceId.includes('screen') || sourceId.includes('Display')) {
      this.primaryScreenVideo = video;
    }
    this.markDirty();
  }

  public getSourceStream(sourceId: string): MediaStream | undefined {
    return this.sourceStreams.get(sourceId);
  }

  public hasSourceStream(sourceId: string): boolean {
    const s = this.sourceStreams.get(sourceId);
    return !!s && s.getVideoTracks().some((t) => t.readyState === 'live');
  }

  public removeSourceStream(sourceId: string) {
    this.detachVideo(sourceId);
    const stream = this.sourceStreams.get(sourceId);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      this.sourceStreams.delete(sourceId);
    }
    this.markDirty();
  }

  /** Blur or replace a webcam's background; pass null (or mode 'none') to turn it off. */
  public setSourceBackground(
    sourceId: string,
    effect: WebcamBackground | null,
    image: (CanvasImageSource & { width: number; height: number }) | null = null
  ) {
    if (!effect || effect.mode === 'none') {
      this.backgrounds.delete(sourceId);
      this.bgProcessors.get(sourceId)?.destroy();
      this.bgProcessors.delete(sourceId);
    } else {
      this.backgrounds.set(sourceId, { effect, image });
      this.bgProcessors.get(sourceId)?.setEffect(effect, image);
    }
    this.markDirty();
  }

  /** The processed webcam frame when a background effect is on and has produced output. */
  private backgroundFrame(sourceId: string, video: HTMLVideoElement): HTMLCanvasElement | null {
    const bg = this.backgrounds.get(sourceId);
    if (!bg) return null;
    let proc = this.bgProcessors.get(sourceId);
    if (!proc || proc.video !== video) {
      proc?.destroy();
      proc = new BackgroundProcessor(video, () => this.markDirty());
      proc.setEffect(bg.effect, bg.image);
      this.bgProcessors.set(sourceId, proc);
    }
    return proc.ready ? proc.canvas : null;
  }

  private detachVideo(sourceId: string) {
    this.bgProcessors.get(sourceId)?.destroy();
    this.bgProcessors.delete(sourceId);
    const video = this.videoElements.get(sourceId);
    if (!video) return;
    try {
      video.pause();
      video.srcObject = null;
    } catch {}
    if (this.primaryScreenVideo === video) this.primaryScreenVideo = null;
    this.videoElements.delete(sourceId);
  }

  // requestVideoFrameCallback fires once per genuinely new decoded frame (verified to keep firing
  // for off-DOM videos and while the window is minimized), so it is an exact "dirty" signal.
  private watchVideoFrames(video: HTMLVideoElement) {
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (typeof v.requestVideoFrameCallback !== 'function') {
      (video as any)._alwaysDirty = true;
      return;
    }
    const onFrame = () => {
      if (video !== this.clipVideo && !this.isAttachedVideo(video)) return; // detached: stop watching
      this.dirty = true;
      v.requestVideoFrameCallback!(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  }

  private isAttachedVideo(video: HTMLVideoElement): boolean {
    for (const v of this.videoElements.values()) if (v === video) return true;
    return false;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickTime = performance.now();
    this.fpsWindowStart = performance.now();
    this.frameCount = 0;
    this.dirty = true;

    this.intervalTimer = setInterval(() => this.tickFrame(), 1000 / this.fps);
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private tickFrame() {
    if (!this.isRunning) return;
    const now = performance.now();
    const delta = now - this.lastTickTime;
    const targetInterval = 1000 / this.fps;

    // Detect dropped frames if the scheduler fell behind by more than 1.7x the target interval
    if (this.lastTickTime > 0 && delta > targetInterval * 1.7) {
      const missed = Math.floor(delta / targetInterval) - 1;
      this.droppedFrames += Math.max(1, missed);
    }

    this.lastTickTime = now;
    this.frameCount++;

    // Calculate real measured FPS over 1-second rolling window
    if (now - this.fpsWindowStart >= 1000) {
      this.measuredFps = Math.round((this.frameCount * 1000) / (now - this.fpsWindowStart));
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }

    const laserPoints = this.laserPointsGetter ? this.laserPointsGetter() : [];
    // Laser trails fade over time, so they need redraws while visible plus one to clear them
    const laserActive = laserPoints.length > 0;
    if (laserActive || this.laserWasVisible) this.dirty = true;
    this.laserWasVisible = laserActive;

    if (!this.dirty && this.hasAlwaysDirtyVideo()) this.dirty = true;
    if (!this.dirty && now - this.lastRenderTime < HEARTBEAT_MS) return;

    this.dirty = false;
    this.lastRenderTime = now;
    this.renderedFrames++;
    this.renderFrame(laserPoints);
    this.captureTrack?.requestFrame();
  }

  private hasAlwaysDirtyVideo(): boolean {
    for (const v of this.videoElements.values()) {
      if ((v as any)._alwaysDirty) return true;
    }
    return false;
  }

  private renderFrame(laserPoints: LaserPoint[]) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Clear backdrop with sleek dark studio background
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, w, h);

    // Intro/outro clip replaces the whole frame (letterboxed), without overlays or annotations
    if (this.clipVideo) {
      const v = this.clipVideo;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (v.readyState >= 2 && v.videoWidth > 0) {
        const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
        const dw = v.videoWidth * scale;
        const dh = v.videoHeight * scale;
        ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        this.dirty = true;
      }
      return;
    }

    if (!this.activeScene) return;

    // The lecture banner gets its own strip at the top; the scene is laid out in the area below it
    // so the banner never hides the top of the screen
    const banner = this.getBanner(w, h);
    this.contentTop = banner ? banner.height : 0;

    // 2. Render each visible source (pre-sorted by zIndex in setScene)
    for (const source of this.sortedSources) {
      if (!source.visible) continue;

      const { x: sx, y: sy, w: sw, h: sh } = this.sourceRect(source, w, h);

      const opacity = source.opacity ?? 1.0;
      const rounded = !!source.borderRadius && source.borderRadius > 0;
      // save/restore is only needed when we change clip or shadow state
      const needsState = rounded || source.type === 'text';
      if (needsState) ctx.save();
      ctx.globalAlpha = opacity;

      // Rounded corners clipping if specified
      if (rounded) {
        const radius = (source.borderRadius! / 100) * Math.min(sw, sh);
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, radius);
        ctx.clip();
      }

      if (source.type === 'color' && source.color) {
        ctx.fillStyle = source.color;
        ctx.fillRect(sx, sy, sw, sh);
      } else if (source.type === 'text' && source.text) {
        ctx.font = `bold ${source.fontSize || 40}px Inter, sans-serif`;
        ctx.fillStyle = source.fontColor || '#ffffff';
        if (!this.lowEndOptimization) {
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 8;
        }
        ctx.fillText(source.text, sx + 20, sy + sh / 2);
      } else {
        // Render video element (Screen or Webcam)
        let video = this.videoElements.get(source.id);
        if ((!video || video.readyState < 2) && (source.type === 'screen' || source.type === 'window')) {
          if (this.primaryScreenVideo && this.primaryScreenVideo.readyState >= 2 && !this.primaryScreenVideo.paused) {
            video = this.primaryScreenVideo;
          }
        }

        if (video && video.readyState >= 2 && !video.paused) {
          if ((source.type === 'screen' || source.type === 'window') && video.videoWidth > 0 && video.videoHeight > 0) {
            // Keep the screen's aspect ratio (it no longer matches once the banner takes its strip)
            const scale = Math.min(sw / video.videoWidth, sh / video.videoHeight);
            const dw = video.videoWidth * scale;
            const dh = video.videoHeight * scale;
            ctx.drawImage(video, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
          } else {
            const processed = source.type === 'webcam' ? this.backgroundFrame(source.id, video) : null;
            ctx.drawImage(processed ?? video, sx, sy, sw, sh);
          }
        } else {
          // Placeholder card when stream not yet connected
          ctx.fillStyle = '#181b24';
          ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeStyle = '#2b3040';
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, sw, sh);

          ctx.fillStyle = '#64748b';
          ctx.font = '16px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Connecting: ${source.name}...`, sx + sw / 2, sy + sh / 2);
          ctx.textAlign = 'start';
          // Keep polling until the stream connects
          this.dirty = true;
        }
      }

      if (needsState) ctx.restore();
      else ctx.globalAlpha = 1;
    }

    // 3. Lecture branding: name tag under the webcam, then the top banner
    this.drawLectureOverlays(ctx, w, h, banner);

    // 4. Composite Annotation Layer directly into the frame (skipped while empty)
    if (this.annotationCanvas && this.annotationHasContent) {
      ctx.drawImage(this.annotationCanvas, 0, 0, w, h);
    }

    // 5. Render Laser pointer trails if active
    if (laserPoints.length > 0) drawLaser(ctx, laserPoints, 24);
  }

  /** Height of the lecture banner strip; scene sources are laid out below it. */
  public getContentTop(): number {
    return this.getBanner(this.width, this.height)?.height ?? 0;
  }

  /** Where a source lands on the canvas: its percentages apply to the area below the banner. */
  private sourceRect(source: SceneSource, w: number, h: number) {
    const top = this.contentTop;
    const areaH = h - top;
    return {
      x: (source.x / 100) * w,
      y: top + (source.y / 100) * areaH,
      w: (source.width / 100) * w,
      h: (source.height / 100) * areaH,
    };
  }

  private drawLectureOverlays(ctx: CanvasRenderingContext2D, w: number, h: number, banner: HTMLCanvasElement | null) {
    const tag = this.getNameTag(w, h);
    if (tag) {
      // Attach to the top-most visible webcam: centred just below it, or inside its bottom edge
      // when there is no room below. Without a webcam it becomes a lower-third at bottom-left.
      let cam: SceneSource | null = null;
      for (const s of this.sortedSources) if (s.visible && s.type === 'webcam') cam = s;
      const gap = Math.round(h * 0.008);
      let x: number;
      let y: number;
      if (cam) {
        const r = this.sourceRect(cam, w, h);
        const cx = r.x;
        const cw = r.w;
        const bottom = r.y + r.h;
        x = Math.min(Math.max(0, cx + (cw - tag.width) / 2), w - tag.width);
        y = bottom + gap + tag.height <= h ? bottom + gap : bottom - gap - tag.height;
      } else {
        x = Math.round(w * 0.025);
        y = h - tag.height - Math.round(h * 0.04);
      }
      ctx.drawImage(tag, Math.round(x), Math.round(y));
    }

    if (banner) ctx.drawImage(banner, 0, 0);
  }

  private getBanner(w: number, h: number): HTMLCanvasElement | null {
    const info = this.lecture;
    const name = info?.professorName.trim() || '';
    const subject = info?.subject.trim() || '';
    const logoReady = !!this.logo && this.logo.complete && this.logo.naturalWidth > 0;
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const key = [info?.showBanner, w, h, name, subject, date, logoReady].join('|');
    if (this.bannerCache?.key === key) return this.bannerCache.canvas;

    let canvas: HTMLCanvasElement | null = null;
    if (info?.showBanner && (name || subject)) {
      const bh = Math.round(h * 0.085);
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = bh;
      const g = canvas.getContext('2d')!;

      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, BRAND_MAROON_DARK);
      grad.addColorStop(0.55, BRAND_MAROON);
      grad.addColorStop(1, 'rgba(155, 43, 42, 0.88)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, bh);

      const stripe = Math.max(2, Math.round(bh * 0.06));
      const seg = w / BRAND_ACCENTS.length;
      BRAND_ACCENTS.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(Math.floor(i * seg), bh - stripe, Math.ceil(seg) + 1, stripe);
      });

      const inner = bh - stripe;
      const pad = Math.round(inner * 0.14);
      let x = pad;

      if (logoReady) {
        const logo = this.logo!;
        const cardH = inner - pad * 2;
        const cardPad = Math.round(cardH * 0.08);
        const logoH = cardH - cardPad * 2;
        const logoW = (logoH * logo.naturalWidth) / logo.naturalHeight;
        const cardW = logoW + cardPad * 2;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.roundRect(x, pad, cardW, cardH, Math.round(cardH * 0.12));
        g.fill();
        g.drawImage(logo, x + cardPad, pad + cardPad, logoW, logoH);
        x += cardW + pad * 1.5;
      }

      g.font = `500 ${Math.round(inner * 0.24)}px ${OVERLAY_FONT}`;
      const dateW = g.measureText(date).width;
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      g.fillText(date, w - pad * 1.5, inner / 2);

      g.textAlign = 'left';
      const maxText = w - x - dateW - pad * 4;
      const nameFont = `700 ${Math.round(inner * 0.34)}px ${OVERLAY_FONT}`;
      const subjectFont = `500 ${Math.round(inner * 0.25)}px ${OVERLAY_FONT}`;
      if (name && subject) {
        g.font = nameFont;
        g.fillStyle = '#ffffff';
        g.fillText(ellipsize(g, name, maxText), x, inner * 0.36);
        g.font = subjectFont;
        g.fillStyle = '#F6DADA';
        g.fillText(ellipsize(g, subject, maxText), x, inner * 0.74);
      } else {
        g.font = nameFont;
        g.fillStyle = '#ffffff';
        g.fillText(ellipsize(g, name || subject, maxText), x, inner / 2);
      }
    }

    this.bannerCache = { key, canvas };
    return canvas;
  }

  private getNameTag(w: number, h: number): HTMLCanvasElement | null {
    const info = this.lecture;
    const name = info?.professorName.trim() || '';
    const key = [info?.showNameTag, w, h, name].join('|');
    if (this.tagCache?.key === key) return this.tagCache.canvas;

    let canvas: HTMLCanvasElement | null = null;
    if (info?.showNameTag && name) {
      const th = Math.round(h * 0.045);
      const font = `700 ${Math.round(th * 0.48)}px ${OVERLAY_FONT}`;
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = font;
      const bar = Math.max(3, Math.round(th * 0.12));
      const padX = Math.round(th * 0.45);
      const maxW = Math.round(w * 0.4);
      const textW = Math.min(measure.measureText(name).width, maxW - bar - padX * 2);

      canvas = document.createElement('canvas');
      canvas.width = Math.ceil(textW + bar + padX * 2);
      canvas.height = th;
      const g = canvas.getContext('2d')!;

      g.beginPath();
      g.roundRect(0, 0, canvas.width, th, Math.round(th * 0.18));
      g.clip();
      g.fillStyle = BRAND_MAROON;
      g.fillRect(0, 0, canvas.width, th);
      const seg = th / BRAND_ACCENTS.length;
      BRAND_ACCENTS.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(0, Math.floor(i * seg), bar, Math.ceil(seg) + 1);
      });

      g.font = font;
      g.fillStyle = '#ffffff';
      g.textBaseline = 'middle';
      g.fillText(ellipsize(g, name, textW), bar + padX, th / 2 + 1);
    }

    this.tagCache = { key, canvas };
    return canvas;
  }

  // Get master video + audio stream
  public getCombinedStream(audioStream: MediaStream | null): MediaStream {
    if (!this.outputStream) {
      // frameRate 0 = frames are pushed explicitly via requestFrame() after each real render,
      // so the stream carries exactly the frames we composed (no duplicates, no aliasing).
      this.outputStream = this.canvas.captureStream(0);
      this.captureTrack = (this.outputStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack) || null;
      this.markDirty();
    }

    // Synchronize audio tracks
    const currentAudioTracks = this.outputStream.getAudioTracks();
    currentAudioTracks.forEach(t => {
      this.outputStream?.removeTrack(t);
    });

    if (audioStream) {
      audioStream.getAudioTracks().forEach(track => {
        this.outputStream?.addTrack(track);
      });
    }

    return this.outputStream;
  }

  public getMeasuredFps(): number {
    return this.measuredFps || this.fps;
  }

  public getDroppedFrames(): number {
    return this.droppedFrames;
  }

  /** Frames actually composed so far (lower than ticks when the picture is static). */
  public getRenderedFrames(): number {
    return this.renderedFrames;
  }

  public getDimensions(): { width: number; height: number; fps: number } {
    return { width: this.width, height: this.height, fps: this.fps };
  }

  public destroy() {
    this.stop();
    this.bgProcessors.forEach((p) => p.destroy());
    this.bgProcessors.clear();
    this.clipVideo = null;
    this.videoElements.forEach(v => {
      try {
        v.pause();
        v.srcObject = null;
      } catch {}
    });
    this.videoElements.clear();
    this.primaryScreenVideo = null;
    this.sourceStreams.forEach(s => {
      s.getTracks().forEach(t => t.stop());
    });
    this.sourceStreams.clear();
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(t => t.stop());
      this.outputStream = null;
      this.captureTrack = null;
    }
  }
}
