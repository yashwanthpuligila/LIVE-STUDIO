import React, { useState, useEffect } from 'react';
import { Sliders, Camera, X } from 'lucide-react';
import { SceneSource } from '../../shared/types';

interface PropertiesPanelProps {
  source: SceneSource | null;
  onUpdateSource: (id: string, updates: Partial<SceneSource>) => void;
  onClose: () => void;
  videoDevices: { deviceId: string; label: string }[];
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  source,
  onUpdateSource,
  onClose,
  videoDevices,
}) => {
  if (!source) {
    return (
      <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-4 flex flex-col items-center justify-center text-gray-500 text-xs h-full">
        <Sliders className="w-6 h-6 mb-2 opacity-40 text-blue-400" />
        <span>Select a source to inspect and adjust its properties</span>
      </div>
    );
  }

  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-4 flex flex-col gap-4 shadow-lg text-xs h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
        <div className="flex items-center gap-2 text-gray-200 font-semibold">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>Properties: {source.name}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#202534]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-gray-400 font-medium">Source Name</label>
        <input
          type="text"
          value={source.name}
          onChange={(e) => onUpdateSource(source.id, { name: e.target.value })}
          className="bg-[#191c26] border border-[#2a3042] rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Camera Device picker if webcam */}
      {source.type === 'webcam' && (
        <div className="flex flex-col gap-1.5 bg-[#181b26] p-2.5 rounded-lg border border-[#252b3d]">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <Camera className="w-3.5 h-3.5" />
            <span>Webcam Device</span>
          </div>
          <select
            value={source.deviceId || ''}
            onChange={(e) => onUpdateSource(source.id, { deviceId: e.target.value })}
            className="bg-[#10121a] border border-[#2f3547] rounded px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="">Default Camera</option>
            {videoDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Text properties if text type */}
      {source.type === 'text' && (
        <div className="flex flex-col gap-2.5 bg-[#181b26] p-2.5 rounded-lg border border-[#252b3d]">
          <label className="text-amber-400 font-medium">Text Content</label>
          <input
            type="text"
            value={source.text || ''}
            onChange={(e) => onUpdateSource(source.id, { text: e.target.value })}
            className="bg-[#10121a] border border-[#2f3547] rounded px-2 py-1.5 text-gray-200"
          />

          <div className="flex items-center justify-between">
            <span className="text-gray-400">Font Size</span>
            <input
              type="number"
              min="16"
              max="120"
              value={source.fontSize || 48}
              onChange={(e) => onUpdateSource(source.id, { fontSize: parseInt(e.target.value, 10) })}
              className="bg-[#10121a] border border-[#2f3547] rounded w-20 px-2 py-1 text-right text-gray-200"
            />
          </div>
        </div>
      )}

      {/* Transform Layout */}
      <div className="flex flex-col gap-3 bg-[#181b26] p-3 rounded-lg border border-[#252b3d]">
        <span className="text-gray-300 font-medium">Layout & Positioning (%)</span>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-500 text-[10px]">Position X</label>
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(source.x)}
              onChange={(e) => onUpdateSource(source.id, { x: parseFloat(e.target.value) || 0 })}
              className="bg-[#10121a] border border-[#2a3042] rounded px-2 py-1 w-full text-gray-200"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[10px]">Position Y</label>
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(source.y)}
              onChange={(e) => onUpdateSource(source.id, { y: parseFloat(e.target.value) || 0 })}
              className="bg-[#10121a] border border-[#2a3042] rounded px-2 py-1 w-full text-gray-200"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[10px]">Width</label>
            <input
              type="number"
              min="5"
              max="100"
              value={Math.round(source.width)}
              onChange={(e) => onUpdateSource(source.id, { width: parseFloat(e.target.value) || 10 })}
              className="bg-[#10121a] border border-[#2a3042] rounded px-2 py-1 w-full text-gray-200"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[10px]">Height</label>
            <input
              type="number"
              min="5"
              max="100"
              value={Math.round(source.height)}
              onChange={(e) => onUpdateSource(source.id, { height: parseFloat(e.target.value) || 10 })}
              className="bg-[#10121a] border border-[#2a3042] rounded px-2 py-1 w-full text-gray-200"
            />
          </div>
        </div>

        {/* Quick presets for webcam / source */}
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={() => onUpdateSource(source.id, { x: 0, y: 0, width: 100, height: 100 })}
            className="flex-1 py-1 rounded bg-[#252a3a] hover:bg-[#32394e] text-[10px] text-gray-300 transition-colors"
          >
            Full Screen
          </button>
          <button
            onClick={() => onUpdateSource(source.id, { x: 74, y: 70, width: 24, height: 26, borderRadius: 12 })}
            className="flex-1 py-1 rounded bg-[#252a3a] hover:bg-[#32394e] text-[10px] text-gray-300 transition-colors"
          >
            Bottom-Right PiP
          </button>
          <button
            onClick={() => onUpdateSource(source.id, { x: 2, y: 70, width: 24, height: 26, borderRadius: 12 })}
            className="flex-1 py-1 rounded bg-[#252a3a] hover:bg-[#32394e] text-[10px] text-gray-300 transition-colors"
          >
            Bottom-Left PiP
          </button>
        </div>
      </div>

      {/* Appearance: Opacity & Border Radius */}
      <div className="flex flex-col gap-3 bg-[#181b26] p-3 rounded-lg border border-[#252b3d]">
        <span className="text-gray-300 font-medium">Appearance</span>

        {/* Opacity */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-gray-400 text-[10px]">
            <span>Opacity</span>
            <span>{Math.round((source.opacity ?? 1.0) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={source.opacity ?? 1.0}
            onChange={(e) => onUpdateSource(source.id, { opacity: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-[#252a3a] rounded appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Corner Radius */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-gray-400 text-[10px]">
            <span>Corner Radius</span>
            <span>{source.borderRadius || 0}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={source.borderRadius || 0}
            onChange={(e) => onUpdateSource(source.id, { borderRadius: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 bg-[#252a3a] rounded appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>
    </div>
  );
};
