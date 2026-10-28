import React, { useEffect, useRef, useState } from 'react';
import { SceneSource } from '../../shared/types';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface SourceTransformLayerProps {
  sources: SceneSource[];
  /** Composition size in canvas pixels */
  canvasWidth: number;
  canvasHeight: number;
  /** Banner strip height in canvas pixels; source percentages apply to the area below it */
  contentTop: number;
  /** Pointer mode: every webcam can be grabbed. Otherwise only the selected one (so drawing still works). */
  pointerMode: boolean;
  selectedSourceId: string | null;
  onSelect: (id: string) => void;
  /** commit=false while dragging, true once on release (persist then) */
  onChange: (id: string, updates: Partial<SceneSource>, commit: boolean) => void;
}

const MIN_WIDTH_PCT = 6;

/**
 * Move/resize frames for webcam overlays on top of the letterboxed preview canvas.
 * Corner handles keep the camera's aspect ratio.
 */
export const SourceTransformLayer: React.FC<SourceTransformLayerProps> = ({
  sources,
  canvasWidth,
  canvasHeight,
  contentTop,
  pointerMode,
  selectedSourceId,
  onSelect,
  onChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const dragRef = useRef<{
    id: string;
    handle: Handle;
    startX: number;
    startY: number;
    src: SceneSource;
    last: Partial<SceneSource> | null;
  } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Same object-contain letterboxing as the preview canvas
  const scale = Math.min(box.w / canvasWidth, box.h / canvasHeight) || 0;
  const offX = (box.w - canvasWidth * scale) / 2;
  const offY = (box.h - canvasHeight * scale) / 2;
  const areaH = canvasHeight - contentTop;

  const toCss = (s: SceneSource) => ({
    left: offX + (s.x / 100) * canvasWidth * scale,
    top: offY + (contentTop + (s.y / 100) * areaH) * scale,
    width: (s.width / 100) * canvasWidth * scale,
    height: (s.height / 100) * areaH * scale,
  });

  const begin = (e: React.PointerEvent, s: SceneSource, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(s.id);
    if (s.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: s.id, handle, startX: e.clientX, startY: e.clientY, src: s, last: null };
    setDragging(s.id);
  };

  const move = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || scale === 0) return;
    // Pointer delta in source percentage units
    const dx = ((e.clientX - d.startX) / scale / canvasWidth) * 100;
    const dy = ((e.clientY - d.startY) / scale / areaH) * 100;
    const s = d.src;
    let next: Partial<SceneSource>;

    if (d.handle === 'move') {
      next = {
        x: Math.max(0, Math.min(100 - s.width, s.x + dx)),
        y: Math.max(0, Math.min(100 - s.height, s.y + dy)),
      };
    } else {
      // Width/height ratio in percentage units that keeps the on-screen aspect ratio
      const ratio = s.height / s.width;
      const left = d.handle === 'nw' || d.handle === 'sw';
      const up = d.handle === 'nw' || d.handle === 'ne';
      // Follow whichever axis the pointer moved further along
      const byX = left ? -dx : dx;
      const byY = (up ? -dy : dy) / ratio;
      let w = s.width + (Math.abs(byX) > Math.abs(byY) ? byX : byY);
      // Keep within bounds on the anchored side
      const maxW = left ? s.x + s.width : 100 - s.x;
      const maxH = up ? s.y + s.height : 100 - s.y;
      w = Math.max(MIN_WIDTH_PCT, Math.min(w, maxW, maxH / ratio));
      const h = w * ratio;
      next = {
        width: w,
        height: h,
        x: left ? s.x + s.width - w : s.x,
        y: up ? s.y + s.height - h : s.y,
      };
    }
    const rounded = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Math.round((v as number) * 10) / 10]));
    d.last = rounded;
    onChange(d.id, rounded, false);
  };

  const end = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    if (d?.last) onChange(d.id, d.last, true);
  };

  const cams = sources.filter((s) => s.visible && s.type === 'webcam');

  return (
    <div ref={rootRef} className="absolute inset-0 z-[25] pointer-events-none">
      {scale > 0 &&
        cams.map((s) => {
          const r = toCss(s);
          const selected = s.id === selectedSourceId;
          const grabbable = pointerMode || selected;
          if (!grabbable) return null;
          const active = selected || dragging === s.id;
          const corner = (h: Handle, cls: string, cursor: string) => (
            <div
              key={h}
              onPointerDown={(e) => begin(e, s, h)}
              className={`absolute w-3.5 h-3.5 rounded-sm bg-white border-2 border-blue-500 shadow pointer-events-auto ${cls}`}
              style={{ cursor }}
            />
          );
          return (
            <div
              key={s.id}
              onPointerDown={(e) => begin(e, s, 'move')}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className={`group absolute pointer-events-auto touch-none ${s.locked ? 'cursor-not-allowed' : 'cursor-move'} ${
                active ? 'outline outline-2 outline-blue-500' : 'hover:outline hover:outline-2 hover:outline-blue-400/70'
              }`}
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
              title={s.locked ? `${s.name} is locked` : 'Drag to move · drag a corner to resize'}
            >
              {active && !s.locked && (
                <>
                  {corner('nw', '-left-2 -top-2', 'nwse-resize')}
                  {corner('ne', '-right-2 -top-2', 'nesw-resize')}
                  {corner('sw', '-left-2 -bottom-2', 'nesw-resize')}
                  {corner('se', '-right-2 -bottom-2', 'nwse-resize')}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
};
