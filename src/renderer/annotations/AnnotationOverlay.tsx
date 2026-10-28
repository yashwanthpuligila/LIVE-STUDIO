import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AnnotationElement, AnnotationPoint, AnnotationTool } from '../../shared/types';
import { createElementId, drawElement, drawLaser, eraserRadius, hitTestElement, LaserPoint } from './annotationRenderer';

interface AnnotationOverlayProps {
  activeTool: AnnotationTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  isEnabled: boolean;
  onAddElement: (element: AnnotationElement) => void;
  onBeginErase: () => void;
  onErase: (ids: Set<string>) => void;
  onEndErase: (changed: boolean) => void;
  updateLaser: (x: number, y: number, isActive: boolean) => void;
  getActiveLaserPoints: () => LaserPoint[];
  elements: AnnotationElement[];
  canvasWidth?: number;
  canvasHeight?: number;
  laserRadius?: number;
}

export const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({
  activeTool,
  color,
  strokeWidth,
  opacity,
  isEnabled,
  onAddElement,
  onBeginErase,
  onErase,
  onEndErase,
  updateLaser,
  getActiveLaserPoints,
  elements,
  canvasWidth = 1920,
  canvasHeight = 1080,
  laserRadius = 28,
}) => {
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const eraserRingRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<AnnotationPoint[]>([]);
  // Pointer events can arrive far faster than the display refreshes; coalesce previews to one per frame
  const previewRafRef = useRef<number | null>(null);
  // Eraser drag state: elements already removed in this drag
  const erasedIdsRef = useRef<Set<string>>(new Set());
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const interactive = isEnabled && activeTool !== 'select';

  // Text input state
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, canvasX: 0, canvasY: 0, text: '' });

  // The canvas is letterboxed with object-contain, so map against the drawn area, not the element box
  const getContentBox = useCallback(() => {
    const rect = activeCanvasRef.current!.getBoundingClientRect();
    const scale = Math.min(rect.width / canvasWidth, rect.height / canvasHeight);
    const w = canvasWidth * scale;
    const h = canvasHeight * scale;
    return { rect, scale, left: rect.left + (rect.width - w) / 2, top: rect.top + (rect.height - h) / 2 };
  }, [canvasWidth, canvasHeight]);

  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): AnnotationPoint => {
      if (!activeCanvasRef.current) return { x: 0, y: 0 };
      const box = getContentBox();
      return {
        x: Math.round((e.clientX - box.left) / box.scale),
        y: Math.round((e.clientY - box.top) / box.scale),
      };
    },
    [getContentBox]
  );

  const clearPreview = () => {
    const cvs = activeCanvasRef.current;
    cvs?.getContext('2d')?.clearRect(0, 0, cvs.width, cvs.height);
  };

  // Laser animation loop
  useEffect(() => {
    if (activeTool !== 'laser') return;
    let animId: number;
    let hadPoints = true;
    const renderLaser = () => {
      const cvs = activeCanvasRef.current;
      const points = getActiveLaserPoints();
      // Nothing drawn last frame and nothing to draw now: skip clearing a full-res canvas
      if (cvs && (points.length > 0 || hadPoints)) {
        hadPoints = points.length > 0;
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, cvs.width, cvs.height);
          drawLaser(ctx, points, laserRadius);
        }
      }
      animId = requestAnimationFrame(renderLaser);
    };
    animId = requestAnimationFrame(renderLaser);
    return () => {
      cancelAnimationFrame(animId);
      clearPreview();
    };
  }, [activeTool, getActiveLaserPoints, laserRadius]);

  // Hide the eraser ring whenever the eraser is not the active tool
  useEffect(() => {
    if (eraserRingRef.current) eraserRingRef.current.style.display = 'none';
  }, [activeTool, interactive]);

  const moveEraserRing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ring = eraserRingRef.current;
    const cvs = activeCanvasRef.current;
    if (!ring || !cvs) return;
    const box = getContentBox();
    const parent = cvs.getBoundingClientRect();
    const d = eraserRadius(strokeWidth) * 2 * box.scale;
    ring.style.display = 'block';
    ring.style.width = `${d}px`;
    ring.style.height = `${d}px`;
    ring.style.transform = `translate(${e.clientX - parent.left - d / 2}px, ${e.clientY - parent.top - d / 2}px)`;
  };

  const eraseAt = (pt: AnnotationPoint) => {
    const r = eraserRadius(strokeWidth);
    const hits = new Set<string>();
    for (const el of elementsRef.current) {
      if (!erasedIdsRef.current.has(el.id) && hitTestElement(el, pt, r)) hits.add(el.id);
    }
    if (hits.size > 0) {
      hits.forEach(id => erasedIdsRef.current.add(id));
      onErase(hits);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || e.button !== 0) return;
    const pt = getCanvasCoords(e);

    if (activeTool === 'text') {
      const box = getContentBox();
      setTextInput({
        visible: true,
        x: e.clientX - box.rect.left,
        y: e.clientY - box.rect.top,
        canvasX: pt.x,
        canvasY: pt.y,
        text: '',
      });
      return;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    if (activeTool === 'laser') {
      updateLaser(pt.x, pt.y, true);
      return;
    }

    if (activeTool === 'eraser') {
      erasedIdsRef.current = new Set();
      onBeginErase();
      eraseAt(pt);
      return;
    }

    currentPointsRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const pt = getCanvasCoords(e);

    if (activeTool === 'laser') {
      updateLaser(pt.x, pt.y, isDrawingRef.current);
      return;
    }

    if (activeTool === 'eraser') {
      moveEraserRing(e);
      if (isDrawingRef.current) eraseAt(pt);
      return;
    }

    if (!isDrawingRef.current) return;

    const pts = currentPointsRef.current;
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      pts.push(pt);
    } else if (pts.length > 1) {
      // Shape tools only need [startPoint, currentPoint]
      pts[1] = pt;
    } else {
      pts.push(pt);
    }

    if (previewRafRef.current === null) {
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null;
        if (isDrawingRef.current) renderStrokePreview();
      });
    }
  };

  // Render the in-progress stroke exactly as it will look once committed
  const renderStrokePreview = () => {
    const cvs = activeCanvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    drawElement(ctx, {
      id: 'preview',
      tool: activeTool,
      points: currentPointsRef.current,
      color,
      strokeWidth,
      opacity,
    });
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }

    if (activeTool === 'laser') {
      updateLaser(0, 0, false);
      return;
    }

    if (activeTool === 'eraser') {
      onEndErase(erasedIdsRef.current.size > 0);
      erasedIdsRef.current = new Set();
      return;
    }

    const pts = currentPointsRef.current;
    // Shapes need a drag; a bare click with a shape tool would leave an invisible element
    const isStroke = activeTool === 'pen' || activeTool === 'highlighter';
    if (pts.length > 0 && (isStroke || pts.length > 1)) {
      onAddElement({
        id: createElementId(),
        tool: activeTool,
        points: [...pts],
        color,
        strokeWidth,
        opacity,
      });
    }

    currentPointsRef.current = [];
    clearPreview();
  };

  const handlePointerLeave = () => {
    if (eraserRingRef.current) eraserRingRef.current.style.display = 'none';
  };

  const handleTextSubmit = () => {
    if (textInput.text.trim()) {
      onAddElement({
        id: createElementId('ann_text'),
        tool: 'text',
        points: [{ x: textInput.canvasX, y: textInput.canvasY }],
        color,
        strokeWidth: 2,
        opacity,
        text: textInput.text.trim(),
        fontSize: Math.max(24, strokeWidth * 5),
      });
    }
    setTextInput(prev => ({ ...prev, visible: false, text: '' }));
  };

  const cursor = activeTool === 'eraser' ? 'cursor-none' : activeTool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div className={`absolute inset-0 z-20 ${interactive ? cursor : 'pointer-events-none'}`}>
      <canvas
        ref={activeCanvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="w-full h-full object-contain touch-none"
      />

      {/* Eraser footprint follows the pointer */}
      <div
        ref={eraserRingRef}
        className="absolute left-0 top-0 rounded-full border-2 border-white bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] pointer-events-none"
        style={{ display: 'none' }}
      />

      {/* Inline Text Annotation Input */}
      {textInput.visible && (
        <div className="absolute z-30" style={{ left: `${textInput.x}px`, top: `${textInput.y - 14}px` }}>
          <input
            autoFocus
            type="text"
            value={textInput.text}
            onChange={(e) => setTextInput(prev => ({ ...prev, text: e.target.value }))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') setTextInput(prev => ({ ...prev, visible: false, text: '' }));
            }}
            onBlur={handleTextSubmit}
            placeholder="Type, then press Enter"
            style={{ color, fontSize: `${Math.max(16, strokeWidth * 2)}px` }}
            className="bg-black/80 px-2 py-1 rounded border border-white/30 text-white font-medium shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          />
        </div>
      )}
    </div>
  );
};
