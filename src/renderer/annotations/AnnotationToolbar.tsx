import React from 'react';
import {
  PenTool,
  Highlighter,
  ArrowUpRight,
  Minus,
  Square,
  Circle,
  Type,
  Zap,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  MousePointer,
  Sliders,
  Palette,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AnnotationTool } from '../../shared/types';

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  color: string;
  setColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearAll: () => void;
  isAnnotationEnabled: boolean;
  setIsAnnotationEnabled: (enabled: boolean) => void;
}

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f59e0b', // Amber/Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ffffff', // White
  '#111827', // Black
];

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  activeTool,
  setActiveTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  opacity,
  setOpacity,
  undo,
  redo,
  canUndo,
  canRedo,
  clearAll,
  isAnnotationEnabled,
  setIsAnnotationEnabled,
}) => {
  const tools: { id: AnnotationTool; label: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Interact / Pass-through', icon: <MousePointer className="w-4 h-4" /> },
    { id: 'pen', label: 'Pen', icon: <PenTool className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="w-4 h-4" /> },
    { id: 'line', label: 'Line', icon: <Minus className="w-4 h-4" /> },
    { id: 'rect', label: 'Rectangle', icon: <Square className="w-4 h-4" /> },
    { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
    { id: 'text', label: 'Text Note', icon: <Type className="w-4 h-4" /> },
    { id: 'laser', label: 'Laser Pointer', icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-[#14161f]/95 backdrop-blur-md border border-[#2b3040] rounded-2xl px-3 py-2 flex items-center gap-3 shadow-2xl text-xs select-none">
      {/* Enable / Disable Annotation Mode Toggle */}
      <button
        onClick={() => setIsAnnotationEnabled(!isAnnotationEnabled)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
          isAnnotationEnabled
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50 hover:bg-blue-600/40'
            : 'bg-gray-800/80 text-gray-400 hover:text-white border border-transparent'
        }`}
        title="Toggle Drawing Mode"
      >
        {isAnnotationEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">Draw Mode</span>
      </button>

      <div className="w-[1px] h-6 bg-[#2a2f40]" />

      {/* Tools Group */}
      <div className="flex items-center gap-1">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTool(t.id);
              if (!isAnnotationEnabled && t.id !== 'select') {
                setIsAnnotationEnabled(true);
              }
            }}
            className={`p-2 rounded-lg transition-all ${
              activeTool === t.id && isAnnotationEnabled
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#202433]'
            }`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="w-[1px] h-6 bg-[#2a2f40]" />

      {/* Color Palette */}
      <div className="flex items-center gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border transition-transform ${
              color.toLowerCase() === c.toLowerCase()
                ? 'scale-125 border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                : 'border-transparent hover:scale-110 opacity-80 hover:opacity-100'
            }`}
            style={{ backgroundColor: c }}
            title={`Select Color: ${c}`}
          />
        ))}

        {/* Custom Color Input */}
        <div className="relative flex items-center justify-center w-5 h-5 rounded-full overflow-hidden border border-[#373e52] hover:border-white">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title="Custom Color"
          />
          <Palette className="w-3 h-3 text-gray-300 pointer-events-none" />
        </div>
      </div>

      <div className="w-[1px] h-6 bg-[#2a2f40]" />

      {/* Stroke Width Slider */}
      <div className="flex items-center gap-2" title="Brush Thickness">
        <span className="text-[10px] text-gray-400 font-mono-numbers w-4 text-right">{strokeWidth}</span>
        <input
          type="range"
          min="2"
          max="24"
          step="1"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
          className="w-16 h-1.5 bg-[#252a3a] rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      <div className="w-[1px] h-6 bg-[#2a2f40]" />

      {/* Undo, Redo, Clear */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`p-2 rounded-lg transition-colors ${
            canUndo ? 'text-gray-300 hover:text-white hover:bg-[#202433]' : 'text-gray-600 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`p-2 rounded-lg transition-colors ${
            canRedo ? 'text-gray-300 hover:text-white hover:bg-[#202433]' : 'text-gray-600 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={clearAll}
          className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
          title="Clear All Annotations"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
