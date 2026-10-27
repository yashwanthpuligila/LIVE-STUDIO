import path from 'path';
import fs from 'fs';
let appInstance: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  appInstance = electron.app;
} catch {}

export function getFFmpegPath(): string {
  // 1. Check if ffmpeg-static module path exists
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string') {
      // In packaged electron app, fix asar unpack path
      const unpackedPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpackedPath)) {
        return unpackedPath;
      }
      if (fs.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
      }
    }
  } catch (e) {
    console.warn('ffmpeg-static require failed:', e);
  }

  // 2. Check resources directory in packaged app
  const appPath = appInstance ? appInstance.getAppPath() : process.cwd();
  const resourcesPath = process.resourcesPath || path.dirname(appPath);
  const candidatePaths = [
    path.join(resourcesPath, 'ffmpeg.exe'),
    path.join(resourcesPath, 'bin', 'ffmpeg.exe'),
    path.join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    'ffmpeg.exe',
    'ffmpeg',
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback to system command
  return 'ffmpeg';
}
