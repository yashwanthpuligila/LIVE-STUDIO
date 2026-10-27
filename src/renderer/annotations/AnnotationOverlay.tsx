import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AnnotationElement, AnnotationPoint, AnnotationTool } from '../../shared/types';

interface AnnotationOverlayProps {
  activeTool: AnnotationTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  isEnabled: boolean;
  onAddElement: (element: AnnotationElement) => void;
  updateLaser: (x: number, y: number, isActive: boolean) => void;
  getActiveLaserPoints: () => { x: number; y: number; time: number }[];
  elements: AnnotationElement[];
  canvasWidth?: number;
  canvasHeight?: number;
}

export const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({
  activeTool,
  color,
  strokeWidth,
  opacity,
  isEnabled,
  onAddElement,
  updateLaser,
  getActiveLaserPoints,
  elements,
  canvasWidth = 1920,
  canvasHeight = 1080,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<AnnotationPoint[]>([]);
  // Pointer events can arrive far faster than the display refreshes; coalesce previews to one per frame
  const previewRafRef = useRef<number | null>(null);

  // Text input state
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
    text: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    text: '',
  });

  // Convert mouse/touch event to native 1920x1080 canvas coordinates
  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): AnnotationPoint => {
      if (!activeCanvasRef.current) return { x: 0, y: 0 };
      const rect = activeCanvasRef.current.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;
      return {
        x: Math.round((e.clientX - rect.left) * scaleX),
        y: Math.round((e.clientY - rect.top) * scaleY),
      };
    },
    [canvasWidth, canvasHeight]
  );

  // Laser animation loop
  useEffect(() => {
    let animId: number;

    let hadPoints = true;
    const renderLaser = () => {
      const cvs = activeCanvasRef.current;
      const points = getActiveLaserPoints();
      // Nothing drawn last frame and nothing to draw now: skip clearing a full-res canvas
      if (cvs && activeTool === 'laser' && (points.length > 0 || hadPoints)) {
        hadPoints = points.length > 0;
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, cvs.width, cvs.height);
          const now = Date.now();

          for (const pt of points) {
            const age = now - pt.time;
            const alpha = Math.max(0, 1 - age / 500);

            // Glowing halo
            const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, 28);
            grad.addColorStop(0, `rgba(239, 68, 68, ${alpha})`);
            grad.addColorStop(0.5, `rgba(239, 68, 68, ${alpha * 0.4})`);
            grad.addColorStop(1, 'rgba(239, 68, 68, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 28, 0, Math.PI * 2);
            ctx.fill();

            // Core bright dot
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      animId = requestAnimationFrame(renderLaser);
    };

    if (activeTool === 'laser') {
      animId = requestAnimationFrame(renderLaser);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeTool, getActiveLaserPoints]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isEnabled) return;
    const pt = getCanvasCoords(e);

    if (activeTool === 'select') return;

    if (activeTool === 'text') {
      const rect = activeCanvasRef.current?.getBoundingClientRect();
      if (rect) {
        setTextInput({
          visible: true,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          canvasX: pt.x,
          canvasY: pt.y,
          text: '',
        });
      }
      return;
    }

    if (activeTool === 'laser') {
      isDrawingRef.current = true;
      updateLaser(pt.x, pt.y, true);
      return;
    }

    isDrawingRef.current = true;
    currentPointsRef.current = [pt];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isEnabled) return;
    const pt = getCanvasCoords(e);

    if (activeTool === 'laser') {
      updateLaser(pt.x, pt.y, isDrawingRef.current);
      return;
    }

    if (!isDrawingRef.current) return;

    const pts = currentPointsRef.current;
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      pts.push(pt);
    } else {
      // Shape tools only need [startPoint, currentPoint]
      if (pts.length > 1) {
        pts[1] = pt;
      } else {
        pts.push(pt);
      }
    }

    if (previewRafRef.current === null) {
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null;
        if (isDrawingRef.current) renderStrokePreview();
      });
    }
  };

  // Render active drawing stroke preview
  const renderStrokePreview = () => {
    const pts = currentPointsRef.current;
    const cvs = activeCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (activeTool === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = strokeWidth * 2.5;
    } else {
      ctx.globalAlpha = opacity;
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }
    } else if (activeTool === 'line' && pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    } else if (activeTool === 'arrow' && pts.length >= 2) {
      const p1 = pts[0];
      const p2 = pts[1];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = Math.max(16, strokeWidth * 3.5);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (activeTool === 'rect' && pts.length >= 2) {
      const p1 = pts[0];
      const p2 = pts[1];
      ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    } else if (activeTool === 'circle' && pts.length >= 2) {
      const p1 = pts[0];
      const p2 = pts[1];
      const rx = Math.abs(p2.x - p1.x) / 2;
      const ry = Math.abs(p2.y - p1.y) / 2;
      ctx.beginPath();
      ctx.ellipse(Math.min(p1.x, p2.x) + rx, Math.min(p1.y, p2.y) + ry, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
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

    const pts = currentPointsRef.current;
    if (pts.length > 0) {
      const newElement: AnnotationElement = {
        id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tool: activeTool,
        points: [...pts],
        color,
        strokeWidth,
        opacity,
      };
      onAddElement(newElement);
    }

    currentPointsRef.current = [];

    // Clear active preview canvas
    const cvs = activeCanvasRef.current;
    if (cvs) {
      const ctx = cvs.getContext('2d');
      ctx?.clearRect(0, 0, cvs.width, cvs.height);
    }
  };

  const handleTextSubmit = () => {
    if (textInput.text.trim()) {
      const newElement: AnnotationElement = {
        id: `ann_text_${Date.now()}`,
        tool: 'text',
        points: [{ x: textInput.canvasX, y: textInput.canvasY }],
        color,
        strokeWidth: 2,
        opacity,
        text: textInput.text.trim(),
        fontSize: Math.max(24, strokeWidth * 5),
      };
      onAddElement(newElement);
    }
    setTextInput(prev => ({ ...prev, visible: false, text: '' }));
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-20 ${isEnabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
    >
      <canvas
        ref={activeCanvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-full object-contain"
      />

      {/* Inline Text Annotation Input */}
      {textInput.visible && (
        <div
          className="absolute z-30"
          style={{ left: `${textInput.x}px`, top: `${textInput.y - 14}px` }}
        >
          <input
            autoFocus
            type="text"
            value={textInput.text}
            onChange={(e) => setTextInput(prev => ({ ...prev, text: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') setTextInput(prev => ({ ...prev, visible: false, text: '' }));
            }}
            onBlur={handleTextSubmit}
            placeholder="Type note and hit Enter..."
            style={{ color, fontSize: `${Math.max(16, strokeWidth * 2)}px` }}
            className="bg-black/80 px-2 py-1 rounded border border-white/30 text-white font-medium shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          />
        </div>
      )}
    </div>
  );
};
