import { useEffect, useRef } from 'react';
import { AnnotationTool } from '../../shared/types';

/** Single-key tool shortcuts, shown in toolbar tooltips. */
export const TOOL_SHORTCUTS: Record<AnnotationTool, string> = {
  select: 'V',
  pen: 'P',
  highlighter: 'H',
  eraser: 'E',
  arrow: 'A',
  line: 'L',
  rect: 'R',
  circle: 'C',
  text: 'T',
  laser: 'X',
};

const KEY_TO_TOOL = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS).map(([tool, key]) => [key.toLowerCase(), tool as AnnotationTool])
);

interface ShortcutHandlers {
  onTool: (tool: AnnotationTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onEscape?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Window-level keyboard shortcuts for the drawing tools. Ignored while typing in a field. */
export function useAnnotationShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.repeat) return;
      const h = handlersRef.current;
      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (e.altKey) return; // Ctrl+Alt combos are global shortcuts
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          h.onUndo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          h.onRedo();
        }
        return;
      }
      if (e.altKey) return;

      if (key === 'escape') {
        h.onEscape?.();
        return;
      }
      const tool = KEY_TO_TOOL[key];
      if (tool) {
        e.preventDefault();
        h.onTool(tool);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
