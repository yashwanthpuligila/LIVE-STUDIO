import { Scene, SceneSource } from '../../../shared/types';

export interface CompositionEngineOptions {
  width: number;
  height: number;
  fps: number;
}

export class CompositionEngine {
  private width: number;
  private height: number;
  private fps: number;

  public canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isRunning: boolean = false;

  // Dual-Timer handles to ensure continuous background capture
  private intervalTimer: any = null;
  private animId: number | null = null;
  private lastFrameTime: number = 0;

  // Real-time FPS and dropped frame measurement
  private frameCount: number = 0;
  private measuredFps: number = 0;
  private fpsWindowStart: number = 0;
  private droppedFrames: number = 0;

  // Video element cache for scene sources
  private videoElements: Map<string, HTMLVideoElement> = new Map();
  // MediaStreams for sources
  private sourceStreams: Map<string, MediaStream> = new Map();
  // Primary desktop screen video element reference for cross-scene fallback
  private primaryScreenVideo: HTMLVideoElement | null = null;

  // Active scene & annotation canvas reference
  private activeScene: Scene | null = null;
  private annotationCanvas: HTMLCanvasElement | null = null;
  private laserPointsGetter: (() => { x: number; y: number; time: number }[]) | null = null;

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

    // If stream is active, re-create stream at new framerate
    if (this.outputStream) {
      // captureStream inherits new canvas dimensions
    }

    // Restart timer with new interval
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  public setAnnotationSource(
    canvas: HTMLCanvasElement | null,
    getLaserPoints: () => { x: number; y: number; time: number }[]
  ) {
    this.annotationCanvas = canvas;
    this.laserPointsGetter = getLaserPoints;
  }

  public setScene(scene: Scene) {
    this.activeScene = scene;
  }

  // Attach a screen/window media stream to a source ID
  public async setSourceStream(sourceId: string, stream: MediaStream, isScreen: boolean = false) {
    // Clean up old video element if any
    const oldVideo = this.videoElements.get(sourceId);
    if (oldVideo) {
      try {
        oldVideo.pause();
        oldVideo.srcObject = null;
      } catch {}
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    
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
  }

  public getSourceStream(sourceId: string): MediaStream | undefined {
    return this.sourceStreams.get(sourceId);
  }

  public removeSourceStream(sourceId: string) {
    const video = this.videoElements.get(sourceId);
    if (video) {
      video.pause();
      video.srcObject = null;
      this.videoElements.delete(sourceId);
    }
    const stream = this.sourceStreams.get(sourceId);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      this.sourceStreams.delete(sourceId);
    }
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = performance.now();
    this.frameCount = 0;

    const frameIntervalMs = 1000 / this.fps;

    // 1. Primary continuous timer: setInterval ensures background execution
    // when window is minimized or occluded on Windows!
    this.intervalTimer = setInterval(() => {
      if (!this.isRunning) return;
      this.tickFrame();
    }, frameIntervalMs);

    // 2. Secondary animation frame hook for smooth frontmost preview rendering
    const rafLoop = () => {
      if (!this.isRunning) return;
      // If interval already rendered this tick, skip to prevent double rendering
      const now = performance.now();
      if (now - this.lastFrameTime >= frameIntervalMs * 0.85) {
        this.tickFrame();
      }
      this.animId = requestAnimationFrame(rafLoop);
    };

    this.animId = requestAnimationFrame(rafLoop);
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  private tickFrame() {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    const targetInterval = 1000 / this.fps;

    // Detect dropped frames if delta exceeded 1.7x target interval
    if (this.lastFrameTime > 0 && delta > targetInterval * 1.7) {
      const missed = Math.floor(delta / targetInterval) - 1;
      this.droppedFrames += Math.max(1, missed);
    }

    this.lastFrameTime = now;
    this.frameCount++;

    // Calculate real measured FPS over 1-second rolling window
    if (now - this.fpsWindowStart >= 1000) {
      this.measuredFps = Math.round((this.frameCount * 1000) / (now - this.fpsWindowStart));
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }

    this.renderFrame();
  }

  private renderFrame() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Clear backdrop with sleek dark studio background
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, w, h);

    if (!this.activeScene) return;

    // Sort sources by zIndex ascending
    const sources = [...this.activeScene.sources].sort((a, b) => a.zIndex - b.zIndex);

    // 2. Render each visible source
    for (const source of sources) {
      if (!source.visible) continue;

      const sx = (source.x / 100) * w;
      const sy = (source.y / 100) * h;
      const sw = (source.width / 100) * w;
      const sh = (source.height / 100) * h;

      ctx.save();
      ctx.globalAlpha = source.opacity ?? 1.0;

      // Rounded corners clipping if specified
      if (source.borderRadius && source.borderRadius > 0) {
        const radius = (source.borderRadius / 100) * Math.min(sw, sh);
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
          ctx.drawImage(video, sx, sy, sw, sh);
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
        }
      }

      ctx.restore();
    }

    // 3. Composite Annotation Layer directly into the frame!
    if (this.annotationCanvas) {
      ctx.drawImage(this.annotationCanvas, 0, 0, w, h);
    }

    // 4. Render Laser pointer trails if active
    if (this.laserPointsGetter) {
      const points = this.laserPointsGetter();
      const now = Date.now();
      for (const pt of points) {
        const age = now - pt.time;
        const alpha = Math.max(0, 1 - age / 500);

        const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, 24);
        grad.addColorStop(0, `rgba(239, 68, 68, ${alpha})`);
        grad.addColorStop(0.5, `rgba(239, 68, 68, ${alpha * 0.4})`);
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Get master video + audio stream
  public getCombinedStream(audioStream: MediaStream | null): MediaStream {
    if (!this.outputStream) {
      this.outputStream = this.canvas.captureStream(this.fps);
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

  public getDimensions(): { width: number; height: number; fps: number } {
    return { width: this.width, height: this.height, fps: this.fps };
  }

  public destroy() {
    this.stop();
    this.videoElements.forEach(v => {
      try {
        v.pause();
        v.srcObject = null;
      } catch {}
    });
    this.videoElements.clear();
    this.sourceStreams.forEach(s => {
      s.getTracks().forEach(t => t.stop());
    });
    this.sourceStreams.clear();
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(t => t.stop());
      this.outputStream = null;
    }
  }
}
