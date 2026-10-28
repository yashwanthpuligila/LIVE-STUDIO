import React from 'react';
import { Camera, Eye, EyeOff, Plus } from 'lucide-react';
import { SceneSource } from '../../shared/types';
import { WebcamBackgroundPanel } from './WebcamBackgroundPanel';

interface CameraPanelProps {
  /** The webcam this panel controls (selected webcam, else the first one in the scene) */
  camera: SceneSource | null;
  videoDevices: { deviceId: string; label: string }[];
  onUpdate: (id: string, updates: Partial<SceneSource>) => void;
  onAddCamera: () => void;
}

const MARGIN = 2;
const SIZES = [
  { id: 'S', label: 'Small', width: 15 },
  { id: 'M', label: 'Medium', width: 22 },
  { id: 'L', label: 'Large', width: 32 },
];
const SHAPES = [
  { label: 'Square', radius: 0 },
  { label: 'Rounded', radius: 12 },
  { label: 'Pill', radius: 50 },
];

const chip = (active: boolean) =>
  `flex-1 py-1 rounded-md border text-[11px] transition-colors ${
    active ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10' : 'border-[#2a3042] text-gray-300 hover:bg-[#252b3d]'
  }`;

/** Everything about the presenter camera in one place: device, placement, size, shape, background. */
export const CameraPanel: React.FC<CameraPanelProps> = ({ camera, videoDevices, onUpdate, onAddCamera }) => {
  const header = (
    <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
      <div className="flex items-center gap-2 text-gray-200 font-semibold">
        <Camera className="w-4 h-4 text-emerald-400" />
        <span>Camera</span>
      </div>
      {camera && (
        <button
          onClick={() => onUpdate(camera.id, { visible: !camera.visible })}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
            camera.visible
              ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
              : 'border-[#2a3042] text-gray-400 hover:text-white'
          }`}
          title={camera.visible ? 'Hide camera from the video' : 'Show camera in the video'}
        >
          {camera.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {camera.visible ? 'On' : 'Off'}
        </button>
      )}
    </div>
  );

  if (!camera) {
    return (
      <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col gap-2.5 text-xs">
        {header}
        <p className="text-[11px] text-gray-500">This scene has no camera.</p>
        <button
          onClick={onAddCamera}
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add camera
        </button>
      </div>
    );
  }

  const locked = camera.locked;
  const ratio = camera.height / camera.width;
  const isLeft = camera.x + camera.width / 2 < 50;
  const isTop = camera.y + camera.height / 2 < 50;
  const isFull = camera.width >= 99 && camera.height >= 99;

  const place = (left: boolean, top: boolean, width = camera.width, height = camera.height) => {
    onUpdate(camera.id, {
      width,
      height,
      x: left ? MARGIN : 100 - MARGIN - width,
      y: top ? MARGIN : 100 - MARGIN - height,
    });
  };

  const resize = (width: number) => {
    const height = Math.min(100 - MARGIN * 2, width * (isFull ? 26 / 22 : ratio));
    place(isFull ? false : isLeft, isFull ? false : isTop, width, height);
  };

  const corners: { label: string; left: boolean; top: boolean }[] = [
    { label: 'Top left', left: true, top: true },
    { label: 'Top right', left: false, top: true },
    { label: 'Bottom left', left: true, top: false },
    { label: 'Bottom right', left: false, top: false },
  ];

  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col gap-3 text-xs">
      {header}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400">Camera device</span>
        <select
          value={camera.deviceId || ''}
          onChange={(e) => onUpdate(camera.id, { deviceId: e.target.value })}
          className="bg-[#10121a] border border-[#2f3547] rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-emerald-500"
        >
          <option value="">Default camera</option>
          {videoDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <div className={`flex flex-col gap-2 ${locked ? 'opacity-50 pointer-events-none' : ''}`} title={locked ? 'Camera is locked' : undefined}>
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400">Position</span>
            {/* Mini screen: click a corner */}
            <div className="relative w-[72px] h-[42px] rounded-md bg-[#10121a] border border-[#2f3547]">
              {corners.map((c) => {
                const active = !isFull && isLeft === c.left && isTop === c.top;
                return (
                  <button
                    key={c.label}
                    onClick={() => place(c.left, c.top)}
                    title={c.label}
                    aria-label={c.label}
                    className={`absolute w-5 h-3.5 rounded-sm transition-colors ${
                      active ? 'bg-emerald-500' : 'bg-[#2f3547] hover:bg-[#4a5372]'
                    }`}
                    style={{ [c.left ? 'left' : 'right']: 3, [c.top ? 'top' : 'bottom']: 3 }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[10px] text-gray-400">Size</span>
            <div className="flex gap-1">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => resize(s.width)}
                  className={chip(!isFull && Math.abs(camera.width - s.width) < 1)}
                  title={s.label}
                >
                  {s.id}
                </button>
              ))}
            </div>
            <button
              onClick={() => onUpdate(camera.id, { x: 0, y: 0, width: 100, height: 100 })}
              className={chip(isFull)}
              title="Camera fills the whole video"
            >
              Full screen
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-400">Shape</span>
          <div className="flex gap-1">
            {SHAPES.map((s) => (
              <button
                key={s.label}
                onClick={() => onUpdate(camera.id, { borderRadius: s.radius })}
                className={chip((camera.borderRadius ?? 0) === s.radius)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <WebcamBackgroundPanel value={camera.background} onChange={(background) => onUpdate(camera.id, { background })} />
    </div>
  );
};
