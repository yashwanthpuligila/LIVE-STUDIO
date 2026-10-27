import React, { useEffect, useState } from 'react';
import { Radio, Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle, Wifi, X } from 'lucide-react';
import { StreamConfig, StreamStats, StreamStatus } from '../../shared/types';

interface YouTubeLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamStatus: StreamStatus;
  streamStats: StreamStats;
  streamKey: string;
  onUpdateStreamKey: (key: string) => void;
  rtmpUrl: string;
  outputFps?: number;
  onStartStream: (config: StreamConfig) => Promise<void>;
  onStopStream: () => Promise<void>;
  error?: string | null;
}

export const YouTubeLiveModal: React.FC<YouTubeLiveModalProps> = ({
  isOpen,
  onClose,
  streamStatus,
  streamStats,
  streamKey,
  onUpdateStreamKey,
  rtmpUrl,
  outputFps = 30,
  onStartStream,
  onStopStream,
  error,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [streamTitle, setStreamTitle] = useState('KLH Lecture');
  const [bitrate, setBitrate] = useState(4500);
  // Default to the composition frame rate; streaming above it only duplicates frames
  const [fps, setFps] = useState<number>(outputFps);
  const [confirmStop, setConfirmStop] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Settings load after mount; follow the output frame rate until the user picks one
  useEffect(() => setFps(outputFps), [outputFps]);

  if (!isOpen) return null;

  const isLive = streamStatus === 'live';
  const isConnecting = streamStatus === 'connecting';

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await onStartStream({
        rtmpUrl: rtmpUrl || 'rtmps://a.rtmp.youtube.com/live2',
        streamKey,
        resolution: { width: 1920, height: 1080 },
        fps,
        videoBitrate: bitrate,
        audioBitrate: 160,
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    await onStopStream();
    setConfirmStop(false);
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#14161f] border border-[#2b3040] rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242938]">
          <div className="flex items-center gap-2.5">
            <Radio className={`w-5 h-5 ${isLive ? 'text-red-500 animate-pulse' : 'text-blue-400'}`} />
            <div>
              <h2 className="text-sm font-semibold text-white">YouTube Live Streaming Control</h2>
              <p className="text-[11px] text-gray-400">Direct RTMPS broadcast to your YouTube channel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#202534]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
          {/* Status banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLive
                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                : isConnecting
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-[#181b26] border-[#252b3d] text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-3 h-3 rounded-full ${
                  isLive
                    ? 'bg-red-500 animate-ping'
                    : isConnecting
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-gray-500'
                }`}
              />
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Status: {streamStatus}
              </span>
            </div>

            {isLive && (
              <div className="flex items-center gap-4 font-mono-numbers">
                <span>⏱ {formatUptime(streamStats.uptimeSec)}</span>
                <span>{streamStats.fps} FPS</span>
                <span>{streamStats.bitrateKbps} kbps</span>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Stream Key input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-gray-300 font-medium">YouTube Stream Key</label>
              <a
                href="https://studio.youtube.com/channel/live/controlroom"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                <span>Get Stream Key from YouTube</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={streamKey}
                disabled={isLive || isConnecting}
                onChange={(e) => onUpdateStreamKey(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                className="w-full bg-[#10121a] border border-[#282d3e] rounded-lg px-3 py-2 pr-10 text-gray-200 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-gray-400 hover:text-gray-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[10px] text-gray-500">
              Encrypted locally using Windows DPAPI safeStorage. Never shared or logged.
            </span>
          </div>

          {/* Stream Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 font-medium">Broadcast Session Title</label>
            <input
              type="text"
              value={streamTitle}
              disabled={isLive || isConnecting}
              onChange={(e) => setStreamTitle(e.target.value)}
              className="bg-[#10121a] border border-[#282d3e] rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Encoder Configuration */}
          <div className="grid grid-cols-2 gap-3 bg-[#181b26] p-3 rounded-xl border border-[#252b3d]">
            <div>
              <label className="text-gray-400 text-[10px]">Target Bitrate</label>
              <select
                value={bitrate}
                disabled={isLive || isConnecting}
                onChange={(e) => setBitrate(parseInt(e.target.value, 10))}
                className="w-full bg-[#10121a] border border-[#2a3042] rounded px-2 py-1.5 text-gray-200 mt-1"
              >
                <option value={3000}>3000 kbps (720p30 / Low bandwidth)</option>
                <option value={4500}>4500 kbps (1080p60 Standard)</option>
                <option value={6000}>6000 kbps (1080p60 High Quality)</option>
                <option value={9000}>9000 kbps (1440p / 2K)</option>
              </select>
            </div>

            <div>
              <label className="text-gray-400 text-[10px]">Frame Rate</label>
              <select
                value={fps}
                disabled={isLive || isConnecting}
                onChange={(e) => setFps(parseInt(e.target.value, 10))}
                className="w-full bg-[#10121a] border border-[#2a3042] rounded px-2 py-1.5 text-gray-200 mt-1"
              >
                <option value={60}>60 FPS (Ultra Smooth)</option>
                <option value={30}>30 FPS (Standard)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="px-6 py-4 bg-[#10121a] border-t border-[#242938] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2434] transition-colors"
          >
            Close
          </button>

          {!isLive && !isConnecting ? (
            <button
              onClick={handleStart}
              disabled={!streamKey || isStarting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02]"
            >
              <Radio className="w-4 h-4" />
              <span>{isStarting ? 'Starting Stream...' : 'Go Live on YouTube'}</span>
            </button>
          ) : confirmStop ? (
            <div className="flex items-center gap-2">
              <span className="text-red-400 font-medium">End stream for all viewers?</span>
              <button
                onClick={handleStop}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium"
              >
                Yes, Stop Stream
              </button>
              <button
                onClick={() => setConfirmStop(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmStop(true)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600 hover:text-white transition-all font-medium"
            >
              <span>Stop Streaming</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
