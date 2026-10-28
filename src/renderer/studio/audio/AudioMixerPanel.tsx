import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { AudioChannelState, AudioDeviceOption, AudioLevel } from './useAudioMixer';

type ReadLevels = () => { mic: AudioLevel; desktop: AudioLevel };

const METER_INTERVAL_MS = 50; // 20 Hz is smooth for a VU meter and far cheaper than per-frame React renders

// Convert -60dB to 0dB into 0% to 100% meter width
const dbToPercent = (db: number) => {
  if (db <= -60) return 0;
  if (db >= 0) return 100;
  return Math.round(((db + 60) / 60) * 100);
};

const meterColor = (peakDb: number) =>
  peakDb > -3
    ? 'bg-gradient-to-r from-green-500 via-amber-400 to-red-500'
    : peakDb > -12
    ? 'bg-gradient-to-r from-green-500 to-amber-400'
    : 'bg-green-500';

const CLIP_ON = 'bg-red-500 shadow-[0_0_8px_#ef4444]';
const CLIP_OFF = 'bg-[#252a3a]';

/** VU meter that updates its own DOM nodes directly instead of going through React state. */
export const LevelMeter: React.FC<{
  channel: 'mic' | 'desktop';
  muted: boolean;
  readLevels: ReadLevels;
  showGuides?: boolean;
}> = ({ channel, muted, readLevels, showGuides }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const clip = clipRef.current;
    const text = textRef.current;
    if (!bar || !clip || !text) return;

    let lastColor = '';
    let lastClip: boolean | null = null;
    let lastText = '';

    const update = () => {
      if (document.hidden) return;
      const level = readLevels()[channel];
      const peak = muted ? -60 : level.peakDb;

      bar.style.width = `${dbToPercent(peak)}%`;
      const color = meterColor(peak);
      if (color !== lastColor) {
        bar.className = `h-full rounded-full transition-[width] duration-75 ${color}`;
        lastColor = color;
      }
      const clipping = !muted && level.isClipping;
      if (clipping !== lastClip) {
        clip.className = `w-2 h-2 rounded-full transition-colors ${clipping ? CLIP_ON : CLIP_OFF}`;
        lastClip = clipping;
      }
      const label = muted ? 'MUTED' : `${Math.round(peak)} dB`;
      if (label !== lastText) {
        text.textContent = label;
        lastText = label;
      }
    };

    update();
    const timer = setInterval(update, METER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [channel, muted, readLevels]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#0e1017] rounded-full overflow-hidden p-0.5 border border-[#202534] relative">
        {showGuides && (
          <>
            {/* Meter Background Guides (-12dB, -3dB) */}
            <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-[#3a4155] z-10 opacity-40" />
            <div className="absolute top-0 bottom-0 left-[95%] w-0.5 bg-[#553a3a] z-10 opacity-50" />
          </>
        )}
        <div ref={barRef} className="h-full rounded-full transition-[width] duration-75 bg-green-500" style={{ width: '0%' }} />
      </div>

      {/* Clip LED indicator */}
      <div ref={clipRef} className={`w-2 h-2 rounded-full transition-colors ${CLIP_OFF}`} title="Clip Indicator" />
      <span ref={textRef} className="w-12 text-right font-mono-numbers text-[10px] text-gray-500" />
    </div>
  );
};

interface AudioMixerPanelProps {
  micDevices: AudioDeviceOption[];
  selectedMicId: string;
  onSelectMicId: (id: string) => void;
  micState: AudioChannelState;
  onMicVolumeChange: (vol: number) => void;
  onToggleMicMute: () => void;
  desktopState: AudioChannelState;
  onDesktopVolumeChange: (vol: number) => void;
  onToggleDesktopMute: () => void;
  readLevels: ReadLevels;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  micDevices,
  selectedMicId,
  onSelectMicId,
  micState,
  onMicVolumeChange,
  onToggleMicMute,
  desktopState,
  onDesktopVolumeChange,
  onToggleDesktopMute,
  readLevels,
}) => {
  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-4 flex flex-col gap-4 shadow-lg text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
        <div className="flex items-center gap-2 text-gray-200 font-semibold text-sm">
          <Volume2 className="w-4 h-4 text-blue-400" />
          <span>Audio Mixer</span>
        </div>
        <span className="text-[10px] text-gray-400 px-2 py-0.5 bg-[#1b1f2b] rounded-full border border-[#2a3042]">
          48 kHz / 24-bit
        </span>
      </div>

      {/* --- Channel 1: Microphone --- */}
      <div className="bg-[#191c26] p-3 rounded-lg border border-[#232736] flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleMicMute}
              className={`p-1.5 rounded-md transition-colors ${
                micState.muted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
              title={micState.muted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {micState.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <span className="font-medium text-gray-200">Microphone</span>
          </div>

          {/* Device dropdown */}
          <select
            value={selectedMicId}
            onChange={(e) => onSelectMicId(e.target.value)}
            className="bg-[#12141c] border border-[#2f3547] rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500 max-w-[150px] truncate"
          >
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Volume Slider & readout */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.01"
            value={micState.muted ? 0 : micState.volume}
            onChange={(e) => onMicVolumeChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-[#252a3a] rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="w-10 text-right font-mono-numbers text-[11px] text-gray-400">
            {Math.round(micState.volume * 100)}%
          </span>
        </div>

        {/* VU Level Meter Bar */}
        <LevelMeter channel="mic" muted={micState.muted} readLevels={readLevels} showGuides />
      </div>

      {/* --- Channel 2: Desktop Audio --- */}
      <div className="bg-[#191c26] p-3 rounded-lg border border-[#232736] flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDesktopMute}
              className={`p-1.5 rounded-md transition-colors ${
                desktopState.muted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
              title={desktopState.muted ? 'Unmute Desktop' : 'Mute Desktop'}
            >
              {desktopState.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <span className="font-medium text-gray-200">Desktop Audio</span>
          </div>
          <span className="text-[10px] text-gray-500">Screen Output</span>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.01"
            value={desktopState.muted ? 0 : desktopState.volume}
            onChange={(e) => onDesktopVolumeChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-[#252a3a] rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="w-10 text-right font-mono-numbers text-[11px] text-gray-400">
            {Math.round(desktopState.volume * 100)}%
          </span>
        </div>

        {/* VU Level Meter Bar */}
        <LevelMeter channel="desktop" muted={desktopState.muted} readLevels={readLevels} />
      </div>
    </div>
  );
};
