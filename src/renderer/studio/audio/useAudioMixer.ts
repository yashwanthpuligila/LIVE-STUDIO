import { useEffect, useRef, useState, useCallback } from 'react';
import { NoiseSuppressionLevel } from '../../../shared/types';
import { createRnnoiseNode } from './noiseSuppression';

/** What the mic filter is actually doing right now (strong can fall back to standard). */
export type NoiseStatus = 'off' | 'standard' | 'loading' | 'strong' | 'fallback';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface AudioChannelState {
  id: string;
  name: string;
  volume: number; // 0 to 1.5
  muted: boolean;
}

export interface AudioLevel {
  peakDb: number; // -60 to 0 dB
  rmsDb: number; // -60 to 0 dB
  isClipping: boolean;
}

const SILENT: AudioLevel = { peakDb: -60, rmsDb: -60, isClipping: false };

function calculateLevel(analyser: AnalyserNode | null, buffer: Float32Array<ArrayBuffer>): AudioLevel {
  if (!analyser) return SILENT;
  analyser.getFloatTimeDomainData(buffer);

  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const val = Math.abs(buffer[i]);
    if (val > peak) peak = val;
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);

  // Convert to dB (-60 to 0)
  const peakDb = peak > 0.0001 ? Math.max(-60, Math.min(0, 20 * Math.log10(peak))) : -60;
  const rmsDb = rms > 0.0001 ? Math.max(-60, Math.min(0, 20 * Math.log10(rms))) : -60;
  return { peakDb, rmsDb, isClipping: peak >= 0.99 };
}

