import { app, BrowserWindow, globalShortcut, Menu, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConfigStore } from './storage/configStore';
import { RecordingsStore } from './storage/recordingsStore';
import { ScenesStore } from './storage/scenesStore';
import { ScreenCaptureManager } from './capture/screenCapture';
import { RecordingManager } from './recording/recordingManager';
import { StreamingManager } from './streaming/streamingManager';
import { EncoderDetector } from './recording/encoderDetector';
import { registerIpcHandlers } from './ipc';

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
let screenCaptureManager: ScreenCaptureManager;
let recordingManager: RecordingManager;
let streamingManager: StreamingManager;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0c0d10',
    title: 'Live Studio',
    webPreferences: {
      preload: fs.existsSync(path.join(__dirname, '../preload/index.cjs'))
        ? path.join(__dirname, '../preload/index.cjs')
        : path.join(__dirname, '../preload/index.js'),
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

  const htmlPath = path.join(__dirname, '../renderer/index.html');
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
  } else {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadFile(htmlPath);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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
          mainWindow?.webContents.send('shortcut:toggleAnnotation');
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
    screenCaptureManager = new ScreenCaptureManager();
    recordingManager = new RecordingManager(recordingsStore);
    streamingManager = new StreamingManager(() => mainWindow);

    // Modern Electron getDisplayMedia handler with system loopback audio
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await screenCaptureManager.getAvailableSources();
        const targetId = screenCaptureManager.getSelectedDisplayId();
        const chosen = sources.find((s) => s.id === targetId) ||
                       sources.find((s) => s.isDisplay) ||
                       sources[0];

        if (chosen) {
          console.log(`[DisplayMedia] Granting display capture for: "${chosen.name}" (${chosen.id})`);
          callback({ video: chosen as any, audio: 'loopback' });
        } else {
          callback({});
        }
      } catch (err) {
        console.error('[DisplayMedia] Error in handler:', err);
        callback({});
      }
    });

    // Detect hardware encoders in background
    EncoderDetector.detectEncoders().then((encoders) => {
      console.log(`[Hardware Detection] Available encoders: ${encoders.filter(e => e.isAvailable).map(e => e.name).join(', ')}`);
    }).catch(console.error);

    registerIpcHandlers(
      () => mainWindow,
      configStore,
      recordingsStore,
      scenesStore,
      recordingManager,
      streamingManager,
      screenCaptureManager
    );

    createWindow();
    registerShortcuts();

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
