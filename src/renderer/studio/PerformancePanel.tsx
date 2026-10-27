import React from 'react';
import { Activity, Cpu, HardDrive, Film, AlertTriangle, ShieldCheck, Zap, X } from 'lucide-react';
import { PerformanceMetrics } from '../../shared/types';

interface PerformancePanelProps {
  metrics: PerformanceMetrics;
  isOpen: boolean;
  onClose: () => void;
  onToggleLowEndOptimization: (enabled: boolean) => void;
  lowEndOptimization: boolean;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({
  metrics,
  isOpen,
  onClose,
  onToggleLowEndOptimization,
  lowEndOptimization,
}) => {
  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const isFpsDrop = metrics.currentCaptureFps < metrics.targetFps * 0.8;
  const isCpuHigh = metrics.cpuPercent > 70;

  return (
    <div className="bg-[#12141c] border border-[#262c3e] rounded-xl p-4 flex flex-col gap-3 shadow-xl text-xs w-80">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#212636]">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>Real-time Studio Telemetry</span>
        </div>
        <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1f2434]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Warnings Banner if high load */}
      {(isFpsDrop || isCpuHigh || metrics.writeErrors > 0) && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2 text-[11px]">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            {isFpsDrop && <span>FPS is dropping below target ({metrics.currentCaptureFps} FPS). Consider Intel i3 Mode.</span>}
            {isCpuHigh && <span>CPU utilization is elevated ({metrics.cpuPercent}%). Hardware encoder active.</span>}
            {metrics.writeErrors > 0 && <span>Disk write buffer warnings: {metrics.writeErrors}</span>}
          </div>
        </div>
      )}

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {/* Metric 1: Capture FPS */}
        <div className="bg-[#181c28] p-2 rounded-lg border border-[#262c3e] flex flex-col">
          <span className="text-gray-400 text-[10px]">Capture FPS</span>
          <div className="flex items-baseline gap-1 font-mono-numbers mt-0.5">
            <span className={`text-base font-bold ${isFpsDrop ? 'text-amber-400' : 'text-emerald-400'}`}>
              {metrics.currentCaptureFps}
            </span>
            <span className="text-gray-500 text-[10px]">/ {metrics.targetFps} target</span>
          </div>
        </div>

        {/* Metric 2: Dropped Frames */}
        <div className="bg-[#181c28] p-2 rounded-lg border border-[#262c3e] flex flex-col">
          <span className="text-gray-400 text-[10px]">Dropped Frames</span>
          <span className={`text-base font-bold font-mono-numbers mt-0.5 ${metrics.droppedFrames > 0 ? 'text-amber-400' : 'text-gray-200'}`}>
            {metrics.droppedFrames}
          </span>
        </div>

        {/* Metric 3: CPU Usage */}
        <div className="bg-[#181c28] p-2 rounded-lg border border-[#262c3e] flex flex-col">
          <div className="flex items-center gap-1 text-gray-400 text-[10px]">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span>Process CPU</span>
          </div>
          <span className={`text-base font-bold font-mono-numbers mt-0.5 ${isCpuHigh ? 'text-amber-400' : 'text-blue-400'}`}>
            {metrics.cpuPercent}%
          </span>
        </div>

        {/* Metric 4: Process Memory */}
        <div className="bg-[#181c28] p-2 rounded-lg border border-[#262c3e] flex flex-col">
          <div className="flex items-center gap-1 text-gray-400 text-[10px]">
            <HardDrive className="w-3 h-3 text-purple-400" />
            <span>Process RAM</span>
          </div>
          <span className="text-base font-bold font-mono-numbers mt-0.5 text-purple-400">
            {metrics.processMemoryMb} MB
          </span>
        </div>
      </div>

      {/* Source & Resolution Details */}
      <div className="bg-[#181c28] p-2.5 rounded-lg border border-[#262c3e] flex flex-col gap-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-gray-400">Active Source:</span>
          <span className="text-gray-200 font-medium truncate max-w-[170px]" title={metrics.selectedSource}>
            {metrics.selectedSource}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Captured Res:</span>
          <span className="font-mono text-gray-200">{metrics.capturedResolution}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Output Stream:</span>
          <span className="font-mono text-gray-200">{metrics.outputResolution}</span>
        </div>
      </div>

      {/* Active Encoder & Acceleration */}
      <div className="bg-[#181c28] p-2.5 rounded-lg border border-[#262c3e] flex flex-col gap-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Active Encoder:</span>
          <span className="text-emerald-400 font-semibold">{metrics.activeEncoder}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Hardware Accel:</span>
          <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${metrics.hardwareAcceleration ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700 text-gray-300'}`}>
            {metrics.hardwareAcceleration ? 'Enabled (Intel QSV / MF)' : 'Software (CPU)'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Audio Sync Status:</span>
          <span className="text-gray-300 font-mono">{metrics.audioCaptureStatus}</span>
        </div>
        {metrics.fileSizeBytes > 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-[#232838]">
            <span className="text-gray-400">Current File Size:</span>
            <span className="text-gray-200 font-mono">{formatFileSize(metrics.fileSizeBytes)}</span>
          </div>
        )}
      </div>

      {/* Intel i3 / Low-End Laptop Optimization Toggle */}
      <div className="flex items-center justify-between p-2.5 bg-[#1b1f2e] rounded-lg border border-blue-500/30">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-400" />
          <div>
            <span className="text-white font-medium text-[11px]">Intel i3 Laptop Mode</span>
            <p className="text-[10px] text-gray-400">Sets 30 FPS target and optimizes preview rendering.</p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={lowEndOptimization}
          onChange={(e) => onToggleLowEndOptimization(e.target.checked)}
          className="w-4 h-4 accent-blue-600 rounded"
        />
      </div>
    </div>
  );
};
