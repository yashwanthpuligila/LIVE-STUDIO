import React, { useState, useEffect } from 'react';
import {
  Video,
  Radio,
  Film,
  Settings,
  HardDrive,
  Play,
  Layers,
  Plus,
  ShieldCheck,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { AppSettings, DiskSpaceInfo, RecordingItem, Scene } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';

interface DashboardPageProps {
  onOpenStudio: () => void;
  onOpenRecordings: () => void;
  onOpenSettings: () => void;
  onQuickRecord: () => void;
  onQuickLive: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenStudio,
  onOpenRecordings,
  onOpenSettings,
  onQuickRecord,
  onQuickLive,
}) => {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.recordings.getAll().then((r) => setRecordings(r));
      window.electronAPI.scenes.getAll().then((s) => setScenes(s));
      window.electronAPI.settings.get().then((set) => setSettings(set));
      window.electronAPI.system.getDiskSpace().then((d) => setDiskSpace(d));
    }
  }, []);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const freeGb = diskSpace ? (diskSpace.freeBytes / (1024 * 1024 * 1024)).toFixed(1) : '64.2';
  const totalGb = diskSpace ? (diskSpace.totalBytes / (1024 * 1024 * 1024)).toFixed(0) : '476';
  const usedPercent = diskSpace
    ? Math.round(((diskSpace.totalBytes - diskSpace.freeBytes) / diskSpace.totalBytes) * 100)
    : 45;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0d10] text-gray-100 overflow-y-auto select-none">
      {/* Top Header */}
      <header className="h-16 bg-[#12141b] border-b border-[#202534] flex items-center justify-between px-8 z-10 sticky top-0 backdrop-blur-md">
        <BrandMark size="md" />

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenRecordings}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#181b24] hover:bg-[#222736] text-gray-300 hover:text-white border border-[#272d3e] text-xs font-medium transition-colors"
          >
            <Film className="w-4 h-4 text-blue-400" />
            <span>Recordings Library</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#181b24] hover:bg-[#222736] text-gray-300 hover:text-white border border-[#272d3e] text-xs font-medium transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-400" />
            <span>Settings</span>
          </button>

          <button
            onClick={onOpenStudio}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02]"
          >
            <span>Open Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hero Quick Launch Section */}
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Studio Dashboard</h1>
          <p className="text-gray-400 text-xs mt-1">
            Capture your screen, draw live annotations, record lectures and stream to YouTube Live.
          </p>
        </div>

        {/* 3 Main Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Studio Workspace */}
          <div
            onClick={onOpenStudio}
            className="group relative bg-[#14161f] hover:bg-[#181b26] border border-[#262b3c] hover:border-blue-500/50 rounded-2xl p-6 cursor-pointer shadow-xl transition-all hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Video className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                New Studio Session
              </h2>
              <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                Open the studio to set up scenes, webcam, audio and drawing tools.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-blue-400 font-medium text-xs mt-6">
              <span>Enter Workspace</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Start Screen Recording */}
          <div
            onClick={onQuickRecord}
            className="group relative bg-[#14161f] hover:bg-[#181b26] border border-[#262b3c] hover:border-red-500/50 rounded-2xl p-6 cursor-pointer shadow-xl transition-all hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
              </div>
              <h2 className="text-base font-semibold text-white group-hover:text-red-400 transition-colors">
                Start Screen Recording
              </h2>
              <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                Record lectures as MP4 with your voice, webcam and on-screen drawings.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-red-400 font-medium text-xs mt-6">
              <span>Record Lecture</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: YouTube Live */}
          <div
            onClick={onQuickLive}
            className="group relative bg-[#14161f] hover:bg-[#181b26] border border-[#262b3c] hover:border-purple-500/50 rounded-2xl p-6 cursor-pointer shadow-xl transition-all hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Radio className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-white group-hover:text-purple-400 transition-colors">
                Start YouTube Live
              </h2>
              <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                Stream low-latency RTMPS video straight to YouTube Live with real-time health telemetry.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-purple-400 font-medium text-xs mt-6">
              <span>Go Live Stream</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* System & Connection Status Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Status 1: Storage Indicator */}
          <div className="bg-[#14161f] border border-[#262a36] rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-xs text-white">Storage Capacity</span>
              </div>
              <span className="text-[11px] font-mono text-gray-400">
                {freeGb} GB Free of {totalGb} GB
              </span>
            </div>

            <div className="w-full h-2.5 bg-[#1b1e2b] rounded-full overflow-hidden my-3 p-0.5 border border-[#262c3e]">
              <div
                className={`h-full rounded-full transition-all ${
                  usedPercent > 90 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                }`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="truncate max-w-[280px]">Dest: {settings?.recordingDir}</span>
              <span>{usedPercent}% Used</span>
            </div>
          </div>

          {/* Status 2: YouTube Live Connection Health */}
          <div className="bg-[#14161f] border border-[#262a36] rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-400" />
                <span className="font-semibold text-xs text-white">YouTube Broadcast Connection</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  settings?.youtubeStreamKey
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {settings?.youtubeStreamKey ? 'Configured & Encrypted' : 'Stream Key Missing'}
              </span>
            </div>

            <p className="text-[11px] text-gray-400 my-2">
              {settings?.youtubeStreamKey
                ? 'Ready to broadcast live via RTMPS to YouTube Live ingest server.'
                : 'Configure your YouTube stream key in Settings to enable direct one-click broadcasting.'}
            </p>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-gray-500 font-mono">rtmps://a.rtmp.youtube.com/live2</span>
              <button
                onClick={onOpenSettings}
                className="text-[11px] text-blue-400 hover:underline"
              >
                Configure
              </button>
            </div>
          </div>
        </div>

        {/* Recent Recordings Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Recent Recordings</h2>
            </div>
            <button
              onClick={onOpenRecordings}
              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>View All ({recordings.length})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recordings.length === 0 ? (
            <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-8 flex flex-col items-center justify-center text-gray-500 text-xs gap-2">
              <p>No video recordings yet.</p>
              <button
                onClick={onQuickRecord}
                className="text-blue-400 hover:underline"
              >
                Start your first screen recording
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recordings.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  onClick={onOpenRecordings}
                  className="bg-[#14161f] border border-[#242938] hover:border-[#373e54] rounded-2xl overflow-hidden cursor-pointer shadow-lg group transition-all"
                >
                  <div className="aspect-video bg-[#090a0e] relative flex items-center justify-center overflow-hidden">
                    {item.thumbnailPath ? (
                      <img src={item.thumbnailPath} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-8 h-8 text-gray-700" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-gray-200 font-mono">
                      {formatDuration(item.durationSec)}
                    </div>
                  </div>

                  <div className="p-3">
                    <h3 className="font-medium text-xs text-gray-200 truncate group-hover:text-white" title={item.title}>
                      {item.title}
                    </h3>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1 font-mono">
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      <span>{formatFileSize(item.fileSize)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
