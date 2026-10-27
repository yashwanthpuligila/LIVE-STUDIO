import React, { useState, useEffect } from 'react';
import { Monitor, AppWindow, RefreshCw, X, Check, Info } from 'lucide-react';
import { DesktopSource } from '../../shared/types';

interface SourcePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource: (source: DesktopSource) => void;
  selectedSourceId?: string;
}

export const SourcePickerModal: React.FC<SourcePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectSource,
  selectedSourceId,
}) => {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [activeTab, setActiveTab] = useState<'screen' | 'window'>('screen');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (window.electronAPI && window.electronAPI.screenCapture) {
        const res = await window.electronAPI.screenCapture.getSources();
        setSources(res);
      } else {
        // Fallback for dev mode
        setSources([
          { id: 'screen:0:0', name: 'Display 1: Entire Screen (1920x1080 - Primary)', thumbnail: '', isDisplay: true },
          { id: 'window:1234:0', name: 'Google Chrome', thumbnail: '', isDisplay: false },
        ]);
      }
    } catch (err: any) {
      setError(`Failed to retrieve capturable sources: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSources();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const screens = sources.filter((s) => s.isDisplay || s.id.startsWith('screen:'));
  // Filter out Live Studio from application windows to prevent infinite mirror confusion
  const windows = sources.filter((s) => !s.isDisplay && !s.id.startsWith('screen:'));
  const displaySources = activeTab === 'screen' ? screens : windows;

  const handleSelect = async (source: DesktopSource) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.screenCapture.selectDisplay(source.id);
      }
      onSelectSource(source);
      onClose();
    } catch (e) {
      console.error('Error selecting source:', e);
      onSelectSource(source);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="bg-[#14161f] border border-[#2b3040] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242938]">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">Select Capture Display or Window</h2>
              <p className="text-[11px] text-gray-400">
                To capture your entire desktop and switch between apps smoothly, select <strong>Entire Display</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSources}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#202534] transition-colors"
              title="Refresh Sources"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#202534] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-[#242938] px-6 gap-6 bg-[#10121a]">
          <button
            onClick={() => setActiveTab('screen')}
            className={`flex items-center gap-2 py-3 border-b-2 font-medium text-xs transition-colors ${
              activeTab === 'screen'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Entire Display Monitor ({screens.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('window')}
            className={`flex items-center gap-2 py-3 border-b-2 font-medium text-xs transition-colors ${
              activeTab === 'window'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <AppWindow className="w-4 h-4" />
            <span>Single Application Window ({windows.length})</span>
          </button>
        </div>

        {/* Info Notification */}
        {activeTab === 'screen' && (
          <div className="bg-blue-600/10 border-b border-blue-500/20 px-6 py-2 flex items-center gap-2 text-[11px] text-blue-300">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
            <span>
              Captures your entire desktop screen. When you switch to Chrome, File Explorer, or PowerPoint, your recording will continuously capture those applications.
            </span>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-xs gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
              <span>Scanning available monitors and windows...</span>
            </div>
          ) : displaySources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-xs gap-2">
              <p>No capturable {activeTab === 'screen' ? 'monitors' : 'windows'} found.</p>
              <p className="text-[11px] text-gray-600">Ensure displays and windows are connected and not minimized.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displaySources.map((source) => {
                const isSelected = selectedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => handleSelect(source)}
                    className={`group relative flex flex-col rounded-xl overflow-hidden border cursor-pointer transition-all hover:scale-[1.02] ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
                        : 'border-[#262b3c] bg-[#181b26] hover:border-[#3d4560]'
                    }`}
                  >
                    {/* Thumbnail preview */}
                    <div className="aspect-video bg-[#0d0e14] relative overflow-hidden flex items-center justify-center">
                      {source.thumbnail ? (
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Monitor className="w-10 h-10 text-gray-600" />
                      )}

                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-1 shadow">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {source.isDisplay && (
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-blue-600/90 text-white font-mono text-[9px]">
                          DESKTOP MONITOR
                        </div>
                      )}
                    </div>

                    {/* Title label */}
                    <div className="p-3 flex items-center gap-2">
                      {source.appIcon ? (
                        <img src={source.appIcon} alt="" className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <Monitor className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium text-gray-200 truncate" title={source.name}>
                        {source.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
