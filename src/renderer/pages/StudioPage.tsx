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
} from 'lucide-react';
import {
  AppSettings,
  DesktopSource,
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
import { useAnnotationEngine } from '../annotations/useAnnotationEngine';
import { AnnotationToolbar } from '../annotations/AnnotationToolbar';
import { AnnotationOverlay } from '../annotations/AnnotationOverlay';
import { useAudioMixer } from '../studio/audio/useAudioMixer';
import { AudioMixerPanel } from '../studio/audio/AudioMixerPanel';
import { SceneListPanel } from '../scenes/SceneListPanel';
import { SourceListPanel } from '../scenes/SourceListPanel';
import { PropertiesPanel } from '../studio/PropertiesPanel';
import { SourcePickerModal } from '../studio/SourcePickerModal';
import { YouTubeLiveModal } from '../studio/YouTubeLiveModal';
import { PerformancePanel } from '../studio/PerformancePanel';

interface StudioPageProps {
  onNavigateToRecordings: () => void;
  onNavigateToSettings: () => void;
}

export const StudioPage: React.FC<StudioPageProps> = ({
  onNavigateToRecordings,
  onNavigateToSettings,
}) => {
  // --- Composition Engine & Preview Ref ---
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<CompositionEngine | null>(null);

  // --- Persistent Settings ---
  const [settings, setSettings] = useState<AppSettings | null>(null);

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
    masterAudioStream,
  } = useAudioMixer({
    noiseSuppression: settings?.noiseSuppression,
    echoCancellation: settings?.echoCancellation,
  });

  // --- Annotation Hook ---
  const {
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    opacity,
    setOpacity,
    isAnnotationEnabled,
    setIsAnnotationEnabled,
    elements,
    addElement,
    undo,
    redo,
    canUndo,
    canRedo,
    clearAll,
    offscreenCanvas,
    updateLaser,
    getActiveLaserPoints,
  } = useAnnotationEngine(1920, 1080);

  // --- Recording State ---
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [lastSavedRecording, setLastSavedRecording] = useState<RecordingItem | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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
    engine.start();

    // Load initial settings and scenes from IPC
    if (window.electronAPI) {
      window.electronAPI.settings.get().then((s) => {
        setSettings(s);
        setLowEndOptimization(s.lowEndOptimization ?? true);
        engine.lowEndOptimization = s.lowEndOptimization ?? true;
        engine.setResolution(s.width || 1920, s.height || 1080, s.fps || 30);
      });

      window.electronAPI.scenes.getAll().then(async (sc) => {
        setScenes(sc);
        if (sc.length > 0) {
          setActiveSceneId(sc[0].id);
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
        engine.destroy();
      };
    }

    return () => {
      engine.destroy();
    };
  }, []);

  // Update annotation layer in engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setAnnotationSource(offscreenCanvas, getActiveLaserPoints);
    }
  }, [offscreenCanvas, getActiveLaserPoints]);

  // Connect engine's output stream to central video preview element
  useEffect(() => {
    if (!engineRef.current || !previewVideoRef.current) return;
    const combined = engineRef.current.getCombinedStream(masterAudioStream);
    if (previewVideoRef.current.srcObject !== combined) {
      previewVideoRef.current.srcObject = combined;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [masterAudioStream]);

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

  // When active scene changes, inform composition engine
  useEffect(() => {
    if (activeScene && engineRef.current) {
      engineRef.current.setScene(activeScene);
    }
  }, [activeScene]);

  // Connect webcam stream if active scene has a webcam source
  useEffect(() => {
    if (!activeScene || !engineRef.current) return;
    const camSources = activeScene.sources.filter((s) => s.type === 'webcam' && s.visible);

    camSources.forEach(async (source) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: source.deviceId ? { exact: source.deviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        engineRef.current?.setSourceStream(source.id, stream);
      } catch (err) {
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
      } catch {}
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSourceName, settings, micState.muted, streamStatus]);

  // ATTACH REAL DESKTOP MONITOR OR WINDOW STREAM (Phase 2 & Phase 3 Core Fix!)
  const handleSelectDesktopSource = async (source: DesktopSource) => {
    if (!engineRef.current) return;

    try {
      console.log(`[Screen Capture] Initializing capture for source: "${source.name}" (${source.id})`);
      setActiveSourceName(source.name);

      let stream: MediaStream | null = null;

      // When capturing an entire display monitor:
      if (source.isDisplay || source.id.startsWith('screen:')) {
        // Set the active display source in main process
        if (window.electronAPI) {
          await window.electronAPI.screenCapture.selectDisplay(source.id);
        }

        // Modern Electron getDisplayMedia with system audio loopback!
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: settings?.includeSystemAudio ?? true,
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
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                maxFrameRate: settings?.fps || 30,
              },
            } as any,
          });
        }
      } else {
        // Application window capture
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080,
              maxFrameRate: settings?.fps || 30,
            },
          } as any,
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
      const currentScene = activeScene || scenes[0];
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
        await engineRef.current.setSourceStream(targetSourceId, stream);

        const updatedScenes = scenes.map((sc) =>
          sc.id === currentScene.id ? { ...sc, sources: updatedSources } : sc
        );
        setScenes(updatedScenes);
        window.electronAPI?.scenes.save(updatedScenes);
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
      
      // 1. Notify Main process to prepare file writer
      await window.electronAPI.recording.start({
        outputDir: settings?.recordingDir,
        resolution: `${engineRef.current.getDimensions().width}x${engineRef.current.getDimensions().height}`,
        fps: engineRef.current.getDimensions().fps,
      });

      // 2. Initialize MediaRecorder with balanced bitrate
      const bitrate = (settings?.videoBitrateKbps || 5000) * 1000;
      const rec = new MediaRecorder(combined, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: bitrate,
      });

      rec.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const buf = await e.data.arrayBuffer();
          window.electronAPI.recording.sendChunk(buf);
        }
      };

      rec.start(1000); // 1-second chunks
      mediaRecorderRef.current = rec;
      setRecordingStatus('recording');
      setRecordingDuration(0);

      // Start elapsed timer
      recTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // If user enabled minimize on record to prevent infinity mirror / studio obstruction:
      if (settings?.minimizeOnRecord) {
        setTimeout(() => {
          window.electronAPI?.system.minimizeWindow();
        }, 500);
      }
    } catch (err: any) {
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
    if (!mediaRecorderRef.current || !window.electronAPI) return;
    setRecordingStatus('processing');
    if (recTimerRef.current) clearInterval(recTimerRef.current);

    // Stop MediaRecorder
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;

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

  // --- YouTube Live Streaming Actions ---
  const handleStartStream = async (config: StreamConfig) => {
    if (!engineRef.current || !window.electronAPI) return;
    setStreamError(null);

    try {
      await window.electronAPI.streaming.start(config);

      const combined = engineRef.current.getCombinedStream(masterAudioStream);
      const strRec = new MediaRecorder(combined, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: config.videoBitrate * 1000,
      });

      strRec.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const buf = await e.data.arrayBuffer();
          window.electronAPI.streaming.sendChunk(buf);
        }
      };

      strRec.start(500); // 500ms low-latency chunks
      streamRecorderRef.current = strRec;
      setStreamStatus('connecting');
    } catch (err: any) {
      setStreamError(err.message);
      setStreamStatus('error');
    }
  };

  const handleStopStream = async () => {
    if (streamRecorderRef.current) {
      streamRecorderRef.current.stop();
      streamRecorderRef.current = null;
    }
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
      y: 70,
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

  const handleUpdateSource = (id: string, updates: Partial<SceneSource>) => {
    if (!activeScene) return;
    const updatedSources = activeScene.sources.map((s) => (s.id === id ? { ...s, ...updates } : s));
    const updated = scenes.map((s) => (s.id === activeScene.id ? { ...s, sources: updatedSources } : s));
    setScenes(updated);
    window.electronAPI?.scenes.save(updated);
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
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Video className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white">Live Studio</span>
          </div>

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
            {/* The Live Composite Video Track */}
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* Interactive Annotation Overlay */}
            <AnnotationOverlay
              activeTool={activeTool}
              color={color}
              strokeWidth={strokeWidth}
              opacity={opacity}
              isEnabled={isAnnotationEnabled}
              onAddElement={addElement}
              updateLaser={updateLaser}
              getActiveLaserPoints={getActiveLaserPoints}
              elements={elements}
              canvasWidth={1920}
              canvasHeight={1080}
            />

            {/* Floating Annotation Toolbar centered at the top of preview */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
              <AnnotationToolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                color={color}
                setColor={setColor}
                strokeWidth={strokeWidth}
                setStrokeWidth={setStrokeWidth}
                opacity={opacity}
                setOpacity={setOpacity}
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
          <div className="w-72 bg-[#12141a] border-l border-[#202534] p-3 overflow-y-auto">
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
                <div className="w-3 h-3 rounded-full bg-white animate-ping" />
                <span>Start Recording</span>
              </button>
            )}

            {recordingStatus === 'recording' && (
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
        onSelectSource={handleSelectDesktopSource}
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
        onStartStream={handleStartStream}
        onStopStream={handleStopStream}
        error={streamError}
      />
    </div>
  );
};
