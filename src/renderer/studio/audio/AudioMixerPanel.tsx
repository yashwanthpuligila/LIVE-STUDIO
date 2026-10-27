import React from 'react';
import { Mic, MicOff, Volume2, VolumeX, AlertCircle, RefreshCw } from 'lucide-react';
import { AudioChannelState, AudioDeviceOption } from './useAudioMixer';

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
}) => {
  // Convert -60dB to 0dB into 0% to 100% meter width
  const dbToPercent = (db: number) => {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return Math.round(((db + 60) / 60) * 100);
  };

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
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-[#0e1017] rounded-full overflow-hidden p-0.5 border border-[#202534] relative">
            {/* Meter Background Guides (-12dB, -3dB) */}
            <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-[#3a4155] z-10 opacity-40" />
            <div className="absolute top-0 bottom-0 left-[95%] w-0.5 bg-[#553a3a] z-10 opacity-50" />

            <div
              className={`h-full rounded-full transition-all duration-75 ${
                micState.muted
                  ? 'w-0'
                  : micState.peakDb > -3
                  ? 'bg-gradient-to-r from-green-500 via-amber-400 to-red-500'
                  : micState.peakDb > -12
                  ? 'bg-gradient-to-r from-green-500 to-amber-400'
                  : 'bg-green-500'
              }`}
              style={{ width: micState.muted ? '0%' : `${dbToPercent(micState.peakDb)}%` }}
            />
          </div>

          {/* Clip LED indicator */}
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              micState.isClipping ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-[#252a3a]'
            }`}
            title="Clip Indicator"
          />
          <span className="w-12 text-right font-mono-numbers text-[10px] text-gray-500">
            {micState.muted ? 'MUTED' : `${Math.round(micState.peakDb)} dB`}
          </span>
        </div>
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
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-[#0e1017] rounded-full overflow-hidden p-0.5 border border-[#202534] relative">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                desktopState.muted
                  ? 'w-0'
                  : desktopState.peakDb > -3
                  ? 'bg-gradient-to-r from-green-500 via-amber-400 to-red-500'
                  : desktopState.peakDb > -12
                  ? 'bg-gradient-to-r from-green-500 to-amber-400'
                  : 'bg-green-500'
              }`}
              style={{ width: desktopState.muted ? '0%' : `${dbToPercent(desktopState.peakDb)}%` }}
            />
          </div>

          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              desktopState.isClipping ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-[#252a3a]'
            }`}
            title="Clip Indicator"
          />
          <span className="w-12 text-right font-mono-numbers text-[10px] text-gray-500">
            {desktopState.muted ? 'MUTED' : `${Math.round(desktopState.peakDb)} dB`}
          </span>
        </div>
      </div>
    </div>
  );
};
