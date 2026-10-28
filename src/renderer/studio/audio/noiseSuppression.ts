import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { AppSettings, NoiseSuppressionLevel } from '../../../shared/types';

let wasmPromise: Promise<ArrayBuffer> | null = null;
const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * RNNoise (recurrent-network noise suppression) as an AudioWorklet node. Runs locally on the
 * 48 kHz mixer context; removes fans, AC hum, keyboard clicks and background chatter from speech.
 */
export async function createRnnoiseNode(ctx: AudioContext): Promise<RnnoiseWorkletNode> {
  if (!wasmPromise) {
    wasmPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).catch((err) => {
      wasmPromise = null; // allow a retry
      throw err;
    });
  }
  let moduleReady = workletLoaded.get(ctx);
  if (!moduleReady) {
    moduleReady = ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
    workletLoaded.set(ctx, moduleReady);
  }
  const [wasmBinary] = await Promise.all([wasmPromise, moduleReady]);
  return new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 2 });
}

/** Effective level, including settings saved before levels existed. */
export function resolveNoiseLevel(settings: Pick<AppSettings, 'noiseSuppression' | 'noiseSuppressionLevel'> | null | undefined): NoiseSuppressionLevel {
  if (settings?.noiseSuppressionLevel) return settings.noiseSuppressionLevel;
  return settings?.noiseSuppression === false ? 'off' : 'strong';
}
