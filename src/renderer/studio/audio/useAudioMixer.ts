import { useEffect, useRef, useState, useCallback } from 'react';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface AudioChannelState {
  id: string;
  name: string;
  volume: number; // 0 to 1.5
  muted: boolean;
  peakDb: number; // -60 to 0 dB
  rmsDb: number; // -60 to 0 dB
  isClipping: boolean;
}

export function useAudioMixer(options?: {
  defaultMicId?: string;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
}) {
  const [micDevices, setMicDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(options?.defaultMicId || 'default');

  // Channel states
  const [micState, setMicState] = useState<AudioChannelState>({
    id: 'mic',
    name: 'Microphone',
    volume: 1.0,
    muted: false,
    peakDb: -60,
    rmsDb: -60,
    isClipping: false,
  });

  const [desktopState, setDesktopState] = useState<AudioChannelState>({
    id: 'desktop',
    name: 'Desktop Audio',
    volume: 1.0,
    muted: false,
    peakDb: -60,
    rmsDb: -60,
    isClipping: false,
  });

  // Audio nodes refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const desktopSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const desktopGainRef = useRef<GainNode | null>(null);
  const desktopAnalyserRef = useRef<AnalyserNode | null>(null);

  const animationFrameRef = useRef<number | null>(null);

  // Initialize AudioContext
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });
    audioContextRef.current = ctx;

    const masterDest = ctx.createMediaStreamDestination();
    masterDestinationRef.current = masterDest;

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

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
            noiseSuppression: options?.noiseSuppression ?? true,
            echoCancellation: options?.echoCancellation ?? true,
            autoGainControl: true,
          },
          video: false,
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        micStreamRef.current = stream;
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(micGainRef.current);
        micSourceRef.current = source;
      } catch (err) {
        console.warn('Could not acquire microphone stream:', err);
      }
    }

    setupMic();

    return () => {
      active = false;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [selectedMicId, options?.noiseSuppression, options?.echoCancellation]);

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
  useEffect(() => {
    if (micGainRef.current && audioContextRef.current) {
      const targetGain = micState.muted ? 0 : micState.volume;
      micGainRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.05);
    }
  }, [micState.volume, micState.muted]);

  useEffect(() => {
    if (desktopGainRef.current && audioContextRef.current) {
      const targetGain = desktopState.muted ? 0 : desktopState.volume;
      desktopGainRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.05);
    }
  }, [desktopState.volume, desktopState.muted]);

  // Metering loop (Peak dB & RMS calculation)
  useEffect(() => {
    const micData = new Float32Array(512);
    const desktopData = new Float32Array(512);

    function calculateLevel(analyser: AnalyserNode | null, buffer: Float32Array) {
      if (!analyser) return { peakDb: -60, rmsDb: -60, isClipping: false };
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
      const isClipping = peak >= 0.99;

      return { peakDb, rmsDb, isClipping };
    }

    let isRunning = true;
    function meterLoop() {
      if (!isRunning) return;

      if (micAnalyserRef.current) {
        const { peakDb, rmsDb, isClipping } = calculateLevel(micAnalyserRef.current, micData);
        setMicState(prev => ({ ...prev, peakDb, rmsDb, isClipping }));
      }

      if (desktopAnalyserRef.current) {
        const { peakDb, rmsDb, isClipping } = calculateLevel(desktopAnalyserRef.current, desktopData);
        setDesktopState(prev => ({ ...prev, peakDb, rmsDb, isClipping }));
      }

      animationFrameRef.current = requestAnimationFrame(meterLoop);
    }

    animationFrameRef.current = requestAnimationFrame(meterLoop);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
    masterAudioStream: masterDestinationRef.current?.stream || null,
  };
}
