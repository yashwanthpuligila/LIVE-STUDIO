import React, { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import { WebcamBackground } from '../../shared/types';
import { BACKGROUND_PRESETS, getPresetBackground, loadBackgroundImage } from './engine/backgroundEffects';

interface WebcamBackgroundPanelProps {
  value: WebcamBackground | undefined;
  onChange: (bg: WebcamBackground) => void;
}

const segBtn = (active: boolean) =>
  `flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
    active ? 'bg-emerald-600 text-white shadow' : 'text-gray-300 hover:text-white hover:bg-[#252b3d]'
  }`;

/** Blur or replace the background behind the presenter, Google Meet style. */
export const WebcamBackgroundPanel: React.FC<WebcamBackgroundPanelProps> = ({ value, onChange }) => {
  const bg: WebcamBackground = value ?? { mode: 'none' };
  const [uploads, setUploads] = useState<string[]>([]);
  const [uploadThumbs, setUploadThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Small preview images for the built-in backgrounds
  const presetThumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of BACKGROUND_PRESETS) {
      const full = getPresetBackground(p.id);
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      c.getContext('2d')!.drawImage(full, 0, 0, 160, 90);
      out[p.id] = c.toDataURL('image/png');
    }
    return out;
  }, []);

  const refreshUploads = () => window.electronAPI?.backgrounds.list().then(setUploads).catch(() => setUploads([]));
  useEffect(() => {
    refreshUploads();
  }, []);

  useEffect(() => {
    let cancelled = false;
    uploads.forEach((name) => {
      if (uploadThumbs[name]) return;
      loadBackgroundImage(`file:${name}`).then((img) => {
        if (!cancelled && img) setUploadThumbs((t) => ({ ...t, [name]: (img as HTMLImageElement).src }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [uploads]);

  const upload = async () => {
    setError(null);
    try {
      const name = await window.electronAPI.backgrounds.choose();
      if (!name) return;
      await refreshUploads();
      onChange({ mode: 'image', image: `file:${name}` });
    } catch (err: any) {
      setError(err?.message || 'Could not add that image');
    }
  };

  const removeUpload = async (name: string) => {
    await window.electronAPI.backgrounds.remove(name);
    if (bg.image === `file:${name}`) onChange({ mode: 'none' });
    refreshUploads();
  };

  const tile = (ref: string, src: string | undefined, label: string, removable?: string) => {
    const active = bg.mode === 'image' && bg.image === ref;
    return (
      <div key={ref} className="relative group">
        <button
          onClick={() => onChange({ mode: 'image', image: ref })}
          className={`w-full aspect-video rounded-md overflow-hidden border-2 transition-colors ${
            active ? 'border-emerald-500' : 'border-transparent hover:border-[#3a4258]'
          }`}
          title={label}
          aria-label={label}
          aria-pressed={active}
        >
          {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[#252a3a]" />}
        </button>
        {removable && (
          <button
            onClick={() => removeUpload(removable)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/80 text-gray-300 hover:text-white hidden group-hover:flex items-center justify-center"
            title="Remove this image"
            aria-label="Remove this image"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 bg-[#181b26] p-2.5 rounded-lg border border-[#252b3d]">
      <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Background</span>
      </div>

      <div className="flex gap-1 p-0.5 rounded-lg bg-[#10121a] border border-[#2a3042]">
        <button className={segBtn(bg.mode === 'none')} onClick={() => onChange({ mode: 'none' })}>
          None
        </button>
        <button className={segBtn(bg.mode === 'blur')} onClick={() => onChange({ mode: 'blur', blur: bg.blur ?? 'strong' })}>
          Blur
        </button>
        <button
          className={segBtn(bg.mode === 'image')}
          onClick={() => onChange({ mode: 'image', image: bg.image ?? `preset:${BACKGROUND_PRESETS[0].id}` })}
        >
          Image
        </button>
      </div>

      {bg.mode === 'blur' && (
        <div className="flex gap-1">
          {(['light', 'strong'] as const).map((b) => (
            <button
              key={b}
              onClick={() => onChange({ mode: 'blur', blur: b })}
              className={`flex-1 py-1 rounded-md border text-[11px] capitalize transition-colors ${
                (bg.blur ?? 'strong') === b
                  ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                  : 'border-[#2a3042] text-gray-300 hover:bg-[#252b3d]'
              }`}
            >
              {b === 'light' ? 'Slight blur' : 'Strong blur'}
            </button>
          ))}
        </div>
      )}

      {bg.mode === 'image' && (
        <div className="grid grid-cols-3 gap-1.5">
          {BACKGROUND_PRESETS.map((p) => tile(`preset:${p.id}`, presetThumbs[p.id], p.name))}
          {uploads.map((name) => tile(`file:${name}`, uploadThumbs[name], 'Your image', name))}
          <button
            onClick={upload}
            className="aspect-video rounded-md border-2 border-dashed border-[#353c52] hover:border-emerald-500 text-gray-400 hover:text-emerald-300 flex flex-col items-center justify-center gap-0.5 transition-colors"
            title="Upload your own background image"
          >
            <ImagePlus className="w-4 h-4" />
            <span className="text-[10px]">Upload</span>
          </button>
        </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
};
