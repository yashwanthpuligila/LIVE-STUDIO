import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

export function preloadPath(): string {
  const cjs = path.join(__dirname, '../preload/index.cjs');
  return fs.existsSync(cjs) ? cjs : path.join(__dirname, '../preload/index.js');
}

/** Loads the renderer bundle; `hash` selects an alternate root (e.g. the screen overlay). */
export function loadRendererPage(win: BrowserWindow, hash = '') {
  const htmlPath = path.join(__dirname, '../renderer/index.html');
  const suffix = hash ? `#${hash}` : '';
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL + suffix);
  } else if (fs.existsSync(htmlPath)) {
    win.loadFile(htmlPath, hash ? { hash } : undefined);
  } else {
    win.loadURL('http://localhost:5173' + suffix).catch(() => {
      win.loadFile(htmlPath, hash ? { hash } : undefined);
    });
  }
}
