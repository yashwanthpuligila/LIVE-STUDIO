import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import { AppSettings } from '../../shared/types';

const defaultSettings: AppSettings = {
  recordingProfile: 'balanced',
  resolutionPreset: '1080p',
  width: 1920,
  height: 1080,
  fps: 30, // Balanced default for smooth, low-CPU operation
  videoBitrateKbps: 5000,
  audioBitrateKbps: 160,
  recordingDir: '',
  defaultMicId: 'default',
  defaultWebcamId: 'default',
  includeSystemAudio: true,
  noiseSuppression: true,
  echoCancellation: true,
  youtubeStreamKey: '',
  youtubeRtmpUrl: 'rtmps://a.rtmp.youtube.com/live2',
  hardwareAcceleration: true,
  selectedEncoderId: '', // auto
  minimizeOnRecord: false,
  lowEndOptimization: true,
  shortcuts: {
    toggleRecord: 'CommandOrControl+Alt+R',
    pauseRecord: 'CommandOrControl+Alt+P',
    toggleStream: 'CommandOrControl+Alt+S',
    toggleAnnotation: 'CommandOrControl+Alt+D',
    clearAnnotation: 'CommandOrControl+Alt+C',
    undoAnnotation: 'CommandOrControl+Alt+Z',
    toggleMic: 'CommandOrControl+Alt+M',
    nextScene: 'CommandOrControl+Alt+Down',
    prevScene: 'CommandOrControl+Alt+Up',
  },
  obsEnabled: false,
  obsWebSocketUrl: 'ws://localhost:4455',
  obsWebSocketPassword: '',
};

export class ConfigStore {
  private configPath: string;
  private settings: AppSettings;
  private encryptedKeyPath: string;

  constructor() {
    const userData = app.getPath('userData');
    this.configPath = path.join(userData, 'live_studio_settings.json');
    this.encryptedKeyPath = path.join(userData, 'youtube_key.bin');
    
    // Ensure default recording dir exists in user Videos folder
    const videosDir = app.getPath('videos') || userData;
    const defaultRecDir = path.join(videosDir, 'LiveStudio');
    if (!fs.existsSync(defaultRecDir)) {
      try {
        fs.mkdirSync(defaultRecDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create default recording dir:', err);
      }
    }
    defaultSettings.recordingDir = defaultRecDir;
    this.settings = this.load();
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const merged = { ...defaultSettings, ...parsed };
        
        // Decrypt stream key if safeStorage is available
        merged.youtubeStreamKey = this.getDecryptedStreamKey(merged.youtubeStreamKey);
        return merged;
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
    return { ...defaultSettings };
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    // If stream key changed, encrypt it
    if (partial.youtubeStreamKey !== undefined) {
      this.saveEncryptedStreamKey(partial.youtubeStreamKey);
    }

    this.settings = { ...this.settings, ...partial };
    
    try {
      // Don't store plaintext stream key in json
      const toSave = { ...this.settings, youtubeStreamKey: '' };
      fs.writeFileSync(this.configPath, JSON.stringify(toSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving config:', err);
    }
    return this.settings;
  }

  private saveEncryptedStreamKey(key: string) {
    if (!key) {
      if (fs.existsSync(this.encryptedKeyPath)) {
        fs.unlinkSync(this.encryptedKeyPath);
      }
      return;
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key);
        fs.writeFileSync(this.encryptedKeyPath, encrypted);
      } else {
        // Fallback base64 obfuscation if OS encryption unavailable
        const buf = Buffer.from(key, 'utf-8').toString('base64');
        fs.writeFileSync(this.encryptedKeyPath, buf, 'utf-8');
      }
    } catch (e) {
      console.error('Failed to encrypt stream key:', e);
    }
  }

  private getDecryptedStreamKey(fallback: string): string {
    if (!fs.existsSync(this.encryptedKeyPath)) {
      return fallback || '';
    }
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = fs.readFileSync(this.encryptedKeyPath);
        return safeStorage.decryptString(buffer);
      } else {
        const b64 = fs.readFileSync(this.encryptedKeyPath, 'utf-8');
        return Buffer.from(b64, 'base64').toString('utf-8');
      }
    } catch (e) {
      console.error('Failed to decrypt stream key:', e);
      return '';
    }
  }
}
