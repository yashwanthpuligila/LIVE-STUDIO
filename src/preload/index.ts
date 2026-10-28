import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  BrandClipKind,
  BrandingInfo,
  DesktopSource,
  DiskSpaceInfo,
  EncoderCapability,
  HardwareProfile,
  OverlayCommand,
  OverlayRecordingCommand,
  OverlayRecordingState,
  OverlayState,
  RecordingItem,
  RecordingStartOptions,
  RecordingStatus,
  Scene,
  StreamConfig,
  StreamStats,
  StreamStatus,
} from '../shared/types';

const api = {
  screenCapture: {
    getSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke('screenCapture:getSources'),
    selectDisplay: (id: string): Promise<boolean> => ipcRenderer.invoke('screenCapture:selectDisplay', id),
    getPrimarySource: (): Promise<DesktopSource | null> => ipcRenderer.invoke('screenCapture:getPrimarySource'),
  },

  recording: {
    start: (options: RecordingStartOptions): Promise<{ id: string; filename: string }> =>
      ipcRenderer.invoke('recording:start', options),
    sendChunk: (chunk: ArrayBuffer) => {
      ipcRenderer.send('recording:chunk', chunk);
    },
    pause: (): Promise<{ status: RecordingStatus; durationSec: number }> =>
      ipcRenderer.invoke('recording:pause'),
    resume: (): Promise<{ status: RecordingStatus; durationSec: number }> =>
      ipcRenderer.invoke('recording:resume'),
    stop: (): Promise<RecordingItem> => ipcRenderer.invoke('recording:stop'),
    getStatus: (): Promise<{ status: RecordingStatus; durationSec: number; bytesWritten: number; writeErrors: number }> =>
      ipcRenderer.invoke('recording:getStatus'),
  },

  streaming: {
    start: (config: StreamConfig): Promise<void> => ipcRenderer.invoke('streaming:start', config),
    sendChunk: (chunk: ArrayBuffer) => {
      ipcRenderer.send('streaming:chunk', chunk);
    },
    stop: (): Promise<void> => ipcRenderer.invoke('streaming:stop'),
    getStatus: (): Promise<{ status: StreamStatus; stats: StreamStats }> =>
      ipcRenderer.invoke('streaming:getStatus'),
    onStatusChanged: (callback: (data: { status: StreamStatus; error?: string }) => void) => {
      const listener = (_: any, data: { status: StreamStatus; error?: string }) => callback(data);
      ipcRenderer.on('streaming:status-changed', listener);
      return () => ipcRenderer.removeListener('streaming:status-changed', listener);
    },
    onStats: (callback: (stats: StreamStats) => void) => {
      const listener = (_: any, stats: StreamStats) => callback(stats);
      ipcRenderer.on('streaming:stats', listener);
      return () => ipcRenderer.removeListener('streaming:stats', listener);
    },
  },

  recordings: {
    getAll: (): Promise<RecordingItem[]> => ipcRenderer.invoke('recordings:getAll'),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('recordings:delete', id),
    update: (id: string, partial: any): Promise<RecordingItem | null> =>
      ipcRenderer.invoke('recordings:update', id, partial),
    reveal: (filePath: string): Promise<boolean> => ipcRenderer.invoke('recordings:reveal', filePath),
  },

  scenes: {
    getAll: (): Promise<Scene[]> => ipcRenderer.invoke('scenes:getAll'),
    save: (scenes: Scene[]): Promise<Scene[]> => ipcRenderer.invoke('scenes:save', scenes),
  },

  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (partial: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:update', partial),
  },

  system: {
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('system:selectDirectory'),
    getDiskSpace: (path?: string): Promise<DiskSpaceInfo> =>
      ipcRenderer.invoke('system:getDiskSpace', path),
    getEncoders: (): Promise<EncoderCapability[]> => ipcRenderer.invoke('system:getEncoders'),
    getHardwareProfile: (): Promise<HardwareProfile> => ipcRenderer.invoke('system:getHardwareProfile'),
    getActiveEncoder: (): Promise<EncoderCapability> => ipcRenderer.invoke('system:getActiveEncoder'),
    setActiveEncoder: (id: string): Promise<boolean> => ipcRenderer.invoke('system:setActiveEncoder', id),
    getPerformanceStats: (): Promise<{
      cpuPercent: number;
      processMemoryMb: number;
      activeEncoder: string;
      hardwareAcceleration: boolean;
    }> => ipcRenderer.invoke('system:getPerformanceStats'),
    minimizeWindow: (): Promise<boolean> => ipcRenderer.invoke('system:minimizeWindow'),
    restoreWindow: (): Promise<boolean> => ipcRenderer.invoke('system:restoreWindow'),
  },

  branding: {
    getInfo: (): Promise<BrandingInfo> => ipcRenderer.invoke('branding:getInfo'),
    verifyPin: (pin: string): Promise<boolean> => ipcRenderer.invoke('branding:verifyPin', pin),
    setPin: (currentPin: string | null, nextPin: string): Promise<BrandingInfo> =>
      ipcRenderer.invoke('branding:setPin', currentPin, nextPin),
    chooseClip: (kind: BrandClipKind, pin: string): Promise<BrandingInfo> =>
      ipcRenderer.invoke('branding:chooseClip', kind, pin),
    removeClip: (kind: BrandClipKind, pin: string): Promise<BrandingInfo> =>
      ipcRenderer.invoke('branding:removeClip', kind, pin),
    readClip: (kind: BrandClipKind): Promise<ArrayBuffer | null> => ipcRenderer.invoke('branding:readClip', kind),
  },

  backgrounds: {
    list: (): Promise<string[]> => ipcRenderer.invoke('backgrounds:list'),
    choose: (): Promise<string | null> => ipcRenderer.invoke('backgrounds:choose'),
    read: (name: string): Promise<ArrayBuffer | null> => ipcRenderer.invoke('backgrounds:read', name),
    remove: (name: string): Promise<boolean> => ipcRenderer.invoke('backgrounds:remove', name),
  },

  overlay: {
    // Studio window
    show: (displayId?: string): Promise<boolean> => ipcRenderer.invoke('overlay:show', displayId),
    hide: (): Promise<boolean> => ipcRenderer.invoke('overlay:hide'),
    isVisible: (): Promise<boolean> => ipcRenderer.invoke('overlay:isVisible'),
    onVisibilityChanged: (callback: (visible: boolean) => void) => {
      const listener = (_: any, visible: boolean) => callback(visible);
      ipcRenderer.on('overlay:visibility-changed', listener);
      return () => {
        ipcRenderer.removeListener('overlay:visibility-changed', listener);
      };
    },
    sendRecordingState: (rec: OverlayRecordingState) => ipcRenderer.send('overlay:recordingState', rec),
    onRecordingCommand: (callback: (cmd: OverlayRecordingCommand) => void) => {
      const listener = (_: any, cmd: OverlayRecordingCommand) => callback(cmd);
      ipcRenderer.on('overlay:recording-command', listener);
      return () => {
        ipcRenderer.removeListener('overlay:recording-command', listener);
      };
    },
    // Ink layer
    sendState: (state: OverlayState) => ipcRenderer.send('overlay:state', state),
    onCommand: (callback: (cmd: OverlayCommand) => void) => {
      const listener = (_: any, cmd: OverlayCommand) => callback(cmd);
      ipcRenderer.on('overlay:command', listener);
      return () => {
        ipcRenderer.removeListener('overlay:command', listener);
      };
    },
    // Floating toolbar
    getState: (): Promise<OverlayState | null> => ipcRenderer.invoke('overlay:getState'),
    onState: (callback: (state: OverlayState) => void) => {
      const listener = (_: any, state: OverlayState) => callback(state);
      ipcRenderer.on('overlay:state', listener);
      return () => {
        ipcRenderer.removeListener('overlay:state', listener);
      };
    },
    command: (cmd: OverlayCommand) => ipcRenderer.send('overlay:command', cmd),
    getRecordingState: (): Promise<OverlayRecordingState | null> => ipcRenderer.invoke('overlay:getRecordingState'),
    onRecording: (callback: (rec: OverlayRecordingState) => void) => {
      const listener = (_: any, rec: OverlayRecordingState) => callback(rec);
      ipcRenderer.on('overlay:recording', listener);
      return () => {
        ipcRenderer.removeListener('overlay:recording', listener);
      };
    },
    recordingCommand: (cmd: OverlayRecordingCommand) => ipcRenderer.send('overlay:recordingCommand', cmd),
    setToolbarSize: (width: number, height: number) => ipcRenderer.send('overlay:toolbarSize', { width, height }),
    close: () => ipcRenderer.send('overlay:close'),
    openStudio: () => ipcRenderer.send('overlay:openStudio'),
  },

  obs: {
    connect: (url?: string, password?: string): Promise<{ connected: boolean; version?: string }> =>
      ipcRenderer.invoke('obs:connect', url, password),
    disconnect: (): Promise<void> => ipcRenderer.invoke('obs:disconnect'),
    getStatus: (): Promise<{ isConnected: boolean }> => ipcRenderer.invoke('obs:getStatus'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
