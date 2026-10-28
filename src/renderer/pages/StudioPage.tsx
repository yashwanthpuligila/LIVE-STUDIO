import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Radio,
  Pause,
  Play,
  Square,
  Settings,
  Film,
  Layers,
  Sliders,
  Monitor,
  Camera,
  Type,
  HardDrive,
  Cpu,
  RefreshCw,
  Activity,
  Zap,
  CheckCircle,
  PenTool,
} from 'lucide-react';
import {
  AppSettings,
  BrandClipKind,
  BrandingInfo,
  DesktopSource,
  LectureInfo,
  PerformanceMetrics,
  RecordingItem,
  RecordingStatus,
  Scene,
  SceneSource,
  StreamConfig,
  StreamStats,
  StreamStatus,
} from '../../shared/types';
import { CompositionEngine } from '../studio/engine/CompositionEngine';
import { createRecorder, pipeRecorderChunks } from '../studio/engine/recorderUtils';
import { useAnnotationEngine } from '../annotations/useAnnotationEngine';
import { AnnotationToolbar } from '../annotations/AnnotationToolbar';
import { AnnotationOverlay } from '../annotations/AnnotationOverlay';
import { useAnnotationShortcuts } from '../annotations/useAnnotationShortcuts';
import { useAudioMixer } from '../studio/audio/useAudioMixer';
import { AudioMixerPanel } from '../studio/audio/AudioMixerPanel';
import { SceneListPanel } from '../scenes/SceneListPanel';
import { SourceListPanel } from '../scenes/SourceListPanel';
import { PropertiesPanel } from '../studio/PropertiesPanel';
import { SourcePickerModal } from '../studio/SourcePickerModal';
import { SourceTransformLayer } from '../studio/SourceTransformLayer';
import { loadBackgroundImage } from '../studio/engine/backgroundEffects';
import { YouTubeLiveModal } from '../studio/YouTubeLiveModal';
import { PerformancePanel } from '../studio/PerformancePanel';
import { LectureInfoPanel } from '../studio/LectureInfoPanel';
import { CameraPanel } from '../studio/CameraPanel';
import { MicrophonePanel } from '../studio/audio/MicrophonePanel';
import { resolveNoiseLevel } from '../studio/audio/noiseSuppression';
import { BrandMark } from '../components/BrandMark';
import klhLogoUrl from '../assets/klh-logo.png';

const DEFAULT_LECTURE: LectureInfo = { professorName: '', subject: '', showBanner: true, showNameTag: true };

interface StudioPageProps {
  onNavigateToRecordings: () => void;
  onNavigateToSettings: () => void;
}

