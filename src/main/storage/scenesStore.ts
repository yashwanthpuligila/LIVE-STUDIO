import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { Scene } from '../../shared/types';

const defaultScenes: Scene[] = [
  {
    id: 'scene-tutorial',
    name: 'Screen Tutorial',
    isSelected: true,
    sources: [
      {
        id: 'source-screen-main',
        name: 'Primary Screen',
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
  },
  {
    id: 'scene-screen-cam',
    name: 'Screen + Webcam PiP',
    isSelected: false,
    sources: [
      {
        id: 'source-screen-bg',
        name: 'Desktop Capture',
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
      {
        id: 'source-webcam-pip',
        name: 'Webcam Overlay',
        type: 'webcam',
        x: 76,
        y: 70,
        width: 22,
        height: 26,
        zIndex: 2,
        visible: true,
        locked: false,
        opacity: 1,
        borderRadius: 12,
      },
    ],
  },
  {
    id: 'scene-webcam-only',
    name: 'Webcam Presentation',
    isSelected: false,
    sources: [
      {
        id: 'source-cam-main',
        name: 'Presenter Camera',
        type: 'webcam',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 1,
        visible: true,
        locked: false,
        opacity: 1,
      },
    ],
  },
];

export class ScenesStore {
  private filePath: string;
  private scenes: Scene[] = [];

  constructor() {
    const userData = app.getPath('userData');
    this.filePath = path.join(userData, 'live_studio_scenes.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.scenes = JSON.parse(raw);
        if (!this.scenes || this.scenes.length === 0) {
          this.scenes = defaultScenes;
        }
      } else {
        this.scenes = defaultScenes;
        this.save();
      }
    } catch (err) {
      console.error('Error loading scenes:', err);
      this.scenes = defaultScenes;
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.scenes, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving scenes:', err);
    }
  }

  public getScenes(): Scene[] {
    return [...this.scenes];
  }

  public setScenes(scenes: Scene[]): Scene[] {
    this.scenes = scenes;
    this.save();
    return this.scenes;
  }
}
