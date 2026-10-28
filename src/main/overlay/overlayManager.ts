import { BrowserWindow, Display, ipcMain, screen } from 'electron';
import { OverlayCommand, OverlayRecordingCommand, OverlayRecordingState, OverlayState } from '../../shared/types';
import { loadRendererPage, preloadPath } from '../window/rendererPage';

const TOOLBAR_TOP_MARGIN = 12;

/**
 * Draw-on-screen overlay for the display being shared. Two OS windows sit above everything:
 *  - ink: full-screen and transparent. It is part of the screen capture, so whatever is drawn on
 *    it lands in the recording and the live stream. Click-through while the Pointer tool is active.
 *  - toolbar: small floating panel with the drawing tools, excluded from screen capture so it
 *    never shows up in the video.
 * The ink window owns the drawing state; toolbar commands are relayed to it and its state is
 * relayed back to the toolbar.
 */
export class OverlayManager {
  private ink: BrowserWindow | null = null;
  private toolbar: BrowserWindow | null = null;
  private display: Display | null = null;
  private state: OverlayState | null = null;
  private recording: OverlayRecordingState | null = null;
  private drawing = false;
  private tearingDown = false;

  constructor(private getMainWindow: () => BrowserWindow | null) {
    this.registerIpc();
    screen.on('display-removed', (_e, removed) => {
      if (this.display && removed.id === this.display.id) this.hide();
    });
    screen.on('display-metrics-changed', (_e, changed) => {
      if (this.display && changed.id === this.display.id && this.ink && !this.ink.isDestroyed()) {
        this.display = changed;
        this.ink.setBounds(changed.bounds);
        this.placeToolbar();
      }
    });
  }

  public isVisible(): boolean {
    return !!this.ink && !this.ink.isDestroyed();
  }

  public show(displayId?: string) {
    const displays = screen.getAllDisplays();
    const target = displays.find((d) => String(d.id) === String(displayId)) ?? screen.getPrimaryDisplay();

    if (this.isVisible() && this.display?.id === target.id) {
      this.toolbar?.showInactive();
      return;
    }
    this.hide();
    this.display = target;
    this.drawing = false;

    const common = {
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    };

    const ink = new BrowserWindow({ ...common, ...target.bounds, movable: false, focusable: false, title: 'KLH Screen Ink' });
    ink.setAlwaysOnTop(true, 'screen-saver');
    ink.setIgnoreMouseEvents(true);
    // Setting bounds again after creation avoids an off-by-scale size on mixed-DPI setups
    ink.setBounds(target.bounds);
    ink.once('ready-to-show', () => ink.showInactive());
    ink.on('closed', () => this.onWindowClosed());
    loadRendererPage(ink, 'overlay-ink');
    this.ink = ink;

    const toolbar = new BrowserWindow({
      ...common,
      width: 720,
      height: 56,
      x: target.workArea.x + Math.round((target.workArea.width - 720) / 2),
      y: target.workArea.y + TOOLBAR_TOP_MARGIN,
      title: 'KLH Drawing Tools',
    });
    toolbar.setAlwaysOnTop(true, 'screen-saver', 1);
    // Keep the toolbar itself out of recordings and the live stream (Windows 10 2004+)
    toolbar.setContentProtection(true);
    toolbar.once('ready-to-show', () => toolbar.showInactive());
    toolbar.on('closed', () => this.onWindowClosed());
    loadRendererPage(toolbar, 'overlay-toolbar');
    this.toolbar = toolbar;

    this.notifyVisibility(true);
  }

  public hide() {
    if (this.tearingDown) return;
    this.tearingDown = true;
    for (const win of [this.ink, this.toolbar]) {
      if (win && !win.isDestroyed()) win.destroy();
    }
    const wasVisible = !!this.ink;
    this.ink = null;
    this.toolbar = null;
    this.display = null;
    this.state = null;
    this.drawing = false;
    this.tearingDown = false;
    if (wasVisible) this.notifyVisibility(false);
  }

