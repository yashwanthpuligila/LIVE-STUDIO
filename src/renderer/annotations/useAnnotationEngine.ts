import { useState, useRef, useCallback, useEffect } from 'react';
import { AnnotationElement, AnnotationPoint, AnnotationTool } from '../../shared/types';

export function useAnnotationEngine(canvasWidth = 1920, canvasHeight = 1080) {
  const [activeTool, setActiveTool] = useState<AnnotationTool>('pen');
  const [color, setColor] = useState<string>('#ef4444'); // Vibrant red default
  const [strokeWidth, setStrokeWidth] = useState<number>(6);
  const [opacity, setOpacity] = useState<number>(1.0);
  const [isAnnotationEnabled, setIsAnnotationEnabled] = useState<boolean>(true);

  // Undo / Redo history
  const [elements, setElements] = useState<AnnotationElement[]>([]);
  const [history, setHistory] = useState<AnnotationElement[][]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationElement[][]>([]);

  // Laser pointer state
  const laserRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const isLaserActiveRef = useRef<boolean>(false);

  // Offscreen canvas where all permanent elements are drawn
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize offscreen canvas
  useEffect(() => {
    const cvs = document.createElement('canvas');
    cvs.width = canvasWidth;
    cvs.height = canvasHeight;
    offscreenCanvasRef.current = cvs;
  }, [canvasWidth, canvasHeight]);

  // Redraw the entire annotation layer to offscreen canvas
  const redrawOffscreenCanvas = useCallback(() => {
    const cvs = offscreenCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);

    for (const el of elements) {
      ctx.save();
      ctx.globalAlpha = el.opacity;
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = el.strokeWidth * 2.5;
      }

      if (el.tool === 'pen' || el.tool === 'highlighter') {
        if (el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
        } else if (el.points.length === 1) {
          ctx.beginPath();
          ctx.arc(el.points[0].x, el.points[0].y, el.strokeWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.tool === 'line') {
        if (el.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          ctx.lineTo(el.points[1].x, el.points[1].y);
          ctx.stroke();
        }
      } else if (el.tool === 'arrow') {
        if (el.points.length >= 2) {
          const p1 = el.points[0];
          const p2 = el.points[1];
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const headLen = Math.max(16, el.strokeWidth * 3.5);

          // Draw main shaft
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Draw arrowhead
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y);
          ctx.lineTo(
            p2.x - headLen * Math.cos(angle - Math.PI / 6),
            p2.y - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            p2.x - headLen * Math.cos(angle + Math.PI / 6),
            p2.y - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      } else if (el.tool === 'rect') {
        if (el.points.length >= 2) {
          const p1 = el.points[0];
          const p2 = el.points[1];
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const w = Math.abs(p2.x - p1.x);
          const h = Math.abs(p2.y - p1.y);
          ctx.strokeRect(x, y, w, h);
        }
      } else if (el.tool === 'circle') {
        if (el.points.length >= 2) {
          const p1 = el.points[0];
          const p2 = el.points[1];
          const rx = Math.abs(p2.x - p1.x) / 2;
          const ry = Math.abs(p2.y - p1.y) / 2;
          const cx = Math.min(p1.x, p2.x) + rx;
          const cy = Math.min(p1.y, p2.y) + ry;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (el.tool === 'text' && el.text) {
        if (el.points.length > 0) {
          const p = el.points[0];
          ctx.font = `bold ${el.fontSize || 32}px Inter, sans-serif`;
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 6;
          ctx.fillText(el.text, p.x, p.y);
        }
      }
      ctx.restore();
    }
  }, [elements]);

  // Trigger redraw whenever elements change
  useEffect(() => {
    redrawOffscreenCanvas();
  }, [redrawOffscreenCanvas]);

  const addElement = useCallback((element: AnnotationElement) => {
    setHistory(prev => [...prev, elements]);
    setRedoStack([]);
    setElements(prev => [...prev, element]);
  }, [elements]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, elements]);
    setElements(previous);
    setHistory(prev => prev.slice(0, -1));
  }, [elements, history]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, elements]);
    setElements(next);
    setRedoStack(prev => prev.slice(0, -1));
  }, [elements, redoStack]);

  const clearAll = useCallback(() => {
    if (elements.length === 0) return;
    setHistory(prev => [...prev, elements]);
    setRedoStack([]);
    setElements([]);
  }, [elements]);

  // Laser pointer updater
  const updateLaser = useCallback((x: number, y: number, isActive: boolean) => {
    isLaserActiveRef.current = isActive;
    if (isActive) {
      laserRef.current.push({ x, y, time: Date.now() });
    }
  }, []);

  // Prune expired laser points (lifetime 500ms)
  const getActiveLaserPoints = useCallback(() => {
    const now = Date.now();
    laserRef.current = laserRef.current.filter(p => now - p.time < 500);
    return laserRef.current;
  }, []);

  return {
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    opacity,
    setOpacity,
    isAnnotationEnabled,
    setIsAnnotationEnabled,
    elements,
    addElement,
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: redoStack.length > 0,
    clearAll,
    offscreenCanvas: offscreenCanvasRef.current,
    updateLaser,
    getActiveLaserPoints,
  };
}
