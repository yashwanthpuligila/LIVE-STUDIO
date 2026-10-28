import React, { useEffect, useRef, useState } from 'react';
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
  MousePointer2,
  Palette,
  Eye,
  EyeOff,
  GripVertical,
  ChevronUp,
  AppWindow,
  X,
} from 'lucide-react';
import { AnnotationTool } from '../../shared/types';
import { TOOL_SHORTCUTS } from './useAnnotationShortcuts';

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  color: string;
  setColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearAll: () => void;
  /** Studio only: draw mode on/off for the preview */
  isAnnotationEnabled?: boolean;
  setIsAnnotationEnabled?: (enabled: boolean) => void;
  /** 'floating' is the on-screen toolbar shown over the desktop while sharing a display */
  variant?: 'studio' | 'floating';
  onCollapse?: () => void;
  onOpenStudio?: () => void;
  onClose?: () => void;
  /** Floating only: extra controls shown right after the drag handle (recording controls) */
  leading?: React.ReactNode;
}

export const PRESET_COLORS = [
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#facc15', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#111827', // Black
];

type ToolDef = { id: AnnotationTool; label: string; icon: React.ReactNode };

const ic = 'w-4 h-4';
const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', label: 'Pointer', icon: <MousePointer2 className={ic} /> },
    { id: 'pen', label: 'Pen', icon: <PenTool className={ic} /> },
    { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className={ic} /> },
    { id: 'eraser', label: 'Eraser', icon: <Eraser className={ic} /> },
  ],
  [
    { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className={ic} /> },
    { id: 'line', label: 'Line', icon: <Minus className={ic} /> },
    { id: 'rect', label: 'Rectangle', icon: <Square className={ic} /> },
    { id: 'circle', label: 'Ellipse', icon: <Circle className={ic} /> },
    { id: 'text', label: 'Text', icon: <Type className={ic} /> },
  ],
  [{ id: 'laser', label: 'Laser pointer', icon: <Zap className={ic} /> }],
];

const Divider = () => <div className="w-px h-6 bg-white/10 shrink-0" />;

const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, active, disabled, danger, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={`relative w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
      active
        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
        : disabled
          ? 'text-gray-600 cursor-not-allowed'
          : danger
            ? 'text-red-400 hover:text-red-300 hover:bg-red-500/15'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
    }`}
  >
    {children}
  </button>
);

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  activeTool,
  setActiveTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  undo,
  redo,
  canUndo,
  canRedo,
  clearAll,
  isAnnotationEnabled = true,
  setIsAnnotationEnabled,
  variant = 'studio',
  onCollapse,
  onOpenStudio,
  onClose,
  leading,
}) => {
  const floating = variant === 'floating';
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Close the colour popover on any click outside it
  useEffect(() => {
    if (!paletteOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!paletteRef.current?.contains(e.target as Node)) setPaletteOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [paletteOpen]);

  const pickTool = (tool: AnnotationTool) => {
    setActiveTool(tool);
    if (setIsAnnotationEnabled && !isAnnotationEnabled && tool !== 'select') setIsAnnotationEnabled(true);
  };

  const drawing = isAnnotationEnabled && activeTool !== 'select';
  const dot = Math.max(4, Math.min(18, strokeWidth));

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-2xl text-xs select-none border shadow-2xl backdrop-blur-md ${
        floating ? 'bg-[#11131a]/95 border-white/10' : 'bg-[#14161f]/95 border-[#2b3040]'
      }`}
    >
      {floating ? (
        <div
          className="flex items-center gap-1.5 pl-0.5 pr-1 h-8 text-gray-500 cursor-grab [-webkit-app-region:drag]"
          title="Drag to move"
        >
          <GripVertical className="w-4 h-4" />
          <span
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
              drawing ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400'
            }`}
          >
            {drawing ? 'Drawing' : 'Mouse'}
          </span>
        </div>
      ) : (
        setIsAnnotationEnabled && (
          <button
            onClick={() => setIsAnnotationEnabled(!isAnnotationEnabled)}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg font-medium transition-colors shrink-0 ${
              isAnnotationEnabled
                ? 'bg-blue-600/25 text-blue-300 border border-blue-500/50 hover:bg-blue-600/35'
                : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
            }`}
            title={isAnnotationEnabled ? 'Hide drawing tools on the preview' : 'Draw on the preview'}
          >
            {isAnnotationEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">Draw</span>
          </button>
        )
      )}

      {floating && leading && (
        <>
          <Divider />
          {leading}
        </>
      )}

      {TOOL_GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          <Divider />
          <div className="flex items-center gap-0.5">
            {group.map((t) => (
              <IconButton
                key={t.id}
                onClick={() => pickTool(t.id)}
                active={activeTool === t.id && (isAnnotationEnabled || t.id === 'select')}
                title={`${t.label} (${TOOL_SHORTCUTS[t.id]})`}
              >
                {t.icon}
              </IconButton>
            ))}
          </div>
        </React.Fragment>
      ))}

      <Divider />

      {/* Colour: current swatch opens the palette */}
      <div className="relative" ref={paletteRef}>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
          title="Colour"
          aria-label="Colour"
        >
          <span className="w-5 h-5 rounded-full border-2 border-white/80 shadow" style={{ backgroundColor: color }} />
        </button>
        {paletteOpen && (
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-2 rounded-xl bg-[#11131a] border border-white/10 shadow-2xl grid grid-cols-5 gap-1.5 w-max">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  setPaletteOpen(false);
                }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color.toLowerCase() === c ? 'border-white scale-110' : 'border-white/15'
                }`}
                style={{ backgroundColor: c }}
                title={c}
                aria-label={`Colour ${c}`}
              />
            ))}
            <label
              className="col-span-5 mt-1 flex items-center justify-center gap-1.5 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer"
              title="Custom colour"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Custom</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="sr-only" />
            </label>
          </div>
        )}
      </div>

      {/* Thickness with a live size dot */}
      <div className="flex items-center gap-2 pr-1" title={`Thickness: ${strokeWidth}`}>
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          <span className="rounded-full" style={{ width: dot, height: dot, backgroundColor: color }} />
        </span>
        <input
          type="range"
          min="2"
          max="24"
          step="1"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
          className="w-16 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
          aria-label="Thickness"
        />
      </div>

      <Divider />

      <div className="flex items-center gap-0.5">
        <IconButton onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className={ic} />
        </IconButton>
        <IconButton onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
          <Redo2 className={ic} />
        </IconButton>
        <IconButton onClick={clearAll} danger title="Clear all drawings">
          <Trash2 className={ic} />
        </IconButton>
      </div>

      {floating && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5">
            {onOpenStudio && (
              <IconButton onClick={onOpenStudio} title="Show KLH Lecture Studio">
                <AppWindow className={ic} />
              </IconButton>
            )}
            {onCollapse && (
              <IconButton onClick={onCollapse} title="Hide toolbar">
                <ChevronUp className={ic} />
              </IconButton>
            )}
            {onClose && (
              <IconButton onClick={onClose} danger title="Stop drawing on screen">
                <X className={ic} />
              </IconButton>
            )}
          </div>
        </>
      )}
    </div>
  );
};
