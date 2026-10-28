import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, Loader2, Pause, PenTool, Play, Square } from 'lucide-react';
import { OverlayCommand, OverlayRecordingCommand, OverlayRecordingState, OverlayState } from '../../shared/types';
import { AnnotationToolbar } from '../annotations/AnnotationToolbar';
import { useAnnotationShortcuts } from '../annotations/useAnnotationShortcuts';

const DEFAULT_STATE: OverlayState = { tool: 'select', color: '#ef4444', strokeWidth: 6, canUndo: false, canRedo: false };
// Room around the panel so its shadow isn't clipped by the window edge
const PAD = 8;

const formatTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const RecordingControls: React.FC<{
  rec: OverlayRecordingState;
  onCommand: (cmd: OverlayRecordingCommand) => void;
  compact?: boolean;
}> = ({ rec, onCommand, compact }) => {
  const btn = 'h-8 shrink-0 flex items-center justify-center gap-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const recording = rec.status === 'recording';
  const paused = rec.status === 'paused';

  if (rec.status === 'processing') {
    return (
      <div className="h-8 px-2 flex items-center gap-1.5 text-gray-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Saving…</span>
      </div>
    );
  }

  if (!recording && !paused) {
    if (compact) return null;
    return (
      <button
        onClick={() => onCommand('start')}
        disabled={rec.locked}
        className={`${btn} px-2.5 bg-red-600/90 hover:bg-red-600 text-white font-semibold`}
        title="Start recording"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-white" />
        <span>Rec</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div
        className={`h-8 px-2 flex items-center gap-1.5 rounded-lg font-mono font-semibold tabular-nums ${
          recording ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'
        }`}
        title={recording ? 'Recording' : 'Paused'}
      >
        <span className={`w-2 h-2 rounded-full ${recording ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`} />
        <span>{formatTime(rec.durationSec)}</span>
      </div>
      {!compact && (
        <>
          <button
            onClick={() => onCommand(recording ? 'pause' : 'resume')}
            disabled={rec.locked}
            className={`${btn} w-8 text-gray-200 hover:text-white hover:bg-white/10`}
            title={recording ? 'Pause recording' : 'Resume recording'}
            aria-label={recording ? 'Pause recording' : 'Resume recording'}
          >
            {recording ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onCommand('stop')}
            disabled={rec.locked}
            className={`${btn} w-8 text-red-400 hover:text-red-300 hover:bg-red-500/15`}
            title="Stop and save recording"
            aria-label="Stop recording"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        </>
      )}
    </div>
  );
};

/**
 * Floating drawing toolbar shown at the top of the shared display. Its window is excluded from
 * screen capture; it only sends commands to the ink layer and mirrors its state.
 */
export const FloatingToolbarPage: React.FC = () => {
  const [state, setState] = useState<OverlayState>(DEFAULT_STATE);
  const [collapsed, setCollapsed] = useState(false);
  const [rec, setRec] = useState<OverlayRecordingState>({ status: 'idle', durationSec: 0, locked: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const api = window.electronAPI.overlay;
  const send = (cmd: OverlayCommand) => api.command(cmd);

  useEffect(() => {
    api.getState().then((s) => s && setState(s));
    return api.onState(setState);
  }, []);

  useEffect(() => {
    api.getRecordingState().then((r) => r && setRec(r));
    return api.onRecording(setRec);
  }, []);

  // Size the OS window to whatever is rendered, including the open colour popover
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let right = 0;
        let bottom = 0;
        root.querySelectorAll<HTMLElement>('*').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width && r.height) {
            right = Math.max(right, r.right);
            bottom = Math.max(bottom, r.bottom);
          }
        });
        api.setToolbarSize(Math.ceil(right) + PAD, Math.ceil(bottom) + PAD);
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, subtree: true });
    measure();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  useAnnotationShortcuts({
    onTool: (tool) => send({ type: 'setTool', tool }),
    onUndo: () => send({ type: 'undo' }),
    onRedo: () => send({ type: 'redo' }),
    onEscape: () => send({ type: 'setTool', tool: 'select' }),
  });

  return (
    <div ref={rootRef} className="inline-block" style={{ padding: PAD }}>
      {collapsed ? (
        <div className="flex items-center gap-0.5 p-1 rounded-2xl bg-[#11131a]/95 border border-white/10 shadow-2xl">
          <div className="h-8 px-0.5 flex items-center text-gray-500 cursor-grab [-webkit-app-region:drag]" title="Drag to move">
            <GripVertical className="w-4 h-4" />
          </div>
          <button
            onClick={() => setCollapsed(false)}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
              state.tool !== 'select' ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-white/10'
            }`}
            title="Show drawing tools"
            aria-label="Show drawing tools"
          >
            <PenTool className="w-4 h-4" />
          </button>
          <RecordingControls rec={rec} onCommand={api.recordingCommand} compact />
        </div>
      ) : (
        <AnnotationToolbar
          variant="floating"
          activeTool={state.tool}
          setActiveTool={(tool) => send({ type: 'setTool', tool })}
          color={state.color}
          setColor={(color) => send({ type: 'setColor', color })}
          strokeWidth={state.strokeWidth}
          setStrokeWidth={(width) => send({ type: 'setStrokeWidth', width })}
          undo={() => send({ type: 'undo' })}
          redo={() => send({ type: 'redo' })}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          clearAll={() => send({ type: 'clear' })}
          onCollapse={() => setCollapsed(true)}
          onOpenStudio={api.openStudio}
          onClose={api.close}
          leading={<RecordingControls rec={rec} onCommand={api.recordingCommand} />}
        />
      )}
    </div>
  );
};
