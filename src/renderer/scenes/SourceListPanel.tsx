import React, { useState } from 'react';
import {
  Monitor,
  Camera,
  Type,
  Square,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { SceneSource, SourceType } from '../../shared/types';

interface SourceListPanelProps {
  sources: SceneSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteSource: (id: string) => void;
  onMoveSourceOrder: (id: string, direction: 'up' | 'down') => void;
  onOpenScreenPicker: () => void;
  onAddWebcamSource: () => void;
  onAddTextSource: () => void;
}

export const SourceListPanel: React.FC<SourceListPanelProps> = ({
  sources,
  selectedSourceId,
  onSelectSource,
  onToggleVisibility,
  onToggleLock,
  onDeleteSource,
  onMoveSourceOrder,
  onOpenScreenPicker,
  onAddWebcamSource,
  onAddTextSource,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'screen':
      case 'window':
        return <Monitor className="w-3.5 h-3.5 text-blue-400" />;
      case 'webcam':
        return <Camera className="w-3.5 h-3.5 text-emerald-400" />;
      case 'text':
        return <Type className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Square className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  // Sort sources in reverse z-order so highest layer is at top of UI list
  const sortedSources = [...sources].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col gap-2 shadow-lg h-full text-xs relative">
      <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
        <div className="flex items-center gap-2 text-gray-200 font-semibold text-xs">
          <Monitor className="w-4 h-4 text-blue-400" />
          <span>Sources</span>
        </div>

        {/* Add Source dropdown button */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="p-1 rounded-md bg-[#1f2433] hover:bg-[#2b3247] text-gray-300 hover:text-white transition-colors"
            title="Add Source"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {showAddMenu && (
            <div className="absolute right-0 bottom-full mb-1 z-30 w-48 bg-[#181b26] border border-[#2e3447] rounded-xl shadow-2xl p-1 flex flex-col gap-0.5 text-xs animate-in fade-in">
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenScreenPicker();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-200 hover:bg-[#252b3d] text-left"
              >
                <Monitor className="w-4 h-4 text-blue-400" />
                <span>Screen / Window</span>
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onAddWebcamSource();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-200 hover:bg-[#252b3d] text-left"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Webcam Camera</span>
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onAddTextSource();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-200 hover:bg-[#252b3d] text-left"
              >
                <Type className="w-4 h-4 text-amber-400" />
                <span>Text Overlay</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
        {sortedSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 text-gray-500 text-[11px] gap-1">
            <span>No sources in this scene</span>
            <button
              onClick={() => setShowAddMenu(true)}
              className="text-blue-400 hover:underline"
            >
              Add a source
            </button>
          </div>
        ) : (
          sortedSources.map((source, index) => {
            const isSelected = source.id === selectedSourceId;

            return (
              <div
                key={source.id}
                onClick={() => onSelectSource(source.id)}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-600/20 text-blue-200 border border-blue-500/50 shadow-sm'
                    : 'text-gray-300 hover:bg-[#1a1e2b] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getSourceIcon(source.type)}
                  <span className={`truncate font-medium ${!source.visible ? 'opacity-40 line-through' : ''}`}>
                    {source.name}
                  </span>
                </div>

                {/* Layer and Visibility Controls */}
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  {/* Layer Z-Order */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveSourceOrder(source.id, 'up');
                    }}
                    disabled={index === 0}
                    className={`p-1 ${index === 0 ? 'opacity-20' : 'hover:text-white text-gray-400'}`}
                    title="Move Layer Up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveSourceOrder(source.id, 'down');
                    }}
                    disabled={index === sortedSources.length - 1}
                    className={`p-1 ${
                      index === sortedSources.length - 1 ? 'opacity-20' : 'hover:text-white text-gray-400'
                    }`}
                    title="Move Layer Down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {/* Visibility */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(source.id);
                    }}
                    className="p-1 hover:text-white text-gray-400"
                    title={source.visible ? 'Hide Source' : 'Show Source'}
                  >
                    {source.visible ? (
                      <Eye className="w-3 h-3 text-gray-300" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-gray-600" />
                    )}
                  </button>

                  {/* Lock */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(source.id);
                    }}
                    className="p-1 hover:text-white text-gray-400"
                    title={source.locked ? 'Unlock Position' : 'Lock Position'}
                  >
                    {source.locked ? (
                      <Lock className="w-3 h-3 text-amber-400" />
                    ) : (
                      <Unlock className="w-3 h-3 text-gray-500" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSource(source.id);
                    }}
                    className="p-1 hover:text-red-400 text-gray-400"
                    title="Remove Source"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
