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
  inputCodec?: RecorderVideoCodec; // codec of the webm/mkv chunks piped to FFmpeg
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

export type HardwareTier = 'low' | 'balanced' | 'high';

export interface HardwareProfile {
  tier: HardwareTier;
  cpuModel: string;
  logicalCores: number;
  totalMemoryGb: number;
  gpus: string[];
  hasDiscreteGpu: boolean;
  recommended: Pick<AppSettings, 'resolutionPreset' | 'width' | 'height' | 'fps' | 'videoBitrateKbps' | 'lowEndOptimization'>;
}

export type RecorderVideoCodec = 'h264' | 'vp8' | 'vp9';

export interface RecordingStartOptions {
  outputDir?: string;
  // Used to build a readable file name, e.g. KLH_Data-Structures_Dr-Rao_2026-10-27...
  lectureTitle?: { professorName?: string; subject?: string };
  resolution?: string;
  fps?: number;
  videoCodec?: RecorderVideoCodec;
  videoBitrateKbps?: number;
}

// Typed by the professor; burned into the recording as a top banner and a name tag under the webcam
export interface LectureInfo {
  professorName: string;
  subject: string;
  showBanner: boolean;
  showNameTag: boolean;
}

export type BrandClipKind = 'intro' | 'outro';

export interface BrandClip {
  originalName: string;
  durationSec: number;
  sizeBytes: number;
  updatedAt: string;
}

// Admin-controlled branding. Intro/outro are set behind the admin PIN and cannot be changed by professors.
export interface BrandingInfo {
  hasAdminPin: boolean;
  intro: BrandClip | null;
  outro: BrandClip | null;
}

export interface AppSettings {
  lectureInfo?: LectureInfo;
  // Set once the first-launch hardware auto-tune has been applied
  autoTuned?: boolean;
  hardwareTier?: HardwareTier;
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
