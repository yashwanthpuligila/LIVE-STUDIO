import { desktopCapturer, screen } from 'electron';
import { DesktopSource } from '../../shared/types';

export class ScreenCaptureManager {
  private selectedDisplayId: string = '';

  public setSelectedDisplayId(id: string) {
    this.selectedDisplayId = id;
  }

  public getSelectedDisplayId(): string {
    return this.selectedDisplayId;
  }

  public async getAvailableSources(): Promise<DesktopSource[]> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });

      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();

      return sources.map((source, index) => {
        const isScreen = source.id.startsWith('screen:');
        let displayName = source.name;

        if (isScreen) {
          // Match with physical display if possible
          const matchedDisplay = displays.find(d => source.display_id === d.id.toString()) || displays[0];
          const isPrimary = matchedDisplay ? matchedDisplay.id === primaryDisplay.id : index === 0;
          const bounds = matchedDisplay ? `${matchedDisplay.bounds.width}x${matchedDisplay.bounds.height}` : '1920x1080';
          displayName = `Display ${index + 1}: Entire Screen (${bounds}${isPrimary ? ' - Primary' : ''})`;
        }

        return {
          id: source.id,
          name: displayName,
          thumbnail: source.thumbnail.toDataURL(),
          display_id: source.display_id,
          appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
          isDisplay: isScreen,
        };
      });
    } catch (error) {
      console.error('Failed to get capturable sources:', error);
      throw error;
    }
  }

  public async getPrimaryScreenSource(): Promise<DesktopSource | null> {
    const all = await this.getAvailableSources();
    const screens = all.filter(s => s.isDisplay);
    if (screens.length > 0) {
      if (!this.selectedDisplayId) {
        this.selectedDisplayId = screens[0].id;
      }
      return screens.find(s => s.id === this.selectedDisplayId) || screens[0];
    }
    return null;
  }
}
