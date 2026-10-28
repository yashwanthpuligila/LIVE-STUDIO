import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AnnotationElement, AnnotationTool } from '../../shared/types';
import { drawElements, LASER_LIFETIME_MS, LaserPoint } from './annotationRenderer';

interface AnnotationEngineOptions {
  initialTool?: AnnotationTool;
  /** Keep a full-size canvas with every committed element drawn on it (used by the studio compositor). */
  offscreen?: boolean;
}

export function useAnnotationEngine(canvasWidth = 1920, canvasHeight = 1080, options: AnnotationEngineOptions = {}) {
  const { initialTool = 'pen', offscreen = true } = options;
  const [activeTool, setActiveTool] = useState<AnnotationTool>(initialTool);
  const [color, setColor] = useState<string>('#ef4444'); // Vibrant red default
  const [strokeWidth, setStrokeWidth] = useState<number>(6);
  const [opacity, setOpacity] = useState<number>(1.0);
  const [isAnnotationEnabled, setIsAnnotationEnabled] = useState<boolean>(true);

  // Undo / Redo history
  const [elements, setElements] = useState<AnnotationElement[]>([]);
  const [history, setHistory] = useState<AnnotationElement[][]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationElement[][]>([]);

  // Elements as they were when the current eraser drag began; becomes one undo step
  const eraseSnapshotRef = useRef<AnnotationElement[] | null>(null);

  // Laser pointer state
  const laserRef = useRef<LaserPoint[]>([]);
  const isLaserActiveRef = useRef<boolean>(false);

  // Offscreen canvas where all permanent elements are drawn. Created synchronously so consumers
  // receive a real canvas on the first render instead of null.
  const offscreenCanvas = useMemo(() => {
    if (!offscreen) return null;
    const cvs = document.createElement('canvas');
    cvs.width = canvasWidth;
    cvs.height = canvasHeight;
    return cvs;
  }, [canvasWidth, canvasHeight, offscreen]);

  // Redraw the entire annotation layer whenever elements change
  useEffect(() => {
    const ctx = offscreenCanvas?.getContext('2d');
    if (!offscreenCanvas || !ctx) return;
    ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    drawElements(ctx, elements);
  }, [elements, offscreenCanvas]);

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

  // --- Eraser: removes whole elements; one drag = one undo step ---
  const beginErase = useCallback(() => {
    eraseSnapshotRef.current = elements;
  }, [elements]);

  const eraseElements = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    setElements(prev => prev.filter(el => !ids.has(el.id)));
  }, []);

  const endErase = useCallback((changed: boolean) => {
    const snapshot = eraseSnapshotRef.current;
    eraseSnapshotRef.current = null;
    if (!changed || !snapshot) return;
    setHistory(prev => [...prev, snapshot]);
    setRedoStack([]);
  }, []);

  // Laser pointer updater
  const updateLaser = useCallback((x: number, y: number, isActive: boolean) => {
    isLaserActiveRef.current = isActive;
    if (isActive) {
      laserRef.current.push({ x, y, time: Date.now() });
    }
  }, []);

  // Prune expired laser points
  const getActiveLaserPoints = useCallback(() => {
    const now = Date.now();
    laserRef.current = laserRef.current.filter(p => now - p.time < LASER_LIFETIME_MS);
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
    beginErase,
    eraseElements,
    endErase,
    offscreenCanvas,
    updateLaser,
    getActiveLaserPoints,
  };
}