export function useAudioMixer(options?: {
  defaultMicId?: string;
  noiseLevel?: NoiseSuppressionLevel;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
}) {
  const noiseLevel = options?.noiseLevel ?? 'strong';
  const [noiseStatus, setNoiseStatus] = useState<NoiseStatus>('off');
  const [micDevices, setMicDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(options?.defaultMicId || 'default');

  // Channel states
  const [micState, setMicState] = useState<AudioChannelState>({
    id: 'mic',
    name: 'Microphone',
    volume: 1.0,
    muted: false,
  });

  const [desktopState, setDesktopState] = useState<AudioChannelState>({
    id: 'desktop',
    name: 'Desktop Audio',
    volume: 1.0,
    muted: false,
  });

  // Audio nodes refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micDenoiseRef = useRef<{ destroy(): void; disconnect(): void } | null>(null);

  const desktopSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const desktopGainRef = useRef<GainNode | null>(null);
  const desktopAnalyserRef = useRef<AnalyserNode | null>(null);

  // While an intro/outro clip plays, live mic/desktop are silenced so only the clip is heard
  const duckedRef = useRef(false);
  const micStateRef = useRef<AudioChannelState | null>(null);
  const desktopStateRef = useRef<AudioChannelState | null>(null);

  const levelBuffersRef = useRef({ mic: new Float32Array(512), desktop: new Float32Array(512) });
  // State (not a ref) so consumers re-render once when the stream becomes available
  const [masterAudioStream, setMasterAudioStream] = useState<MediaStream | null>(null);

  // Initialize AudioContext
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });
    audioContextRef.current = ctx;

    const masterDest = ctx.createMediaStreamDestination();
    masterDestinationRef.current = masterDest;
    setMasterAudioStream(masterDest.stream);

    // Mic Gain and Analyser
    const mGain = ctx.createGain();
    const mAnalyser = ctx.createAnalyser();
    mAnalyser.fftSize = 512;
    mAnalyser.smoothingTimeConstant = 0.5;
    mGain.connect(mAnalyser);
    mGain.connect(masterDest);
    micGainRef.current = mGain;
    micAnalyserRef.current = mAnalyser;

    // Desktop Gain and Analyser
    const dGain = ctx.createGain();
    const dAnalyser = ctx.createAnalyser();
    dAnalyser.fftSize = 512;
    dAnalyser.smoothingTimeConstant = 0.5;
    dGain.connect(dAnalyser);
    dGain.connect(masterDest);
    desktopGainRef.current = dGain;
    desktopAnalyserRef.current = dAnalyser;

    return () => {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    };
  }, []);

  // Enumerate input devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`,
        }));
      setMicDevices(audioInputs);
      if (audioInputs.length > 0 && selectedMicId === 'default') {
        setSelectedMicId(audioInputs[0].deviceId);
      }
    } catch (e) {
      console.warn('Failed to enumerate audio devices:', e);
    }
  }, [selectedMicId]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  // Connect microphone stream
  useEffect(() => {
    let active = true;

    async function setupMic() {
      if (!audioContextRef.current || !micGainRef.current) return;

      // Stop previous mic stream
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (micSourceRef.current) {
        try { micSourceRef.current.disconnect(); } catch {}
        micSourceRef.current = null;
      }
      releaseDenoiser();

      try {
        const ctx = audioContextRef.current;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
            // Strong mode feeds RNNoise the raw signal; stacking Chromium's filter on top garbles speech
            noiseSuppression: noiseLevel === 'standard',
            echoCancellation: options?.echoCancellation ?? true,
            autoGainControl: options?.autoGainControl ?? true,
          },
          video: false,
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        micStreamRef.current = stream;
        const source = ctx.createMediaStreamSource(stream);
        micSourceRef.current = source;

        if (noiseLevel !== 'strong') {
          source.connect(micGainRef.current);
          setNoiseStatus(noiseLevel);
          return;
        }

        setNoiseStatus('loading');
        try {
          const denoise = await createRnnoiseNode(ctx);
          if (!active) {
            denoise.destroy();
            return;
          }
          source.connect(denoise);
          denoise.connect(micGainRef.current);
          micDenoiseRef.current = denoise;
          setNoiseStatus('strong');
        } catch (err) {
          // Keep the mic working with the built-in filter rather than going silent
          console.warn('[Audio] AI noise suppression unavailable, using standard filter:', err);
          if (!active) return;
          source.connect(micGainRef.current);
          stream.getAudioTracks()[0]?.applyConstraints({ noiseSuppression: true }).catch(() => {});
          setNoiseStatus('fallback');
        }
      } catch (err) {
        console.warn('Could not acquire microphone stream:', err);
      }
    }

    function releaseDenoiser() {
      const node = micDenoiseRef.current;
      micDenoiseRef.current = null;
      if (!node) return;
      try { node.disconnect(); } catch {}
      try { node.destroy(); } catch {}
    }

    setupMic();

    return () => {
      active = false;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      releaseDenoiser();
    };
  }, [selectedMicId, noiseLevel, options?.echoCancellation, options?.autoGainControl]);

  // Attach desktop audio stream if available
  const attachDesktopAudioStream = useCallback((stream: MediaStream) => {
    if (!audioContextRef.current || !desktopGainRef.current) return;

    if (desktopSourceRef.current) {
      try { desktopSourceRef.current.disconnect(); } catch {}
      desktopSourceRef.current = null;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      try {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(desktopGainRef.current);
        desktopSourceRef.current = source;
      } catch (err) {
        console.warn('Failed to attach desktop audio track:', err);
      }
    }
  }, []);

  // Update Gain values on volume/mute change
  micStateRef.current = micState;
  desktopStateRef.current = desktopState;

  useEffect(() => {
    if (micGainRef.current && audioContextRef.current) {
      const targetGain = micState.muted || duckedRef.current ? 0 : micState.volume;
      micGainRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.05);
    }
  }, [micState.volume, micState.muted]);

  useEffect(() => {
    if (desktopGainRef.current && audioContextRef.current) {
      const targetGain = desktopState.muted || duckedRef.current ? 0 : desktopState.volume;
      desktopGainRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.05);
    }
  }, [desktopState.volume, desktopState.muted]);

  // Meter levels are pulled on demand by the mixer panel at a modest rate, instead of being pushed
  // through React state every animation frame (which re-rendered the entire Studio page ~60x/sec).
  const readLevels = useCallback((): { mic: AudioLevel; desktop: AudioLevel } => {
    const bufs = levelBuffersRef.current;
    return {
      mic: calculateLevel(micAnalyserRef.current, bufs.mic),
      desktop: calculateLevel(desktopAnalyserRef.current, bufs.desktop),
    };
  }, []);

  /** Route a clip's audio into the recording mix and duck live inputs; returns a restore function. */
  const playClipAudio = useCallback((video: HTMLVideoElement): (() => void) => {
    const ctx = audioContextRef.current;
    const dest = masterDestinationRef.current;
    if (!ctx || !dest) return () => {};
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    let source: MediaElementAudioSourceNode | null = null;
    try {
      source = ctx.createMediaElementSource(video);
      source.connect(dest);
    } catch (e) {
      console.warn('Clip audio routing failed:', e);
    }

    duckedRef.current = true;
    micGainRef.current?.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    desktopGainRef.current?.gain.setTargetAtTime(0, ctx.currentTime, 0.05);

    return () => {
      try { source?.disconnect(); } catch {}
      duckedRef.current = false;
      const mic = micStateRef.current;
      const desk = desktopStateRef.current;
      if (mic) micGainRef.current?.gain.setTargetAtTime(mic.muted ? 0 : mic.volume, ctx.currentTime, 0.05);
      if (desk) desktopGainRef.current?.gain.setTargetAtTime(desk.muted ? 0 : desk.volume, ctx.currentTime, 0.05);
    };
  }, []);

  const setMicVolume = useCallback((volume: number) => {
    setMicState(prev => ({ ...prev, volume: Math.max(0, Math.min(1.5, volume)) }));
  }, []);

  const toggleMicMute = useCallback(() => {
    setMicState(prev => ({ ...prev, muted: !prev.muted }));
  }, []);

  const setDesktopVolume = useCallback((volume: number) => {
    setDesktopState(prev => ({ ...prev, volume: Math.max(0, Math.min(1.5, volume)) }));
  }, []);

  const toggleDesktopMute = useCallback(() => {
    setDesktopState(prev => ({ ...prev, muted: !prev.muted }));
  }, []);

  return {
    micDevices,
    selectedMicId,
    setSelectedMicId,
    micState,
    setMicVolume,
    toggleMicMute,
    desktopState,
    setDesktopVolume,
    toggleDesktopMute,
    attachDesktopAudioStream,
    readLevels,
    playClipAudio,
    masterAudioStream,
    noiseStatus,
  };
}
