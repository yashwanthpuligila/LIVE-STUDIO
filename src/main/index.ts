import { app, BrowserWindow, globalShortcut, Menu, session, desktopCapturer } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConfigStore } from './storage/configStore';
import { RecordingsStore } from './storage/recordingsStore';
import { ScenesStore } from './storage/scenesStore';
import { BrandingStore } from './storage/brandingStore';
import { ScreenCaptureManager } from './capture/screenCapture';
import { RecordingManager } from './recording/recordingManager';
import { StreamingManager } from './streaming/streamingManager';
import { EncoderDetector } from './recording/encoderDetector';
import { getHardwareProfile } from './system/hardwareProfile';
import { registerIpcHandlers } from './ipc';
import { OverlayManager } from './overlay/overlayManager';
import { loadRendererPage, preloadPath } from './window/rendererPage';

// --- Critical Chromium Flags to Prevent Background / Occlusion Throttling ---
// Without these, Windows minimizes or occluded windows freeze video capture to 0 FPS!
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow: BrowserWindow | null = null;
let configStore: ConfigStore;
let recordingsStore: RecordingsStore;
let scenesStore: ScenesStore;
let brandingStore: BrandingStore;
let screenCaptureManager: ScreenCaptureManager;
let recordingManager: RecordingManager;
let streamingManager: StreamingManager;
let overlayManager: OverlayManager | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0c0d10',
    title: 'KLH Lecture Studio',
    // Packaged builds take the icon from the .exe; this covers dev runs
    icon: fs.existsSync(path.join(__dirname, '../../build/icon.ico')) ? path.join(__dirname, '../../build/icon.ico') : undefined,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false, // Keep full FPS when window is blurred
    },
    frame: true,
    show: false,
  });

  // Remove default menu bar for sleek custom studio header
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  loadRendererPage(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
    // The overlay windows would otherwise keep the app alive with no studio behind them
    overlayManager?.hide();
  });
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const settings = configStore.getSettings();

  if (settings.shortcuts) {
    try {
      if (settings.shortcuts.toggleRecord) {
        globalShortcut.register(settings.shortcuts.toggleRecord, () => {
          mainWindow?.webContents.send('shortcut:toggleRecord');
        });
      }
      if (settings.shortcuts.toggleStream) {
        globalShortcut.register(settings.shortcuts.toggleStream, () => {
          mainWindow?.webContents.send('shortcut:toggleStream');
        });
      }
      if (settings.shortcuts.toggleAnnotation) {
        globalShortcut.register(settings.shortcuts.toggleAnnotation, () => {
          // While drawing on screen, the hotkey flips between drawing and normal mouse use
          if (overlayManager?.isVisible()) overlayManager.sendCommand({ type: 'toggleDraw' });
          else mainWindow?.webContents.send('shortcut:toggleAnnotation');
        });
      }
      if (settings.shortcuts.toggleMic) {
        globalShortcut.register(settings.shortcuts.toggleMic, () => {
          mainWindow?.webContents.send('shortcut:toggleMic');
        });
      }
    } catch (e) {
      console.warn('Failed to register global shortcut:', e);
    }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    configStore = new ConfigStore();
    recordingsStore = new RecordingsStore();
    scenesStore = new ScenesStore();
    brandingStore = new BrandingStore();
    screenCaptureManager = new ScreenCaptureManager();
    recordingManager = new RecordingManager(recordingsStore);
    streamingManager = new StreamingManager(() => mainWindow);
    overlayManager = new OverlayManager(() => mainWindow);

    // Modern Electron getDisplayMedia handler with system loopback audio
    // Passes the raw DesktopCapturerSource for exact native C++ WebRTC compatibility
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const rawSources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 1, height: 1 },
        });
        const targetId = screenCaptureManager.getSelectedDisplayId();
        const chosenRaw = rawSources.find((s) => s.id === targetId) ||
                          rawSources.find((s) => s.id.startsWith('screen:')) ||
                          rawSources[0];

        if (chosenRaw) {
          console.log(`[DisplayMedia] Granting display capture for: "${chosenRaw.name}" (${chosenRaw.id})`);
          callback({ video: chosenRaw, audio: 'loopback' });
        } else {
          callback({});
        }
      } catch (err) {
        console.error('[DisplayMedia] Error in handler:', err);
        callback({});
      }
    });

    // Classify the machine and, on first launch only, pick capture settings it can sustain.
    // Users who later change settings keep their choice (autoTuned stays true).
    const profile = await getHardwareProfile();
    console.log(`[Hardware] ${profile.cpuModel} | ${profile.logicalCores} threads | ${profile.totalMemoryGb} GB | ${profile.gpus.join(', ') || 'unknown GPU'} -> tier "${profile.tier}"`);
    const current = configStore.getSettings();
    if (!current.autoTuned) {
      configStore.updateSettings({ ...profile.recommended, recordingProfile: 'balanced', hardwareTier: profile.tier, autoTuned: true });
    } else if (current.hardwareTier !== profile.tier) {
      configStore.updateSettings({ hardwareTier: profile.tier });
    }
    EncoderDetector.setPreferred(current.selectedEncoderId);

    registerIpcHandlers(
      () => mainWindow,
      configStore,
      recordingsStore,
      scenesStore,
      recordingManager,
      streamingManager,
      screenCaptureManager,
      brandingStore
    );

    createWindow();
    registerShortcuts();

    // Detect hardware encoders after the window is up so probing doesn't compete with startup.
    // Results are cached on disk, so this is instant after the first launch.
    const detect = () => EncoderDetector.detectEncoders(profile.gpus.join('|')).then((encoders) => {
      console.log(`[Hardware Detection] Available encoders: ${encoders.filter(e => e.isAvailable).map(e => e.name).join(', ')}`);
    }).catch(console.error);
    if (mainWindow) mainWindow.once('ready-to-show', () => setTimeout(detect, 1500));
    else detect();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