  public sendCommand(cmd: OverlayCommand) {
    if (this.ink && !this.ink.isDestroyed()) this.ink.webContents.send('overlay:command', cmd);
  }

  private onWindowClosed() {
    // Either window going away (e.g. Alt+F4 on the toolbar) ends the overlay
    if (!this.tearingDown) this.hide();
  }

  private notifyVisibility(visible: boolean) {
    const main = this.getMainWindow();
    if (main && !main.isDestroyed()) main.webContents.send('overlay:visibility-changed', visible);
  }

  /** Pointer tool = clicks go to the apps underneath; any other tool = the ink layer takes the mouse. */
  private setDrawing(drawing: boolean) {
    const ink = this.ink;
    if (!ink || ink.isDestroyed() || drawing === this.drawing) return;
    this.drawing = drawing;
    if (drawing) {
      ink.setIgnoreMouseEvents(false);
      ink.setFocusable(true);
      ink.focus(); // so Esc, tool keys and text notes reach the ink layer
    } else {
      ink.setIgnoreMouseEvents(true);
      // Give the keyboard back to whatever app is underneath
      ink.blur();
      ink.setFocusable(false);
    }
    this.toolbar?.moveTop();
  }

  private placeToolbar(size?: { width: number; height: number }) {
    const tb = this.toolbar;
    if (!tb || tb.isDestroyed() || !this.display) return;
    const old = tb.getBounds();
    const width = Math.ceil(size?.width ?? old.width);
    const height = Math.ceil(size?.height ?? old.height);
    const area = this.display.workArea;
    // Grow/shrink around the current centre, but stay on this display
    let x = Math.round(old.x + (old.width - width) / 2);
    let y = old.y;
    x = Math.max(area.x, Math.min(x, area.x + area.width - width));
    y = Math.max(area.y, Math.min(y, area.y + area.height - height));
    tb.setBounds({ x, y, width, height });
  }

  private registerIpc() {
    ipcMain.handle('overlay:show', (_e, displayId?: string) => {
      this.show(displayId);
      return true;
    });
    ipcMain.handle('overlay:hide', () => {
      this.hide();
      return true;
    });
    ipcMain.handle('overlay:isVisible', () => this.isVisible());
    ipcMain.handle('overlay:getState', () => this.state);

    ipcMain.on('overlay:command', (_e, cmd: OverlayCommand) => this.sendCommand(cmd));

    ipcMain.on('overlay:state', (e, state: OverlayState) => {
      if (!this.ink || e.sender !== this.ink.webContents) return;
      this.state = state;
      this.setDrawing(state.tool !== 'select');
      if (this.toolbar && !this.toolbar.isDestroyed()) this.toolbar.webContents.send('overlay:state', state);
    });

    ipcMain.on('overlay:toolbarSize', (e, size: { width: number; height: number }) => {
      if (!this.toolbar || e.sender !== this.toolbar.webContents) return;
      this.placeToolbar(size);
    });

    // Recording controls on the toolbar drive the studio's recorder
    ipcMain.on('overlay:recordingState', (e, rec: OverlayRecordingState) => {
      const main = this.getMainWindow();
      if (!main || e.sender !== main.webContents) return;
      this.recording = rec;
      if (this.toolbar && !this.toolbar.isDestroyed()) this.toolbar.webContents.send('overlay:recording', rec);
    });
    ipcMain.handle('overlay:getRecordingState', () => this.recording);
    ipcMain.on('overlay:recordingCommand', (_e, cmd: OverlayRecordingCommand) => {
      const main = this.getMainWindow();
      if (main && !main.isDestroyed()) main.webContents.send('overlay:recording-command', cmd);
    });

    ipcMain.on('overlay:close', () => this.hide());

    ipcMain.on('overlay:openStudio', () => {
      const main = this.getMainWindow();
      if (!main || main.isDestroyed()) return;
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    });
  }
}
