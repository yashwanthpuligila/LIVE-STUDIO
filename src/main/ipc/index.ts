import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { ScreenCaptureManager } from '../capture/screenCapture';
import { RecordingManager } from '../recording/recordingManager';
import { StreamingManager } from '../streaming/streamingManager';
import { ConfigStore } from '../storage/configStore';
import { RecordingsStore } from '../storage/recordingsStore';
import { ScenesStore } from '../storage/scenesStore';
import { EncoderDetector } from '../recording/encoderDetector';
import { AppSettings, DiskSpaceInfo, Scene, StreamConfig } from '../../shared/types';

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  configStore: ConfigStore,
  recordingsStore: RecordingsStore,
  scenesStore: ScenesStore,
  recordingManager: RecordingManager,
  streamingManager: StreamingManager,
  screenCaptureManager: ScreenCaptureManager
) {
  // --- Screen Capture ---
  ipcMain.handle('screenCapture:getSources', async () => {
    return await screenCaptureManager.getAvailableSources();
  });

  ipcMain.handle('screenCapture:selectDisplay', async (_, id: string) => {
    screenCaptureManager.setSelectedDisplayId(id);
    return true;
  });

  ipcMain.handle('screenCapture:getPrimarySource', async () => {
    return await screenCaptureManager.getPrimaryScreenSource();
  });

  // --- Recording ---
  ipcMain.handle('recording:start', async (_, options: { outputDir?: string; resolution?: string; fps?: number }) => {
    return recordingManager.startRecording(options);
  });

  ipcMain.on('recording:chunk', (_, chunk: ArrayBuffer) => {
    recordingManager.writeChunk(Buffer.from(chunk));
  });

  ipcMain.handle('recording:pause', async () => {
    recordingManager.pauseRecording();
    return recordingManager.getStatus();
  });

  ipcMain.handle('recording:resume', async () => {
    recordingManager.resumeRecording();
    return recordingManager.getStatus();
  });

  ipcMain.handle('recording:stop', async () => {
    return await recordingManager.stopRecording();
  });

  ipcMain.handle('recording:getStatus', async () => {
    return recordingManager.getStatus();
  });

  // --- Streaming ---
  ipcMain.handle('streaming:start', async (_, config: StreamConfig) => {
    return await streamingManager.startStream(config);
  });

  ipcMain.on('streaming:chunk', (_, chunk: ArrayBuffer) => {
    streamingManager.writeChunk(Buffer.from(chunk));
  });

  ipcMain.handle('streaming:stop', async () => {
    return await streamingManager.stopStream();
  });

  ipcMain.handle('streaming:getStatus', async () => {
    return streamingManager.getStatus();
  });

  // --- Recordings Library ---
  ipcMain.handle('recordings:getAll', async () => {
    return recordingsStore.getAll();
  });

  ipcMain.handle('recordings:delete', async (_, id: string) => {
    return recordingsStore.delete(id);
  });

  ipcMain.handle('recordings:update', async (_, id: string, partial: any) => {
    return recordingsStore.update(id, partial);
  });

  ipcMain.handle('recordings:reveal', async (_, filePath: string) => {
    return recordingsStore.reveal(filePath);
  });

  // --- Scenes ---
  ipcMain.handle('scenes:getAll', async () => {
    return scenesStore.getScenes();
  });

  ipcMain.handle('scenes:save', async (_, scenes: Scene[]) => {
    return scenesStore.setScenes(scenes);
  });

  // --- Settings ---
  ipcMain.handle('settings:get', async () => {
    return configStore.getSettings();
  });

  ipcMain.handle('settings:update', async (_, partial: Partial<AppSettings>) => {
    if (partial.selectedEncoderId) {
      EncoderDetector.setActiveEncoder(partial.selectedEncoderId);
    }
    return configStore.updateSettings(partial);
  });

  // --- Hardware Encoders & Performance ---
  ipcMain.handle('system:getEncoders', async () => {
    return await EncoderDetector.detectEncoders();
  });

  ipcMain.handle('system:getActiveEncoder', () => {
    return EncoderDetector.getActiveEncoder();
  });

  ipcMain.handle('system:setActiveEncoder', (_, id: string) => {
    return EncoderDetector.setActiveEncoder(id);
  });

  ipcMain.handle('system:getPerformanceStats', async () => {
    const cpu = process.getCPUUsage();
    const mem = process.memoryUsage();
    return {
      cpuPercent: Math.round(cpu.percentCPUUsage),
      processMemoryMb: Math.round(mem.rss / (1024 * 1024)),
      activeEncoder: EncoderDetector.getActiveEncoder().name,
      hardwareAcceleration: EncoderDetector.getActiveEncoder().type === 'hardware',
    };
  });

  // --- System Window Control (Avoid recursive preview / infinity mirror) ---
  ipcMain.handle('system:minimizeWindow', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
      return true;
    }
    return false;
  });

  ipcMain.handle('system:restoreWindow', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.restore();
      win.focus();
      return true;
    }
    return false;
  });

  // --- Filesystem ---
  ipcMain.handle('system:selectDirectory', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Recording Destination Folder',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('system:getDiskSpace', async (_, targetPath?: string): Promise<DiskSpaceInfo> => {
    try {
      const p = targetPath || configStore.getSettings().recordingDir;
      if (fs.existsSync(p)) {
        const stats = fs.statfsSync(p);
        return {
          freeBytes: stats.bavail * stats.bsize,
          totalBytes: stats.blocks * stats.bsize,
        };
      }
    } catch (e) {
      console.warn('Failed to get disk space:', e);
    }
    return { freeBytes: 100 * 1024 * 1024 * 1024, totalBytes: 500 * 1024 * 1024 * 1024 };
  });

  // --- OBS WebSocket ---
  ipcMain.handle('obs:connect', async (_, url?: string, password?: string) => {
    return await streamingManager.connectObs(url, password);
  });

  ipcMain.handle('obs:disconnect', async () => {
    return await streamingManager.disconnectObs();
  });

  ipcMain.handle('obs:getStatus', async () => {
    return streamingManager.getObsStatus();
  });
}
