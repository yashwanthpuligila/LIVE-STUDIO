import { RecorderVideoCodec } from '../../../shared/types';

// H.264 first: on realistic screen content it measured ~3.5x less CPU than VP8 in Chromium's
// MediaRecorder, and it can be remuxed straight into MP4 without a second encode.
const FORMAT_CANDIDATES: { mimeType: string; codec: RecorderVideoCodec }[] = [
  { mimeType: 'video/x-matroska;codecs=avc1,opus', codec: 'h264' },
  { mimeType: 'video/webm;codecs=h264,opus', codec: 'h264' },
  { mimeType: 'video/webm;codecs=vp8,opus', codec: 'vp8' },
  { mimeType: 'video/webm', codec: 'vp8' },
];

export function pickRecorderFormat(): { mimeType: string; codec: RecorderVideoCodec } {
  for (const f of FORMAT_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(f.mimeType)) return f;
  }
  return { mimeType: '', codec: 'vp8' };
}

export function createRecorder(stream: MediaStream, videoBitrateKbps: number) {
  const format = pickRecorderFormat();
  const options: MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number } = {
    videoBitsPerSecond: videoBitrateKbps * 1000,
    audioBitsPerSecond: 160_000,
    // Regular keyframes keep long recordings seekable and let streams recover from packet loss
    videoKeyFrameIntervalDuration: 2000,
  };
  if (format.mimeType) options.mimeType = format.mimeType;
  return { recorder: new MediaRecorder(stream, options), codec: format.codec };
}

/**
 * Forward recorder chunks to `send` strictly in order, and return a function that stops the
 * recorder and resolves only after the final chunk has been sent. Without this, the last second
 * of every recording could be dropped (stop() delivers its final chunk asynchronously) and
 * concurrent arrayBuffer() reads could reorder chunks.
 */
export function pipeRecorderChunks(rec: MediaRecorder, send: (buf: ArrayBuffer) => void): () => Promise<void> {
  let chain: Promise<void> = Promise.resolve();

  rec.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    const blob = e.data;
    chain = chain.then(async () => send(await blob.arrayBuffer())).catch((err) => {
      console.error('[Recorder] Failed to forward chunk:', err);
    });
  };

  return () =>
    new Promise<void>((resolve) => {
      if (rec.state === 'inactive') {
        chain.then(resolve);
        return;
      }
      rec.addEventListener('stop', () => chain.then(resolve), { once: true });
      rec.stop();
    });
}
