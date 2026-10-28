import React from 'react';
import { Loader2, Mic, MicOff } from 'lucide-react';
import { AppSettings, NoiseSuppressionLevel } from '../../../shared/types';
import { AudioChannelState, AudioDeviceOption, AudioLevel, NoiseStatus } from './useAudioMixer';
import { LevelMeter } from './AudioMixerPanel';

interface MicrophonePanelProps {
  micDevices: AudioDeviceOption[];
  selectedMicId: string;
  onSelectMicId: (id: string) => void;
  micState: AudioChannelState;
  onToggleMute: () => void;
  readLevels: () => { mic: AudioLevel; desktop: AudioLevel };
  noiseLevel: NoiseSuppressionLevel;
  noiseStatus: NoiseStatus;
  echoCancellation: boolean;
  autoGainControl: boolean;
  onChangeSettings: (partial: Partial<AppSettings>) => void;
}

const LEVELS: { id: NoiseSuppressionLevel; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Your microphone exactly as it sounds' },
  { id: 'standard', label: 'Standard', hint: 'Light filtering of steady hum and hiss' },
  { id: 'strong', label: 'Strong (AI)', hint: 'Removes fans, AC, keyboard clicks and background chatter' },
];

const Toggle: React.FC<{ label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  hint,
  checked,
  onChange,
}) => (
  <label className="flex items-center justify-between gap-2 cursor-pointer" title={hint}>
    <span className="flex flex-col">
      <span className="text-gray-300">{label}</span>
      <span className="text-[10px] text-gray-500">{hint}</span>
    </span>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4.5 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-[#2f3547]'}`}
    >
      <span
        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[16px]' : 'left-0.5'}`}
      />
    </button>
  </label>
);

/** Microphone options next to the camera: device, mute, noise suppression and voice processing. */
export const MicrophonePanel: React.FC<MicrophonePanelProps> = ({
  micDevices,
  selectedMicId,
  onSelectMicId,
  micState,
  onToggleMute,
  readLevels,
  noiseLevel,
  noiseStatus,
  echoCancellation,
  autoGainControl,
  onChangeSettings,
}) => {
  const statusText =
    noiseStatus === 'loading'
      ? 'Starting AI filter…'
      : noiseStatus === 'fallback'
        ? 'AI filter unavailable, using Standard'
        : LEVELS.find((l) => l.id === noiseLevel)?.hint;

  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
        <div className="flex items-center gap-2 text-gray-200 font-semibold">
          <Mic className="w-4 h-4 text-emerald-400" />
          <span>Microphone</span>
        </div>
        <button
          onClick={onToggleMute}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
            micState.muted
              ? 'border-red-500/50 text-red-300 bg-red-500/10'
              : 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
          }`}
          title={micState.muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {micState.muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
          {micState.muted ? 'Muted' : 'On'}
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400">Microphone device</span>
        <select
          value={selectedMicId}
          onChange={(e) => onSelectMicId(e.target.value)}
          className="bg-[#10121a] border border-[#2f3547] rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-emerald-500"
        >
          {micDevices.length === 0 && <option value="default">Default microphone</option>}
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <LevelMeter channel="mic" muted={micState.muted} readLevels={readLevels} showGuides />

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-gray-400">Noise suppression</span>
        <div className="flex gap-1 p-0.5 rounded-lg bg-[#10121a] border border-[#2a3042]">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => onChangeSettings({ noiseSuppressionLevel: l.id, noiseSuppression: l.id !== 'off' })}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                noiseLevel === l.id ? 'bg-emerald-600 text-white shadow' : 'text-gray-300 hover:text-white hover:bg-[#252b3d]'
              }`}
              title={l.hint}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className={`flex items-center gap-1 text-[10px] ${noiseStatus === 'fallback' ? 'text-amber-400' : 'text-gray-500'}`}>
          {noiseStatus === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
          {statusText}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 pt-1 border-t border-[#222634]">
        <Toggle
          label="Echo cancellation"
          hint="Stops speaker sound leaking into the mic"
          checked={echoCancellation}
          onChange={(v) => onChangeSettings({ echoCancellation: v })}
        />
        <Toggle
          label="Auto volume"
          hint="Keeps your voice at an even level"
          checked={autoGainControl}
          onChange={(v) => onChangeSettings({ autoGainControl: v })}
        />
      </div>
    </div>
  );
};
