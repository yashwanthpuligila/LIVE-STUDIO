import { app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { RecordingItem } from '../../shared/types';

export class RecordingsStore {
  private filePath: string;
  private recordings: RecordingItem[] = [];

  constructor() {
    const userData = app.getPath('userData');
    this.filePath = path.join(userData, 'live_studio_recordings.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.recordings = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error loading recordings registry:', err);
      this.recordings = [];
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.recordings, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving recordings registry:', err);
    }
  }

  public getAll(): RecordingItem[] {
    // Check if files still exist, update file size
    const valid: RecordingItem[] = [];
    for (const rec of this.recordings) {
      if (fs.existsSync(rec.filePath)) {
        try {
          const stat = fs.statSync(rec.filePath);
          rec.fileSize = stat.size;
          valid.push(rec);
        } catch {
          valid.push(rec);
        }
      }
    }
    this.recordings = valid;
    // Sort descending by date
    return [...this.recordings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public add(item: RecordingItem): RecordingItem {
    this.recordings.unshift(item);
    this.save();
    return item;
  }

  public update(id: string, partial: Partial<RecordingItem>): RecordingItem | null {
    const idx = this.recordings.findIndex(r => r.id === id);
    if (idx === -1) return null;
    this.recordings[idx] = { ...this.recordings[idx], ...partial };
    this.save();
    return this.recordings[idx];
  }

  public delete(id: string): boolean {
    const idx = this.recordings.findIndex(r => r.id === id);
    if (idx === -1) return false;
    const item = this.recordings[idx];

    // Delete MP4 file if exists
    if (fs.existsSync(item.filePath)) {
      try {
        fs.unlinkSync(item.filePath);
      } catch (e) {
        console.error('Failed to delete video file:', e);
      }
    }

    // Delete thumbnail if exists
    if (item.thumbnailPath && fs.existsSync(item.thumbnailPath)) {
      try {
        fs.unlinkSync(item.thumbnailPath);
      } catch (e) {
        console.error('Failed to delete thumbnail:', e);
      }
    }

    this.recordings.splice(idx, 1);
    this.save();
    return true;
  }

  public reveal(filePath: string): boolean {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  }
}