export const StudioPage: React.FC<StudioPageProps> = ({
  onNavigateToRecordings,
  onNavigateToSettings,
}) => {
  // --- Composition Engine & Preview Host ---
  // The engine's canvas is mounted directly as the preview (no captureStream -> <video> round trip)
  const previewHostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CompositionEngine | null>(null);

  // --- Persistent Settings ---
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Latest settings for async callbacks that would otherwise capture a stale (null) value
  const settingsRef = useRef<AppSettings | null>(null);
  settingsRef.current = settings;

  // --- Scenes & Sources State ---
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string>('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string>('Entire Display');

  // --- Video & Audio Devices ---
  const [videoDevices, setVideoDevices] = useState<{ deviceId: string; label: string }[]>([]);

  // --- Audio Mixer Hook ---
  const {
    micDevices,
    selectedMicId,
    setSelectedMicId,
    micState,
    setMicVolume,
    toggleMicMute,
    desktopState,
    setDesktopVolume,
    toggleDesktopMute,
    attachDesktopAudioStream,
    readLevels,
    playClipAudio,
    masterAudioStream,
    noiseStatus,
  } = useAudioMixer({
    noiseLevel: resolveNoiseLevel(settings),
    echoCancellation: settings?.echoCancellation,
    autoGainControl: settings?.autoGainControl ?? true,
  });

  // Microphone card: apply immediately and save
  const updateAudioSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    window.electronAPI?.settings.update(partial);
  };

  // --- Annotation Hook ---
  const {
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    opacity,
    isAnnotationEnabled,
    setIsAnnotationEnabled,
    elements,
    addElement,
    undo,
    redo,
    canUndo,
    canRedo,
    clearAll,
    beginErase,
    eraseElements,
    endErase,
    offscreenCanvas,
    updateLaser,
    getActiveLaserPoints,
  } = useAnnotationEngine(1920, 1080);

  // Tool keys (P, H, E...) and Ctrl+Z / Ctrl+Y for the preview drawing layer
  useAnnotationShortcuts({
    onTool: (tool) => {
      setActiveTool(tool);
      if (tool !== 'select') setIsAnnotationEnabled(true);
    },
    onUndo: undo,
    onRedo: redo,
    onEscape: () => setActiveTool('select'),
  });

  // --- Recording State ---
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [lastSavedRecording, setLastSavedRecording] = useState<RecordingItem | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const stopRecorderRef = useRef<(() => Promise<void>) | null>(null);
  const recTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Streaming State ---
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [streamStats, setStreamStats] = useState<StreamStats>({
    fps: 0,
    bitrateKbps: 0,
    totalBytes: 0,
    droppedFrames: 0,
    uptimeSec: 0,
  });
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamRecorderRef = useRef<MediaRecorder | null>(null);
  const stopStreamRecorderRef = useRef<(() => Promise<void>) | null>(null);

  // --- Lecture branding ---
  const lectureInfo = settings?.lectureInfo ?? DEFAULT_LECTURE;
  const logoRef = useRef<HTMLImageElement | null>(null);
  const lectureSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [branding, setBranding] = useState<BrandingInfo | null>(null);
  const clipUrlsRef = useRef<Map<BrandClipKind, string>>(new Map());
  // Intro/outro currently playing into the recording; record controls are locked meanwhile
  const [clipPhase, setClipPhase] = useState<BrandClipKind | null>(null);

  // Mirror recording state to the floating toolbar, and accept its start/pause/resume/stop buttons
  useEffect(() => {
    window.electronAPI?.overlay.sendRecordingState({
      status: recordingStatus,
      durationSec: recordingDuration,
      locked: clipPhase !== null,
    });
  }, [recordingStatus, recordingDuration, clipPhase]);

  const recordingHandlersRef = useRef<Record<string, () => void>>({});
  useEffect(() => {
    return window.electronAPI?.overlay.onRecordingCommand((cmd) => recordingHandlersRef.current[cmd]?.());
  }, []);


  // Notice shown when the studio auto-adjusts quality to keep this machine smooth
  const [perfNotice, setPerfNotice] = useState<string | null>(null);

  // Draw-on-screen overlay (ink layer + floating toolbar) over the shared display
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [captureIsDisplay, setCaptureIsDisplay] = useState(false);
  const captureDisplayRef = useRef<{ isDisplay: boolean; displayId?: string }>({ isDisplay: false });
  const lowFpsStreakRef = useRef(0);
  const busyRef = useRef(false);
  busyRef.current = recordingStatus !== 'idle' || streamStatus !== 'idle';

  // --- Modals & Panels UI ---
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [diskSpace, setDiskSpace] = useState<{ free: string; total: string }>({ free: '50 GB', total: '250 GB' });

  // --- Real-time Performance Metrics (Phase 7) ---
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    selectedSource: 'Display 1: Entire Screen',
    capturedResolution: '1920x1080',
    outputResolution: '1920x1080 @ 30 FPS',
    currentCaptureFps: 30,
    targetFps: 30,
    droppedFrames: 0,
    cpuPercent: 12,
    processMemoryMb: 110,
    activeEncoder: 'Detecting...',
    hardwareAcceleration: true,
    recordingBitrateKbps: 5000,
    audioCaptureStatus: 'Active',
    fileSizeBytes: 0,
    writeErrors: 0,
    streamingStatus: 'idle',
  });

  const [lowEndOptimization, setLowEndOptimization] = useState<boolean>(true);

  // Initialize engine and load settings/scenes
  useEffect(() => {
    const engine = new CompositionEngine({ width: 1920, height: 1080, fps: 30 });
    engineRef.current = engine;
    engine.lowEndOptimization = lowEndOptimization;
    engine.canvas.className = 'w-full h-full object-contain pointer-events-none';
    const logo = new Image();
    logo.onload = () => engine.setLectureOverlay(settingsRef.current?.lectureInfo ?? DEFAULT_LECTURE, logo);
    logo.src = klhLogoUrl;
    logoRef.current = logo;
    previewHostRef.current?.appendChild(engine.canvas);
    engine.start();

    // Load initial settings and scenes from IPC
    if (window.electronAPI) {
      // Settings first, so the initial screen capture is requested at the right size/frame rate
      window.electronAPI.settings.get().then((s) => {
        settingsRef.current = s;
        setSettings(s);
        setLowEndOptimization(s.lowEndOptimization ?? true);
        engine.lowEndOptimization = s.lowEndOptimization ?? true;
        engine.setResolution(s.width || 1920, s.height || 1080, s.fps || 30);
        return window.electronAPI.scenes.getAll();
      }).then(async (sc) => {
        setScenes(sc);
        if (sc.length > 0) {
          setActiveSceneId(sc[0].id);
          scenesRef.current = sc;
          activeSceneIdRef.current = sc[0].id;
          engine.setScene(sc[0]);
        }

        // AUTO-INITIALIZE PRIMARY DISPLAY CAPTURE ON STARTUP (Fix for Phase 1 & 2!)
        try {
          const primarySource = await window.electronAPI.screenCapture.getPrimarySource();
          if (primarySource) {
            console.log('[Studio] Auto-capturing primary desktop display:', primarySource.name);
            await handleSelectDesktopSource(primarySource);
          }
        } catch (e) {
          console.warn('[Studio] Auto-capture primary display notice:', e);
        }
      });

      window.electronAPI.branding.getInfo().then(setBranding).catch(() => undefined);

      window.electronAPI.system.getDiskSpace().then((space) => {
        const freeGb = (space.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        const totalGb = (space.totalBytes / (1024 * 1024 * 1024)).toFixed(0);
        setDiskSpace({ free: `${freeGb} GB`, total: `${totalGb} GB` });
      });

      // Streaming listeners
      const unsubStatus = window.electronAPI.streaming.onStatusChanged((data) => {
        setStreamStatus(data.status);
        if (data.error) setStreamError(data.error);
      });
      const unsubStats = window.electronAPI.streaming.onStats((stats) => {
        setStreamStats(stats);
      });

      return () => {
        unsubStatus();
        unsubStats();
        clipUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        clipUrlsRef.current.clear();
        engine.canvas.remove();
        engine.destroy();
      };
    }

    return () => {
      engine.canvas.remove();
      engine.destroy();
    };
  }, []);

  // Update annotation layer in engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setAnnotationSource(offscreenCanvas, getActiveLaserPoints);
    }
  }, [offscreenCanvas, getActiveLaserPoints]);

  // Only composite the annotation layer while it actually has strokes
  useEffect(() => {
    engineRef.current?.setAnnotationHasContent(elements.length > 0);
  }, [elements]);

  // Push lecture banner / name tag text into the composition
  useEffect(() => {
    engineRef.current?.setLectureOverlay(lectureInfo, logoRef.current);
  }, [lectureInfo]);

  const updateLectureInfo = (partial: Partial<LectureInfo>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...(prev.lectureInfo ?? DEFAULT_LECTURE), ...partial };
      // Debounced so typing doesn't write the settings file on every keystroke
      if (lectureSaveTimerRef.current) clearTimeout(lectureSaveTimerRef.current);
      lectureSaveTimerRef.current = setTimeout(() => window.electronAPI?.settings.update({ lectureInfo: next }), 500);
      return { ...prev, lectureInfo: next };
    });
  };

  // Plays the admin-configured intro/outro through the composition (video) and mixer (audio)
  const playBrandClip = async (kind: BrandClipKind) => {
    const engine = engineRef.current;
    if (!engine || !branding?.[kind]) return;
    let url = clipUrlsRef.current.get(kind);
    if (!url) {
      const data = await window.electronAPI.branding.readClip(kind);
      if (!data) return;
      url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
      clipUrlsRef.current.set(kind, url);
    }
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const restoreAudio = playClipAudio(video);
    try {
      await engine.playClip(video);
    } finally {
      restoreAudio();
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };

  // Enumerate video cameras
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const cams = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 5)}`,
        }));
      setVideoDevices(cams);
    });
  }, []);

  // Active Scene helper
  const activeScene = scenes.find((s) => s.id === activeSceneId) || null;
  // Latest scenes for async flows (startup auto-capture runs from the first render's closure,
  // where `scenes` is still empty - previously the screen was then never attached)
  const scenesRef = useRef<Scene[]>(scenes);
  scenesRef.current = scenes;
  const activeSceneIdRef = useRef(activeSceneId);
  activeSceneIdRef.current = activeSceneId;

  // When active scene changes, inform composition engine
  useEffect(() => {
    if (activeScene && engineRef.current) {
      engineRef.current.setScene(activeScene);
    }
  }, [activeScene]);

  // Webcam background blur / replacement
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !activeScene) return;
    let cancelled = false;
    for (const s of activeScene.sources) {
      if (s.type !== 'webcam') continue;
      const bg = s.background;
      if (!bg || bg.mode === 'none') engine.setSourceBackground(s.id, null);
      else if (bg.mode === 'blur') engine.setSourceBackground(s.id, bg);
      else loadBackgroundImage(bg.image).then((img) => !cancelled && engine.setSourceBackground(s.id, bg, img));
    }
    return () => {
      cancelled = true;
    };
  }, [activeScene]);

  // Connect webcam streams for the active scene. Previously every scene edit (e.g. dragging an
  // opacity slider) re-opened every camera and leaked the old streams; now a camera is opened once
  // per source+device and released when it is hidden, removed, or its scene is switched away.
  const webcamDeviceRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const engine = engineRef.current;
    if (!activeScene || !engine) return;
    const camSources = activeScene.sources.filter((s) => s.type === 'webcam' && s.visible);
    const wanted = new Set(camSources.map((s) => s.id));

    for (const id of [...webcamDeviceRef.current.keys()]) {
      if (!wanted.has(id)) {
        engine.removeSourceStream(id);
        webcamDeviceRef.current.delete(id);
      }
    }

    const lowTier = settingsRef.current?.hardwareTier === 'low';
    const camFps = Math.min(30, engine.getDimensions().fps);

    camSources.forEach(async (source) => {
      const deviceKey = source.deviceId || 'default';
      if (webcamDeviceRef.current.get(source.id) === deviceKey) return; // already open or opening
      webcamDeviceRef.current.set(source.id, deviceKey);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: source.deviceId ? { exact: source.deviceId } : undefined,
            // A picture-in-picture overlay never needs more than 720p; low-end machines get 360p
            width: { ideal: lowTier ? 640 : 1280 },
            height: { ideal: lowTier ? 360 : 720 },
            frameRate: { ideal: camFps, max: camFps },
          },
          audio: false,
        });
        if (webcamDeviceRef.current.get(source.id) !== deviceKey) {
          stream.getTracks().forEach((t) => t.stop()); // source changed/removed while opening
          return;
        }
        engineRef.current?.setSourceStream(source.id, stream);
      } catch (err) {
        webcamDeviceRef.current.delete(source.id);
        console.warn('Could not acquire webcam stream for source', source.id, err);
      }
    });
  }, [activeScene]);

  // Real-time telemetry monitoring loop (Phase 7)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!window.electronAPI || !engineRef.current) return;

      try {
        const perf = await window.electronAPI.system.getPerformanceStats();
        const recStatus = await window.electronAPI.recording.getStatus();
        const measuredFps = engineRef.current.getMeasuredFps();
        const dropped = engineRef.current.getDroppedFrames();
        const dims = engineRef.current.getDimensions();

        setPerformanceMetrics((prev) => ({
          ...prev,
          selectedSource: activeSourceName,
          outputResolution: `${dims.width}x${dims.height} @ ${dims.fps} FPS`,
          currentCaptureFps: measuredFps,
          targetFps: dims.fps,
          droppedFrames: dropped,
          cpuPercent: perf.cpuPercent,
          processMemoryMb: perf.processMemoryMb,
          activeEncoder: perf.activeEncoder,
          hardwareAcceleration: perf.hardwareAcceleration,
          recordingBitrateKbps: settings?.videoBitrateKbps || 5000,
          audioCaptureStatus: micState.muted ? 'Muted' : 'Active',
          fileSizeBytes: recStatus.bytesWritten,
          writeErrors: recStatus.writeErrors,
          streamingStatus: streamStatus,
        }));

        // Adaptive quality: if the composition scheduler can't keep up for several seconds while
        // idle, step down (60->30 FPS, then 1080p->720p). Never changes settings mid-recording.
        const struggling = measuredFps < dims.fps * 0.8;
        lowFpsStreakRef.current = struggling && !busyRef.current ? lowFpsStreakRef.current + 1 : 0;
        const s = settingsRef.current;
        if (lowFpsStreakRef.current >= 6 && s) {
          lowFpsStreakRef.current = 0;
          let next: Partial<AppSettings> | null = null;
          if (dims.fps > 30) next = { fps: 30 };
          else if (dims.height > 720) next = { resolutionPreset: '720p', width: 1280, height: 720, videoBitrateKbps: Math.min(s.videoBitrateKbps, 3000) };

          if (next && s.recordingProfile !== 'custom') {
            const updated = { ...s, ...next };
            settingsRef.current = updated;
            setSettings(updated);
            window.electronAPI.settings.update(next);
            engineRef.current.setResolution(updated.width, updated.height, updated.fps);
            setPerfNotice(`Adjusted to ${updated.height}p ${updated.fps} FPS so this PC stays smooth`);
          } else if (next) {
            setPerfNotice('This PC is struggling with your custom quality. Lower resolution or FPS in Settings.');
          }
        }
      } catch {}
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSourceName, settings, micState.muted, streamStatus]);

  useEffect(() => {
    if (!perfNotice) return;
    const t = setTimeout(() => setPerfNotice(null), 8000);
    return () => clearTimeout(t);
  }, [perfNotice]);

  // ATTACH REAL DESKTOP MONITOR OR WINDOW STREAM (Phase 2 & Phase 3 Core Fix!)
  useEffect(() => {
    const api = window.electronAPI?.overlay;
    if (!api) return;
    api.isVisible().then(setOverlayVisible);
    const unsub = api.onVisibilityChanged(setOverlayVisible);
    return () => {
      unsub();
      api.hide();
    };
  }, []);

  const showScreenOverlay = () => {
    const capture = captureDisplayRef.current;
    if (capture.isDisplay) window.electronAPI?.overlay.show(capture.displayId);
  };

  const toggleScreenOverlay = () => {
    if (overlayVisible) window.electronAPI?.overlay.hide();
    else showScreenOverlay();
  };

  // fromPicker: the user chose this source, so bring up the on-screen drawing tools with it
  const handleSelectDesktopSource = async (source: DesktopSource, fromPicker = false) => {
    if (!engineRef.current) return;

    try {
      console.log(`[Screen Capture] Initializing capture for source: "${source.name}" (${source.id})`);
      setActiveSourceName(source.name);

      let stream: MediaStream | null = null;
      const { width: outW, height: outH, fps: outFps } = engineRef.current.getDimensions();
      const desktopConstraints = (id: string) => ({
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: id,
          maxWidth: outW,
          maxHeight: outH,
          maxFrameRate: outFps,
        },
      } as any);

      // When capturing an entire display monitor:
      if (source.isDisplay || source.id.startsWith('screen:')) {
        // Set the active display source in main process
        if (window.electronAPI) {
          await window.electronAPI.screenCapture.selectDisplay(source.id);
        }

        // Modern Electron getDisplayMedia with system audio loopback!
        // Capture no larger / faster than the output: on high-DPI laptop panels (e.g. 2880x1800)
        // Chromium then downscales in the capture pipeline instead of us drawing 4K frames each tick.
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { max: outW },
              height: { max: outH },
              frameRate: { ideal: outFps, max: outFps },
            },
            audio: settingsRef.current?.includeSystemAudio ?? true,
          });

          // Check if system audio loopback was captured
          if (stream.getAudioTracks().length > 0) {
            console.log('[Audio] System audio loopback stream successfully acquired!');
            attachDesktopAudioStream(stream);
          }
        } catch (displayMediaErr) {
          console.warn('[Screen Capture] getDisplayMedia fallback to getUserMedia:', displayMediaErr);
          // Fallback to getUserMedia with chromeMediaSource
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: desktopConstraints(source.id),
          });
        }
      } else {
        // Application window capture
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: desktopConstraints(source.id),
        });
      }

      if (!stream) {
        throw new Error('Could not acquire media stream for selected source');
      }

      // Read real captured resolution from video track
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack) {
        const settings = vTrack.getSettings();
        if (settings.width && settings.height) {
          setPerformanceMetrics((p) => ({
            ...p,
            capturedResolution: `${settings.width}x${settings.height}`,
          }));
        }
      }

      // Update scene sources: assign stream to primary screen source
      const latestScenes = scenesRef.current;
      const currentScene = latestScenes.find((s) => s.id === activeSceneIdRef.current) || latestScenes[0];
      if (currentScene) {
        let screenSource = currentScene.sources.find((s) => s.type === 'screen' || s.type === 'window');
        let updatedSources = [...currentScene.sources];

        if (screenSource) {
          screenSource.sourceId = source.id;
          screenSource.name = source.name;
          screenSource.type = source.isDisplay ? 'screen' : 'window';
        } else {
          const newSource: SceneSource = {
            id: `source_${Date.now()}`,
            name: source.name,
            type: source.isDisplay ? 'screen' : 'window',
            sourceId: source.id,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            zIndex: 1,
            visible: true,
            locked: true,
            opacity: 1,
          };
          updatedSources.unshift(newSource);
          screenSource = newSource;
        }

        const targetSourceId = screenSource.id;
        await engineRef.current.setSourceStream(
          targetSourceId,
          stream,
          source.isDisplay || source.id.startsWith('screen:')
        );

        const updatedScenes = latestScenes.map((sc) =>
          sc.id === currentScene.id ? { ...sc, sources: updatedSources } : sc
        );
        setScenes(updatedScenes);
        window.electronAPI?.scenes.save(updatedScenes);
      }

      // Screen drawing only works on whole displays: a window capture records just that window,
      // never the ink layer floating above it
      const isDisplay = !!(source.isDisplay || source.id.startsWith('screen:'));
      captureDisplayRef.current = { isDisplay, displayId: source.display_id };
      setCaptureIsDisplay(isDisplay);
      if (window.electronAPI) {
        if (!isDisplay) {
          window.electronAPI.overlay.hide();
          if (fromPicker) setPerfNotice('Drawing on screen needs an entire screen source. For a single window, draw on the preview.');
        } else if (fromPicker || (await window.electronAPI.overlay.isVisible())) {
          window.electronAPI.overlay.show(source.display_id);
        }
      }
    } catch (err: any) {
      console.error('[Screen Capture] Selection error:', err);
      alert(`Could not capture selected source: ${err.message}`);
    }
  };

  // --- Local Recording Actions ---
  const handleStartRecording = async () => {
    if (!engineRef.current || !window.electronAPI) return;
    try {
      const combined = engineRef.current.getCombinedStream(masterAudioStream);
      const dims = engineRef.current.getDimensions();
      const bitrateKbps = settings?.videoBitrateKbps || 5000;
      const { recorder: rec, codec } = createRecorder(combined, bitrateKbps);

      // 1. Notify Main process to prepare file writer
      await window.electronAPI.recording.start({
        outputDir: settings?.recordingDir,
        resolution: `${dims.width}x${dims.height}`,
        fps: dims.fps,
        videoCodec: codec,
        videoBitrateKbps: bitrateKbps,
        lectureTitle: { professorName: lectureInfo.professorName, subject: lectureInfo.subject },
      });

      // 2. Stream chunks to main in order; stopRecorderRef flushes the final chunk on stop
      stopRecorderRef.current = pipeRecorderChunks(rec, (buf) => window.electronAPI.recording.sendChunk(buf));
      rec.start(1000); // 1-second chunks
      mediaRecorderRef.current = rec;
      setRecordingStatus('recording');
      setRecordingDuration(0);

      // Start elapsed timer
      recTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Admin intro is recorded first, before the live scene
      if (branding?.intro) {
        setClipPhase('intro');
        try {
          await playBrandClip('intro');
        } finally {
          setClipPhase(null);
        }
      }

      // Recording a whole screen: make the on-screen drawing tools available
      showScreenOverlay();

      // If user enabled minimize on record to prevent infinity mirror / studio obstruction:
      if (settings?.minimizeOnRecord) {
        setTimeout(() => {
          window.electronAPI?.system.minimizeWindow();
        }, 500);
      }
    } catch (err: any) {
      setClipPhase(null);
      alert(`Failed to start recording: ${err.message}`);
    }
  };

  const handlePauseRecording = async () => {
    if (mediaRecorderRef.current && recordingStatus === 'recording') {
      mediaRecorderRef.current.pause();
      await window.electronAPI?.recording.pause();
      setRecordingStatus('paused');
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    }
  };

  const handleResumeRecording = async () => {
    if (mediaRecorderRef.current && recordingStatus === 'paused') {
      mediaRecorderRef.current.resume();
      await window.electronAPI?.recording.resume();
      setRecordingStatus('recording');
      recTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const handleStopRecording = async () => {
    if (!mediaRecorderRef.current || !window.electronAPI || clipPhase) return;

    // Admin outro is appended live: make sure the recorder is running, then play it to the end
    if (branding?.outro) {
      if (mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
        await window.electronAPI.recording.resume();
        setRecordingStatus('recording');
      }
      setClipPhase('outro');
      try {
        await playBrandClip('outro');
      } finally {
        setClipPhase(null);
      }
    }

    setRecordingStatus('processing');
    if (recTimerRef.current) clearInterval(recTimerRef.current);

    // Stop MediaRecorder and wait until its final chunk has reached the main process
    const stopRecorder = stopRecorderRef.current;
    mediaRecorderRef.current = null;
    stopRecorderRef.current = null;
    if (stopRecorder) await stopRecorder();

    // Restore window if minimized
    if (settings?.minimizeOnRecord) {
      window.electronAPI?.system.restoreWindow();
    }

    try {
      // Main process converts webm -> MP4 using hardware acceleration (QSV/MF) or x264
      const result = await window.electronAPI.recording.stop();
      setLastSavedRecording(result);
      setRecordingStatus('idle');
      setRecordingDuration(0);
    } catch (err: any) {
      alert(`Recording error: ${err.message}`);
      setRecordingStatus('idle');
    }
  };

  // Buttons on the floating screen toolbar call the same handlers as the studio controls
  recordingHandlersRef.current = {
    start: () => {
      if (recordingStatus === 'idle' && !clipPhase) handleStartRecording();
    },
    pause: handlePauseRecording,
    resume: handleResumeRecording,
    stop: () => {
      if (recordingStatus === 'recording' || recordingStatus === 'paused') handleStopRecording();
    },
  };

  // --- YouTube Live Streaming Actions ---
  const handleStartStream = async (config: StreamConfig) => {
    if (!engineRef.current || !window.electronAPI) return;
    setStreamError(null);

    try {
      const combined = engineRef.current.getCombinedStream(masterAudioStream);
      // Streaming above the composition frame rate would only make FFmpeg encode duplicate frames
      const outFps = engineRef.current.getDimensions().fps;
      const { recorder: strRec, codec } = createRecorder(combined, config.videoBitrate);

      await window.electronAPI.streaming.start({ ...config, fps: Math.min(config.fps, outFps), inputCodec: codec });

      stopStreamRecorderRef.current = pipeRecorderChunks(strRec, (buf) => window.electronAPI.streaming.sendChunk(buf));
      strRec.start(500); // 500ms low-latency chunks
      showScreenOverlay();
      streamRecorderRef.current = strRec;
      setStreamStatus('connecting');
    } catch (err: any) {
      setStreamError(err.message);
      setStreamStatus('error');
    }
  };

  const handleStopStream = async () => {
    const stopStreamRecorder = stopStreamRecorderRef.current;
    streamRecorderRef.current = null;
    stopStreamRecorderRef.current = null;
    if (stopStreamRecorder) await stopStreamRecorder();
    await window.electronAPI?.streaming.stop();
    setStreamStatus('idle');
  };

  // --- Scenes Management ---
  const handleSelectScene = (id: string) => {
    setActiveSceneId(id);
    const sc = scenes.find((s) => s.id === id);
    if (sc && engineRef.current) {
      engineRef.current.setScene(sc);
    }
  };

  const handleAddScene = (name: string) => {
    const newScene: Scene = {
      id: `scene_${Date.now()}`,
      name,
      isSelected: false,
      sources: [
        {
          id: `source_${Date.now()}`,
          name: 'Entire Display',
          type: 'screen',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          zIndex: 1,
          visible: true,
          locked: true,
          opacity: 1,
        },
      ],
    };
    const updated = [...scenes, newScene];
    setScenes(updated);
    setActiveSceneId(newScene.id);
    window.electronAPI?.scenes.save(updated);
  };

  const handleDuplicateScene = (id: string) => {
    const sc = scenes.find((s) => s.id === id);
    if (!sc) return;
    const dup: Scene = {
      ...sc,
      id: `scene_${Date.now()}`,
      name: `${sc.name} (Copy)`,
      sources: sc.sources.map((src) => ({ ...src, id: `source_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` })),
    };
    const updated = [...scenes, dup];
    setScenes(updated);
    window.electronAPI?.scenes.save(updated);
  };

  const handleRenameScene = (id: string, newName: string) => {
    const updated = scenes.map((s) => (s.id === id ? { ...s, name: newName } : s));
    setScenes(updated);
    window.electronAPI?.scenes.save(updated);
  };

  const handleDeleteScene = (id: string) => {
    if (scenes.length <= 1) return;
    const updated = scenes.filter((s) => s.id !== id);
    setScenes(updated);
    if (activeSceneId === id) {
      setActiveSceneId(updated[0].id);
    }
    window.electronAPI?.scenes.save(updated);
  };

  // --- Source Management ---
  const handleAddWebcamSource = () => {
    if (!activeScene) return;
    const newSource: SceneSource = {
      id: `webcam_${Date.now()}`,
      name: 'Webcam Overlay',
      type: 'webcam',
      x: 74,
      y: 66, // leaves room below for the professor name tag
      width: 24,
      height: 26,
      zIndex: activeScene.sources.length + 1,
      visible: true,
      locked: false,
      opacity: 1,
      borderRadius: 12,
    };
    const updatedSources = [...activeScene.sources, newSource];
    const updated = scenes.map((s) => (s.id === activeScene.id ? { ...s, sources: updatedSources } : s));
    setScenes(updated);
    setSelectedSourceId(newSource.id);
    window.electronAPI?.scenes.save(updated);
  };

  const handleAddTextSource = () => {
    if (!activeScene) return;
    const newSource: SceneSource = {
      id: `text_${Date.now()}`,
      name: 'Text Banner',
      type: 'text',
      text: 'Live Studio Presentation',
      fontSize: 48,
      fontColor: '#ffffff',
      x: 5,
      y: 5,
      width: 40,
      height: 10,
      zIndex: activeScene.sources.length + 1,
      visible: true,
      locked: false,
      opacity: 1,
    };
    const updatedSources = [...activeScene.sources, newSource];
    const updated = scenes.map((s) => (s.id === activeScene.id ? { ...s, sources: updatedSources } : s));
    setScenes(updated);
    setSelectedSourceId(newSource.id);
    window.electronAPI?.scenes.save(updated);
  };

  // persist=false while dragging a webcam on the preview; saved once on release
  const handleUpdateSource = (id: string, updates: Partial<SceneSource>, persist = true) => {
    const current = scenesRef.current;
    const scene = current.find((s) => s.id === activeSceneIdRef.current);
    if (!scene) return;
    const updatedSources = scene.sources.map((s) => (s.id === id ? { ...s, ...updates } : s));
    const updated = current.map((s) => (s.id === scene.id ? { ...s, sources: updatedSources } : s));
    scenesRef.current = updated;
    setScenes(updated);
    if (persist) window.electronAPI?.scenes.save(updated);
  };

  const handleToggleSourceVisibility = (id: string) => {
    const src = activeScene?.sources.find((s) => s.id === id);
    if (src) handleUpdateSource(id, { visible: !src.visible });
  };

  const handleToggleSourceLock = (id: string) => {
    const src = activeScene?.sources.find((s) => s.id === id);
    if (src) handleUpdateSource(id, { locked: !src.locked });
  };

  const handleDeleteSource = (id: string) => {
    if (!activeScene) return;
    engineRef.current?.removeSourceStream(id);
    const updatedSources = activeScene.sources.filter((s) => s.id !== id);
    const updated = scenes.map((s) => (s.id === activeScene.id ? { ...s, sources: updatedSources } : s));
    setScenes(updated);
    if (selectedSourceId === id) setSelectedSourceId(null);
    window.electronAPI?.scenes.save(updated);
  };

  const handleMoveSourceOrder = (id: string, direction: 'up' | 'down') => {
    if (!activeScene) return;
    const sorted = [...activeScene.sources].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((s) => s.id === id);
    if (idx === -1) return;

    if (direction === 'up' && idx < sorted.length - 1) {
      const tempZ = sorted[idx].zIndex;
      sorted[idx].zIndex = sorted[idx + 1].zIndex;
      sorted[idx + 1].zIndex = tempZ;
    } else if (direction === 'down' && idx > 0) {
      const tempZ = sorted[idx].zIndex;
      sorted[idx].zIndex = sorted[idx - 1].zIndex;
      sorted[idx - 1].zIndex = tempZ;
    }

    const updated = scenes.map((s) => (s.id === activeScene.id ? { ...s, sources: sorted } : s));
    setScenes(updated);
    window.electronAPI?.scenes.save(updated);
  };

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const selectedSource = activeScene?.sources.find((s) => s.id === selectedSourceId) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0d10] text-gray-100 overflow-hidden select-none">
      {/* --- Top Navigation Header --- */}
      <header className="h-13 bg-[#12141a] border-b border-[#202534] flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3">
          <BrandMark />

          <div className="h-4 w-[1px] bg-[#292f42] mx-1" />

          {/* Active Scene indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#181b24] rounded-lg border border-[#272d3e] text-xs">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-gray-300 font-medium">{activeScene?.name || 'Default Scene'}</span>
          </div>

          {/* Active Display Source indicator & Quick Picker */}
          <button
            onClick={() => setIsSourcePickerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a1e2b] hover:bg-[#252b3d] text-gray-200 hover:text-white rounded-lg border border-blue-500/40 transition-colors text-xs font-medium max-w-[240px]"
            title="Click to switch Monitor or Window"
          >
            <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="truncate">{activeSourceName}</span>
          </button>

          {/* Draw directly on the shared screen (recorded and streamed) */}
          <button
            onClick={toggleScreenOverlay}
            disabled={!captureIsDisplay}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-xs font-medium ${
              overlayVisible
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25'
                : captureIsDisplay
                  ? 'bg-[#1a1e2b] border-[#2b3142] text-gray-200 hover:bg-[#252b3d] hover:text-white'
                  : 'bg-[#15171f] border-[#232837] text-gray-600 cursor-not-allowed'
            }`}
            title={
              !captureIsDisplay
                ? 'Select an entire screen as the source to draw on it'
                : overlayVisible
                  ? 'Close the on-screen drawing tools'
                  : 'Show drawing tools on top of your screen'
            }
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{overlayVisible ? 'Screen drawing on' : 'Draw on screen'}</span>
          </button>
        </div>

        {/* Center Indicators: Recording & Streaming Status Badges */}
        <div className="flex items-center gap-3 font-mono-numbers text-xs">
          {/* Recording Badge */}
          {recordingStatus === 'recording' && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="font-semibold uppercase tracking-wider text-[11px]">REC</span>
              <span className="font-medium text-white">{formatTimer(recordingDuration)}</span>
            </div>
          )}

          {recordingStatus === 'paused' && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Pause className="w-3 h-3" />
              <span className="font-semibold uppercase tracking-wider text-[11px]">PAUSED</span>
              <span className="font-medium">{formatTimer(recordingDuration)}</span>
            </div>
          )}

          {/* Streaming Badge */}
          {streamStatus === 'live' && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span className="font-bold uppercase tracking-wider text-[11px]">LIVE</span>
              <span>{formatTimer(streamStats.uptimeSec)}</span>
            </div>
          )}

          {clipPhase && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-300">
              <Film className="w-3 h-3" />
              <span>Recording {clipPhase}…</span>
            </div>
          )}

          {perfNotice && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-300">
              <Zap className="w-3 h-3" />
              <span>{perfNotice}</span>
            </div>
          )}

          {streamStatus === 'connecting' && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>CONNECTING...</span>
            </div>
          )}
        </div>

        {/* Right side navigation buttons */}
        <div className="flex items-center gap-2">
          {/* Telemetry Panel Toggle Button */}
          <button
            onClick={() => setIsPerformanceOpen(!isPerformanceOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isPerformanceOpen
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                : 'bg-[#181b24] text-gray-300 border-[#272d3e] hover:text-white'
            }`}
            title="Real-Time Performance Telemetry"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline font-mono">{performanceMetrics.currentCaptureFps} FPS</span>
          </button>

          <button
            onClick={onNavigateToRecordings}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181b24] hover:bg-[#222736] text-gray-300 hover:text-white rounded-lg border border-[#272d3e] text-xs font-medium transition-colors"
          >
            <Film className="w-3.5 h-3.5 text-blue-400" />
            <span>Library</span>
          </button>

          <button
            onClick={onNavigateToSettings}
            className="p-1.5 bg-[#181b24] hover:bg-[#222736] text-gray-300 hover:text-white rounded-lg border border-[#272d3e] transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowInspector(!showInspector)}
            className={`p-1.5 rounded-lg border transition-colors ${
              showInspector
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                : 'bg-[#181b24] text-gray-400 border-[#272d3e] hover:text-white'
            }`}
            title="Toggle Properties Inspector"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* --- Main Workspace Grid --- */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Central Stage Area: Video Preview + Annotation Layer */}
        <div className="flex-1 flex flex-col bg-[#0f1115] relative p-3 overflow-hidden">
          {/* Central Live Preview Container */}
          <div className="flex-1 relative bg-black rounded-xl overflow-hidden shadow-2xl border border-[#232736] flex items-center justify-center">
            {/* The Live Composite: the engine canvas is mounted here directly */}
            <div ref={previewHostRef} className="absolute inset-0 flex items-center justify-center" />

            {/* Interactive Annotation Overlay */}
            <AnnotationOverlay
              activeTool={activeTool}
              color={color}
              strokeWidth={strokeWidth}
              opacity={opacity}
              isEnabled={isAnnotationEnabled}
              onAddElement={addElement}
              onBeginErase={beginErase}
              onErase={eraseElements}
              onEndErase={endErase}
              updateLaser={updateLaser}
              getActiveLaserPoints={getActiveLaserPoints}
              elements={elements}
              canvasWidth={1920}
              canvasHeight={1080}
            />

            {/* Move / resize the webcam directly on the preview */}
            {activeScene && engineRef.current && (
              <SourceTransformLayer
                sources={activeScene.sources}
                canvasWidth={engineRef.current.getDimensions().width}
                canvasHeight={engineRef.current.getDimensions().height}
                contentTop={engineRef.current.getContentTop()}
                pointerMode={!isAnnotationEnabled || activeTool === 'select'}
                selectedSourceId={selectedSourceId}
                onSelect={setSelectedSourceId}
                onChange={(id, updates, commit) => handleUpdateSource(id, updates, commit)}
              />
            )}

            {/* Floating Annotation Toolbar centered at the top of preview */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
              <AnnotationToolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                color={color}
                setColor={setColor}
                strokeWidth={strokeWidth}
                setStrokeWidth={setStrokeWidth}
                undo={undo}
                redo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                clearAll={clearAll}
                isAnnotationEnabled={isAnnotationEnabled}
                setIsAnnotationEnabled={setIsAnnotationEnabled}
              />
            </div>

            {/* Active source indicators / Quick resolution watermark */}
            <div className="absolute bottom-3 left-3 z-10 pointer-events-none flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-[10px] text-gray-300 font-mono border border-white/10 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Capturing: {activeSourceName}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Floating Real-Time Performance Monitor Overlay (Phase 7) */}
        {isPerformanceOpen && (
          <div className="absolute top-4 right-80 z-40 animate-in fade-in">
            <PerformancePanel
              metrics={performanceMetrics}
              isOpen={isPerformanceOpen}
              onClose={() => setIsPerformanceOpen(false)}
              onToggleLowEndOptimization={(enabled) => {
                setLowEndOptimization(enabled);
                if (engineRef.current) engineRef.current.lowEndOptimization = enabled;
                if (settings) {
                  const up = { ...settings, lowEndOptimization: enabled };
                  setSettings(up);
                  window.electronAPI?.settings.update(up);
                }
              }}
              lowEndOptimization={lowEndOptimization}
            />
          </div>
        )}

        {/* Right Sidebar: Properties Inspector */}
        {showInspector && (
          <div className="w-72 bg-[#12141a] border-l border-[#202534] p-3 overflow-y-auto flex flex-col gap-3">
            <LectureInfoPanel info={lectureInfo} onChange={updateLectureInfo} branding={branding} />
            <CameraPanel
              camera={
                (selectedSource?.type === 'webcam' ? selectedSource : null) ??
                activeScene?.sources.find((s) => s.type === 'webcam') ??
                null
              }
              videoDevices={videoDevices}
              onUpdate={handleUpdateSource}
              onAddCamera={handleAddWebcamSource}
            />
            <MicrophonePanel
              micDevices={micDevices}
              selectedMicId={selectedMicId}
              onSelectMicId={setSelectedMicId}
              micState={micState}
              onToggleMute={toggleMicMute}
              readLevels={readLevels}
              noiseLevel={resolveNoiseLevel(settings)}
              noiseStatus={noiseStatus}
              echoCancellation={settings?.echoCancellation ?? true}
              autoGainControl={settings?.autoGainControl ?? true}
              onChangeSettings={updateAudioSettings}
            />
            <PropertiesPanel
              source={selectedSource}
              onUpdateSource={handleUpdateSource}
              onClose={() => setShowInspector(false)}
              videoDevices={videoDevices}
            />
          </div>
        )}
      </div>

      {/* --- Bottom Studio Dock --- */}
      <div className="h-64 bg-[#12141b] border-t border-[#202534] p-3 flex gap-3 z-20">
        {/* Panel 1: Scenes */}
        <div className="w-56 h-full">
          <SceneListPanel
            scenes={scenes}
            activeSceneId={activeSceneId}
            onSelectScene={handleSelectScene}
            onAddScene={handleAddScene}
            onDuplicateScene={handleDuplicateScene}
            onRenameScene={handleRenameScene}
            onDeleteScene={handleDeleteScene}
          />
        </div>

        {/* Panel 2: Sources */}
        <div className="w-64 h-full">
          <SourceListPanel
            sources={activeScene?.sources || []}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
            onToggleVisibility={handleToggleSourceVisibility}
            onToggleLock={handleToggleSourceLock}
            onDeleteSource={handleDeleteSource}
            onMoveSourceOrder={handleMoveSourceOrder}
            onOpenScreenPicker={() => setIsSourcePickerOpen(true)}
            onAddWebcamSource={handleAddWebcamSource}
            onAddTextSource={handleAddTextSource}
          />
        </div>

        {/* Panel 3: Audio Mixer */}
        <div className="flex-1 h-full min-w-[320px]">
          <AudioMixerPanel
            micDevices={micDevices}
            selectedMicId={selectedMicId}
            onSelectMicId={setSelectedMicId}
            micState={micState}
            onMicVolumeChange={setMicVolume}
            onToggleMicMute={toggleMicMute}
            desktopState={desktopState}
            onDesktopVolumeChange={setDesktopVolume}
            onToggleDesktopMute={toggleDesktopMute}
            readLevels={readLevels}
          />
        </div>

        {/* Panel 4: Studio Controls */}
        <div className="w-64 bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col justify-between shadow-lg text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
            <span className="font-semibold text-gray-200">Controls</span>
            <span className="text-[10px] text-gray-500 font-mono">
              {recordingStatus === 'recording' ? 'RECORDING' : 'STANDBY'}
            </span>
          </div>

          <div className="flex flex-col gap-2.5 my-auto">
            {/* Primary Record Button */}
            {recordingStatus === 'idle' && (
              <button
                onClick={handleStartRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02]"
              >
                <div className="w-3 h-3 rounded-full bg-white" />
                <span>Start Recording</span>
              </button>
            )}

            {clipPhase && (
              <div className="w-full py-2.5 px-4 rounded-xl bg-blue-600/15 border border-blue-500/40 text-blue-300 font-medium flex items-center justify-center gap-2">
                <Film className="w-4 h-4" />
                <span>Playing {clipPhase}…</span>
              </div>
            )}

            {recordingStatus === 'recording' && !clipPhase && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePauseRecording}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#252b3d] hover:bg-[#31394f] text-gray-200 font-medium flex items-center justify-center gap-1.5"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
                <button
                  onClick={handleStopRecording}
                  className="flex-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium flex items-center justify-center gap-1.5 shadow-md shadow-red-600/30"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            )}

            {recordingStatus === 'paused' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResumeRecording}
                  className="flex-1 py-2 px-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </button>
                <button
                  onClick={handleStopRecording}
                  className="flex-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium flex items-center justify-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            )}

            {recordingStatus === 'processing' && (
              <div className="w-full py-2.5 px-4 rounded-xl bg-amber-600/20 border border-amber-500/40 text-amber-300 font-medium flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Finalizing MP4...</span>
              </div>
            )}

            {/* YouTube Live Stream Launch Button */}
            <button
              onClick={() => setIsLiveModalOpen(true)}
              className={`w-full py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                streamStatus === 'live'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 animate-pulse'
                  : 'bg-[#1e2332] hover:bg-[#293044] text-gray-200 border border-[#2f374e]'
              }`}
            >
              <Radio className={`w-4 h-4 ${streamStatus === 'live' ? 'text-white' : 'text-red-400'}`} />
              <span>{streamStatus === 'live' ? 'Manage Live Stream' : 'YouTube Live Stream'}</span>
            </button>
          </div>

          {/* Quick link to last recorded video */}
          {lastSavedRecording && (
            <div className="pt-2 border-t border-[#222634] flex items-center justify-between text-[11px]">
              <span className="text-gray-400 truncate max-w-[130px]" title={lastSavedRecording.filename}>
                Saved: {lastSavedRecording.filename}
              </span>
              <button
                onClick={onNavigateToRecordings}
                className="text-blue-400 hover:underline flex-shrink-0"
              >
                Play
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- Bottom Status Bar --- */}
      <footer className="h-7 bg-[#0b0c10] border-t border-[#1d202b] px-4 flex items-center justify-between text-[11px] text-gray-500 font-mono-numbers">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${performanceMetrics.hardwareAcceleration ? 'bg-emerald-400' : 'bg-blue-400'}`} />
            <span className="text-gray-300">
              Encoder: {performanceMetrics.activeEncoder}
            </span>
          </div>
          <span>Stream: {performanceMetrics.outputResolution}</span>
          <span>Audio: 48 kHz Stereo + Loopback</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-gray-400" />
            <span>Disk Free: {diskSpace.free}</span>
          </div>
          <button
            onClick={() => setIsPerformanceOpen(!isPerformanceOpen)}
            className="flex items-center gap-1 hover:text-gray-300 transition-colors"
          >
            <Cpu className="w-3 h-3 text-gray-400" />
            <span>CPU: {performanceMetrics.cpuPercent}%</span>
          </button>
        </div>
      </footer>

      {/* --- Modals --- */}
      <SourcePickerModal
        isOpen={isSourcePickerOpen}
        onClose={() => setIsSourcePickerOpen(false)}
        onSelectSource={(source) => handleSelectDesktopSource(source, true)}
        selectedSourceId={activeScene?.sources[0]?.sourceId}
      />

      <YouTubeLiveModal
        isOpen={isLiveModalOpen}
        onClose={() => setIsLiveModalOpen(false)}
        streamStatus={streamStatus}
        streamStats={streamStats}
        streamKey={settings?.youtubeStreamKey || ''}
        onUpdateStreamKey={(key) => {
          if (settings) {
            const up = { ...settings, youtubeStreamKey: key };
            setSettings(up);
            window.electronAPI?.settings.update({ youtubeStreamKey: key });
          }
        }}
        rtmpUrl={settings?.youtubeRtmpUrl || 'rtmps://a.rtmp.youtube.com/live2'}
        outputFps={settings?.fps || 30}
        onStartStream={handleStartStream}
        onStopStream={handleStopStream}
        error={streamError}
      />
    </div>
  );
};
