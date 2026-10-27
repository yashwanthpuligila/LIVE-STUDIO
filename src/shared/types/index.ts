export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string; // Data URL
  display_id?: string;
  appIcon?: string | null;
  isDisplay?: boolean;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'stopped' | 'error';

export interface RecordingStats {
  durationSec: number;
  bytesWritten: number;
  currentBitrate: number;
  fps: number;
  droppedFrames?: number;
}

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'stopping' | 'error';

export interface StreamStats {
  fps: number;
  bitrateKbps: number;
  totalBytes: number;
  droppedFrames: number;
  uptimeSec: number;
}

export interface StreamConfig {
  rtmpUrl: string;
  streamKey: string;
  resolution: { width: number; height: number };
  fps: number;
  videoBitrate: number; // in kbps e.g. 4500
  audioBitrate: number; // in kbps e.g. 128
}

export interface RecordingItem {
  id: string;
  title: string;
  filename: string;
  filePath: string;
  thumbnailPath: string;
  durationSec: number;
  fileSize: number; // in bytes
  resolution: string;
  fps: number;
  createdAt: string;
  encoder?: string;
  tags?: string[];
}

export type SourceType = 'screen' | 'window' | 'webcam' | 'image' | 'color' | 'text';

export interface SceneSource {
  id: string;
  name: string;
  type: SourceType;
  sourceId?: string; // desktopCapturer ID
  deviceId?: string; // media device ID for webcam
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  width: number; // 0 to 100 percentage
  height: number; // 0 to 100 percentage
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0 to 1
  borderRadius?: number;
  text?: string;
  color?: string;
  fontSize?: number;
  fontColor?: string;
}

export interface Scene {
  id: string;
  name: string;
  sources: SceneSource[];
  isSelected?: boolean;
}

export type AnnotationTool = 
  | 'select'
  | 'pen' 
  | 'highlighter' 
  | 'eraser' 
  | 'arrow' 
  | 'line' 
  | 'rect' 
  | 'circle' 
  | 'text' 
  | 'laser';

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationElement {
  id: string;
  tool: AnnotationTool;
  points: AnnotationPoint[];
  color: string;
  strokeWidth: number;
  opacity: number;
  text?: string;
  fontSize?: number;
  timestamp?: number;
}

export interface EncoderCapability {
  id: string;
  name: string;
  type: 'hardware' | 'software';
  codec: string;
  isAvailable: boolean;
  testError?: string;
}

export interface PerformanceMetrics {
  selectedSource: string;
  capturedResolution: string;
  outputResolution: string;
  currentCaptureFps: number;
  targetFps: number;
  droppedFrames: number;
  cpuPercent: number;
  processMemoryMb: number;
  activeEncoder: string;
  hardwareAcceleration: boolean;
  recordingBitrateKbps: number;
  audioCaptureStatus: 'Active' | 'Muted' | 'Disconnected' | 'None';
  fileSizeBytes: number;
  writeErrors: number;
  streamingStatus: StreamStatus;
}

export interface AppSettings {
  recordingProfile: 'balanced' | 'high' | 'ultra' | 'custom';
  resolutionPreset: '1080p' | '720p' | '4k';
  width: number;
  height: number;
  fps: 30 | 60;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  recordingDir: string;
  defaultMicId: string;
  defaultWebcamId: string;
  includeSystemAudio: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  youtubeStreamKey: string;
  youtubeRtmpUrl: string;
  hardwareAcceleration: boolean;
  selectedEncoderId: string;
  minimizeOnRecord: boolean;
  lowEndOptimization: boolean;
  shortcuts: {
    toggleRecord: string;
    pauseRecord: string;
    toggleStream: string;
    toggleAnnotation: string;
    clearAnnotation: string;
    undoAnnotation: string;
    toggleMic: string;
    nextScene: string;
    prevScene: string;
  };
  obsEnabled: boolean;
  obsWebSocketUrl: string;
  obsWebSocketPassword: string;
}

export interface DiskSpaceInfo {
  freeBytes: number;
  totalBytes: number;
}
