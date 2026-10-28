import React, { useEffect, useRef, useState } from 'react';
import { AnnotationTool, OverlayCommand } from '../../shared/types';
import { useAnnotationEngine } from '../annotations/useAnnotationEngine';
import { AnnotationOverlay } from '../annotations/AnnotationOverlay';
import { useAnnotationShortcuts } from '../annotations/useAnnotationShortcuts';
import { drawElements } from '../annotations/annotationRenderer';

const measure = () => ({
  w: Math.round(window.innerWidth * window.devicePixelRatio),
  h: Math.round(window.innerHeight * window.devicePixelRatio),
});

/**
 * Full-screen transparent ink layer over the shared display. It is captured along with the
 * desktop, so drawings here are recorded and streamed. Canvas resolution matches physical pixels.
 */
export const ScreenInkPage: React.FC = () => {
  const [size, setSize] = useState(measure);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastDrawToolRef = useRef<AnnotationTool>('pen');
  const dpr = window.devicePixelRatio || 1;

  const ink = useAnnotationEngine(size.w, size.h, { initialTool: 'select', offscreen: false });
  const { activeTool, setActiveTool, color, setColor, strokeWidth, setStrokeWidth, elements, undo, redo, clearAll, canUndo, canRedo } = ink;

  useEffect(() => {
    const onResize = () => setSize(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Committed drawings
  useEffect(() => {
    const cvs = baseCanvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    drawElements(ctx, elements);
  }, [elements, size]);

  useEffect(() => {
    if (activeTool !== 'select') lastDrawToolRef.current = activeTool;
  }, [activeTool]);

  // Keep the floating toolbar (and the click-through state in main) in sync
  useEffect(() => {
    window.electronAPI.overlay.sendState({ tool: activeTool, color, strokeWidth, canUndo, canRedo });
  }, [activeTool, color, strokeWidth, canUndo, canRedo]);

  const handlersRef = useRef({ setActiveTool, setColor, setStrokeWidth, undo, redo, clearAll, activeTool });
  handlersRef.current = { setActiveTool, setColor, setStrokeWidth, undo, redo, clearAll, activeTool };

  useEffect(() => {
    return window.electronAPI.overlay.onCommand((cmd: OverlayCommand) => {
      const h = handlersRef.current;
      switch (cmd.type) {
        case 'setTool': h.setActiveTool(cmd.tool); break;
        case 'setColor': h.setColor(cmd.color); break;
        case 'setStrokeWidth': h.setStrokeWidth(cmd.width); break;
        case 'undo': h.undo(); break;
        case 'redo': h.redo(); break;
        case 'clear': h.clearAll(); break;
        case 'toggleDraw': h.setActiveTool(h.activeTool === 'select' ? lastDrawToolRef.current : 'select'); break;
      }
    });
  }, []);

  // Only reachable while drawing (the layer has keyboard focus only then)
  useAnnotationShortcuts({
    onTool: setActiveTool,
    onUndo: undo,
    onRedo: redo,
    onEscape: () => setActiveTool('select'),
  });

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={baseCanvasRef} width={size.w} height={size.h} className="absolute inset-0 w-full h-full pointer-events-none" />
      <AnnotationOverlay
        activeTool={activeTool}
        color={color}
        strokeWidth={Math.round(strokeWidth * dpr)}
        opacity={1}
        isEnabled={activeTool !== 'select'}
        onAddElement={ink.addElement}
        onBeginErase={ink.beginErase}
        onErase={ink.eraseElements}
        onEndErase={ink.endErase}
        updateLaser={ink.updateLaser}
        getActiveLaserPoints={ink.getActiveLaserPoints}
        elements={elements}
        canvasWidth={size.w}
        canvasHeight={size.h}
        laserRadius={Math.round(28 * dpr)}
      />
    </div>
  );
};
