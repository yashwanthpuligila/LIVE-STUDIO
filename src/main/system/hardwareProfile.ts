import os from 'os';
import { app } from 'electron';
import { HardwareProfile, HardwareTier } from '../../shared/types';

const VENDOR_NVIDIA = 0x10de;
const VENDOR_AMD = 0x1002;

const TIER_SETTINGS: Record<HardwareTier, HardwareProfile['recommended']> = {
  low: { resolutionPreset: '720p', width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500, lowEndOptimization: true },
  balanced: { resolutionPreset: '1080p', width: 1920, height: 1080, fps: 30, videoBitrateKbps: 5000, lowEndOptimization: true },
  high: { resolutionPreset: '1080p', width: 1920, height: 1080, fps: 60, videoBitrateKbps: 8000, lowEndOptimization: false },
};

// Budget CPU families that struggle with real-time 1080p regardless of core count
const LOW_END_CPU = /celeron|pentium|atom|athlon|\bi3-[2-7]\d{3}|a[4-9]-\d{4}|n\d{3,4}\b/i;

let cached: HardwareProfile | null = null;

export async function getHardwareProfile(): Promise<HardwareProfile> {
  if (cached) return cached;

  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() || 'Unknown CPU';
  const logicalCores = cpus.length || 2;
  const totalMemoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;

  let gpus: string[] = [];
  let hasDiscreteGpu = false;
  try {
    const info: any = await app.getGPUInfo('basic');
    const devices: any[] = info?.gpuDevice || [];
    gpus = devices.map((d) => d.deviceString).filter((s) => s && !/basic render/i.test(s));
    hasDiscreteGpu = devices.some(
      (d) => d.vendorId === VENDOR_NVIDIA || (d.vendorId === VENDOR_AMD && !/radeon\(tm\) graphics|vega \d+ graphics/i.test(d.deviceString || ''))
    );
  } catch (e) {
    console.warn('[Hardware] GPU info unavailable:', e);
  }

  let tier: HardwareTier;
  if (logicalCores <= 4 || totalMemoryGb < 7 || LOW_END_CPU.test(cpuModel)) {
    tier = 'low';
  } else if (hasDiscreteGpu && logicalCores >= 8 && totalMemoryGb >= 12) {
    tier = 'high';
  } else {
    tier = 'balanced';
  }

  cached = {
    tier,
    cpuModel,
    logicalCores,
    totalMemoryGb,
    gpus,
    hasDiscreteGpu,
    recommended: TIER_SETTINGS[tier],
  };
  return cached;
}
