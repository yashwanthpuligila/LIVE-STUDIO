import React, { useState, useEffect } from 'react';
import {
  Settings,
  ArrowLeft,
  Save,
  Folder,
  Radio,
  Sliders,
  Mic,
  Camera,
  Keyboard,
  ShieldCheck,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  HardDrive,
  Cpu,
  Zap,
  Monitor,
} from 'lucide-react';
import { AppSettings, DiskSpaceInfo, EncoderCapability, HardwareProfile } from '../../shared/types';
import { BrandingAdminPanel } from '../settings/BrandingAdminPanel';

interface SettingsPageProps {
  onBackToStudio: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBackToStudio }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null);
  const [availableEncoders, setAvailableEncoders] = useState<EncoderCapability[]>([]);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'youtube' | 'shortcuts' | 'obs' | 'branding'>('video');

  // Device lists
  const [audioDevices, setAudioDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [videoDevices, setVideoDevices] = useState<{ deviceId: string; label: string }[]>([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.settings.get().then((s) => setSettings(s));
      window.electronAPI.system.getDiskSpace().then((d) => setDiskSpace(d));
      window.electronAPI.system.getEncoders().then((encoders) => setAvailableEncoders(encoders || []));
      window.electronAPI.system.getHardwareProfile().then(setHardware).catch(() => undefined);
    }

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setAudioDevices(
        devices.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }))
      );
      setVideoDevices(
        devices.filter((d) => d.kind === 'videoinput').map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }))
      );
    });
  }, []);

  const handleSave = async () => {
    if (settings && window.electronAPI) {
      if (settings.selectedEncoderId) {
        await window.electronAPI.system.setActiveEncoder(settings.selectedEncoderId);
      }
      await window.electronAPI.settings.update(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleSelectFolder = async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.system.selectDirectory();
      if (selected && settings) {
        setSettings({ ...settings, recordingDir: selected });
      }
    }
  };

  if (!settings) {
    return (
      <div className="flex h-screen w-screen bg-[#0c0d10] items-center justify-center text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0d10] text-gray-100 overflow-hidden select-none text-xs">
      {/* Top Bar */}
      <header className="h-14 bg-[#12141a] border-b border-[#202534] flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToStudio}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1e2b] hover:bg-[#252b3d] text-gray-300 hover:text-white border border-[#2c3347] font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Studio Workspace</span>
          </button>
          <div className="h-4 w-[1px] bg-[#292f42]" />
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Settings className="w-4 h-4 text-blue-400" />
            <span>Application Settings</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/30 transition-all"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Settings Saved!' : 'Save Changes'}</span>
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Tabs */}
        <div className="w-60 bg-[#12141b] border-r border-[#202534] p-3 flex flex-col gap-1">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium text-left transition-colors ${
              activeTab === 'video'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#181b24]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Video & Canvas</span>
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium text-left transition-colors ${
              activeTab === 'audio'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#181b24]'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Audio & Devices</span>
          </button>

          <button
            onClick={() => setActiveTab('youtube')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium text-left transition-colors ${
              activeTab === 'youtube'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#181b24]'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>YouTube Live & Stream</span>
          </button>

          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium text-left transition-colors ${
              activeTab === 'shortcuts'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#181b24]'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Keyboard Shortcuts</span>
          </button>

          <button
            onClick={() => setActiveTab('obs')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium text-left transition-colors ${
              activeTab === 'obs'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#181b24]'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>OBS WebSocket (Mode A)</span>
          </button>

          <button
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium text-left transition-colors ${
              activeTab === 'branding'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#181b24]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Branding (Admin)</span>
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
          {/* TAB 1: Video */}
          {activeTab === 'video' && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Video, Recording & Hardware Acceleration</h3>
                <p className="text-gray-500">Configure recording profiles, video encoding hardware, and performance tuning.</p>
              </div>

              {/* Detected hardware + one-click recommended settings */}
              {hardware && (
                <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2 text-white font-semibold">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span>This PC</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 capitalize">
                        {hardware.tier} performance tier
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate" title={hardware.cpuModel}>
                      {hardware.cpuModel} • {hardware.logicalCores} threads • {hardware.totalMemoryGb} GB RAM
                    </p>
                    <p className="text-[11px] text-gray-500 truncate" title={hardware.gpus.join(', ')}>
                      {hardware.gpus.join(' + ') || 'GPU unknown'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Recommended: {hardware.recommended.height}p @ {hardware.recommended.fps} FPS • {hardware.recommended.videoBitrateKbps.toLocaleString()} kbps
                    </p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, ...hardware.recommended, recordingProfile: 'balanced' })}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-medium transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Use recommended</span>
                  </button>
                </div>
              )}

              {/* Recording Profile Selector */}
              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  <span>Recording Profile</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    onClick={() =>
                      setSettings({
                        ...settings,
                        recordingProfile: 'balanced',
                        resolutionPreset: '1080p',
                        width: 1920,
                        height: 1080,
                        fps: 30,
                        videoBitrateKbps: 5000,
                      })
                    }
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      settings.recordingProfile === 'balanced'
                        ? 'bg-blue-600/15 border-blue-500 text-white'
                        : 'bg-[#10121a] border-[#222736] text-gray-400 hover:border-[#32394e]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white">Balanced Profile</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                        Intel i3 Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">1080p @ 30 FPS • 5,000 kbps</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Optimal balance of sharp crisp desktop recording and low CPU/battery consumption.
                    </p>
                  </div>

                  <div
                    onClick={() =>
                      setSettings({
                        ...settings,
                        recordingProfile: 'high',
                        resolutionPreset: '1080p',
                        width: 1920,
                        height: 1080,
                        fps: 60,
                        videoBitrateKbps: 6000,
                      })
                    }
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      settings.recordingProfile === 'high'
                        ? 'bg-blue-600/15 border-blue-500 text-white'
                        : 'bg-[#10121a] border-[#222736] text-gray-400 hover:border-[#32394e]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white">High Quality</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
                        60 FPS
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">1080p @ 60 FPS • 6,000 kbps</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Ultra-smooth motion for high frame rate demonstrations and responsive gaming.
                    </p>
                  </div>
                </div>

                {/* Profile Detail Fields */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-400 font-medium text-[11px]">Resolution</label>
                    <select
                      value={settings.resolutionPreset}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setSettings({
                          ...settings,
                          recordingProfile: 'custom',
                          resolutionPreset: val,
                          width: val === '4k' ? 3840 : val === '720p' ? 1280 : 1920,
                          height: val === '4k' ? 2160 : val === '720p' ? 720 : 1080,
                        });
                      }}
                      className="bg-[#10121a] border border-[#2b3142] rounded-xl px-2.5 py-1.5 text-gray-200 text-xs"
                    >
                      <option value="1080p">1080p (1920 x 1080)</option>
                      <option value="720p">720p (1280 x 720 Fallback)</option>
                      <option value="4k">4K (3840 x 2160)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-gray-400 font-medium text-[11px]">Framerate</label>
                    <select
                      value={settings.fps}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          recordingProfile: 'custom',
                          fps: parseInt(e.target.value, 10) as any,
                        })
                      }
                      className="bg-[#10121a] border border-[#2b3142] rounded-xl px-2.5 py-1.5 text-gray-200 text-xs"
                    >
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={60}>60 FPS (Ultra Smooth)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-gray-400 font-medium text-[11px]">Bitrate (kbps)</label>
                    <input
                      type="number"
                      min="1500"
                      max="20000"
                      step="500"
                      value={settings.videoBitrateKbps}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          recordingProfile: 'custom',
                          videoBitrateKbps: parseInt(e.target.value, 10) || 5000,
                        })
                      }
                      className="bg-[#10121a] border border-[#2b3142] rounded-xl px-2.5 py-1.5 text-gray-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Hardware Video Encoder Selection */}
              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span>Video Encoding Engine</span>
                  </div>
                  {availableEncoders.find((e) => e.id === settings.selectedEncoderId)?.type === 'hardware' ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <Zap className="w-3 h-3" /> Hardware Accelerated
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                      CPU Software Encoding
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 font-medium">Selected Video Encoder</label>
                  <select
                    value={settings.selectedEncoderId}
                    onChange={(e) => setSettings({ ...settings, selectedEncoderId: e.target.value })}
                    className="bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 text-gray-200"
                  >
                    {availableEncoders.map((encoder) => (
                      <option
                        key={encoder.id}
                        value={encoder.id}
                        disabled={!encoder.isAvailable}
                      >
                        {encoder.name} [{encoder.type.toUpperCase()}] {encoder.isAvailable ? '✓ Available' : '✗ Unavailable'}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Intel QuickSync (<code className="text-gray-400">h264_qsv</code>) and Windows Media Foundation (
                    <code className="text-gray-400">h264_mf</code>) offload encoding to your GPU silicon, leaving CPU cores
                    free for your presentation.
                  </p>
                </div>
              </div>

              {/* Optimizations & Window Behavior */}
              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Performance & Screen Capture Settings</span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-[#181b26] rounded-xl border border-[#252a3a]">
                  <div>
                    <span className="font-semibold text-gray-200 text-xs">Intel Core i3 / Low-End Optimization Mode</span>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      Throttles background preview canvas rendering and uses bounded frame queues to prevent CPU spikes on budget laptops.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.lowEndOptimization}
                    onChange={(e) => setSettings({ ...settings, lowEndOptimization: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-[#181b26] rounded-xl border border-[#252a3a]">
                  <div>
                    <span className="font-semibold text-gray-200 text-xs">Auto-Minimize Studio on Recording Start</span>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      Automatically minimizes the Lecture Studio window when screen recording starts to avoid recursive preview loop.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.minimizeOnRecord}
                    onChange={(e) => setSettings({ ...settings, minimizeOnRecord: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </div>

                {/* Storage Destination */}
                <div className="flex flex-col gap-1.5 pt-3 border-t border-[#1e2330]">
                  <div className="flex items-center justify-between">
                    <label className="text-gray-300 font-medium">Recording Save Directory</label>
                    {diskSpace && (
                      <span className="text-[11px] text-gray-500">
                        Free Space: <span className="text-gray-300 font-mono">{(diskSpace.freeBytes / 1024 ** 3).toFixed(1)} GB</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={settings.recordingDir}
                      className="flex-1 bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 text-gray-300 font-mono text-[11px]"
                    />
                    <button
                      onClick={handleSelectFolder}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#202534] hover:bg-[#2b3247] rounded-xl text-gray-200 font-medium transition-colors"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>Browse...</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Audio */}
          {activeTab === 'audio' && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Audio & Device Preferences</h3>
                <p className="text-gray-500">Select default microphone and configure hardware filtering.</p>
              </div>

              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 font-medium">Default Microphone</label>
                  <select
                    value={settings.defaultMicId}
                    onChange={(e) => setSettings({ ...settings, defaultMicId: e.target.value })}
                    className="bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 text-gray-200"
                  >
                    <option value="default">System Default Input</option>
                    {audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between p-3 bg-[#181b26] rounded-xl border border-[#252a3a]">
                  <div>
                    <span className="font-medium text-gray-200">AI Noise Suppression</span>
                    <p className="text-gray-500 text-[11px]">Filters out background fan hum, air conditioning, and room noise.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.noiseSuppression}
                    onChange={(e) => setSettings({ ...settings, noiseSuppression: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-[#181b26] rounded-xl border border-[#252a3a]">
                  <div>
                    <span className="font-medium text-gray-200">Acoustic Echo Cancellation</span>
                    <p className="text-gray-500 text-[11px]">Prevents desktop speaker feedback from leaking into your microphone.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.echoCancellation}
                    onChange={(e) => setSettings({ ...settings, echoCancellation: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: YouTube Live */}
          {activeTab === 'youtube' && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-semibold text-white">YouTube Live Streaming Settings</h3>
                <p className="text-gray-500">Configure RTMPS ingest server and secure stream key.</p>
              </div>

              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                  <span>
                    Your YouTube stream key is securely encrypted on this machine using Windows Data Protection API (DPAPI).
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 font-medium">YouTube RTMPS Ingest URL</label>
                  <input
                    type="text"
                    value={settings.youtubeRtmpUrl}
                    onChange={(e) => setSettings({ ...settings, youtubeRtmpUrl: e.target.value })}
                    className="bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 text-gray-200 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 font-medium">Stream Key</label>
                  <div className="relative flex items-center">
                    <input
                      type={showStreamKey ? 'text' : 'password'}
                      value={settings.youtubeStreamKey}
                      onChange={(e) => setSettings({ ...settings, youtubeStreamKey: e.target.value })}
                      placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                      className="w-full bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 pr-10 text-gray-200 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="absolute right-3 text-gray-400 hover:text-gray-200"
                    >
                      {showStreamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Shortcuts */}
          {activeTab === 'shortcuts' && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Global Keyboard Shortcuts</h3>
                <p className="text-gray-500">Trigger actions from anywhere on your desktop while presenting.</p>
              </div>

              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-3 font-mono text-xs">
                {Object.entries(settings.shortcuts || {}).map(([action, key]) => (
                  <div key={action} className="flex items-center justify-between py-2 border-b border-[#1e2330]">
                    <span className="text-gray-300 font-sans capitalize">{action.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="px-2.5 py-1 bg-[#10121a] rounded-lg border border-[#292f42] text-blue-400">
                      {key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: OBS WebSocket */}
          {activeTab === 'branding' && <BrandingAdminPanel />}

          {activeTab === 'obs' && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-semibold text-white">OBS Studio WebSocket Bridge (Mode A)</h3>
                <p className="text-gray-500">Optionally control an external OBS Studio instance using WebSocket v5.</p>
              </div>

              <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between p-3 bg-[#181b26] rounded-xl border border-[#252a3a]">
                  <div>
                    <span className="font-medium text-gray-200">Enable OBS WebSocket Integration</span>
                    <p className="text-gray-500 text-[11px]">Sync scene triggers and recording controls with OBS Studio.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.obsEnabled}
                    onChange={(e) => setSettings({ ...settings, obsEnabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 font-medium">WebSocket Server URL</label>
                  <input
                    type="text"
                    value={settings.obsWebSocketUrl}
                    onChange={(e) => setSettings({ ...settings, obsWebSocketUrl: e.target.value })}
                    className="bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 text-gray-200 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 font-medium">Server Password</label>
                  <input
                    type="password"
                    value={settings.obsWebSocketPassword}
                    onChange={(e) => setSettings({ ...settings, obsWebSocketPassword: e.target.value })}
                    placeholder="OBS WebSocket server password..."
                    className="bg-[#10121a] border border-[#2b3142] rounded-xl px-3 py-2 text-gray-200"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
