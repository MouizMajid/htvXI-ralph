// Microphone → 16 kHz mono WAV, on every browser (incl. iPhone). Needs HTTPS (or localhost).
import { downsample, encodeWav } from './wav';

export const MAX_RECORDING_MS = 15_000;
const TARGET_RATE = 16_000;

type AudioCtor = typeof AudioContext;
const audioContextCtor = (): AudioCtor | null =>
  typeof window === 'undefined'
    ? null
    : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null);

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && audioContextCtor() !== null;
}

export interface Recording {
  /** Stop and get the WAV. */
  stop: () => Promise<Blob>;
  /** Stop and throw the audio away. */
  cancel: () => void;
}

/**
 * Start recording. Rejects if the microphone is unavailable or permission is denied.
 * Stops by itself after MAX_RECORDING_MS (calls `onAutoStop`).
 */
export async function startRecording(onAutoStop?: () => void): Promise<Recording> {
  const Ctx = audioContextCtor();
  if (!Ctx || !navigator.mediaDevices?.getUserMedia) throw new Error('recording not supported');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but works everywhere; this is a 15-second clip, not a studio.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor);
  processor.connect(ctx.destination); // required for onaudioprocess to fire; outputs silence

  let finished = false;
  const release = () => {
    finished = true;
    clearTimeout(timer);
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
  const timer = setTimeout(() => onAutoStop?.(), MAX_RECORDING_MS);

  return {
    stop: async () => {
      if (finished) throw new Error('already stopped');
      const rate = ctx.sampleRate;
      release();
      const merged = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return new Blob([encodeWav(downsample(merged, rate, TARGET_RATE), TARGET_RATE)], { type: 'audio/wav' });
    },
    cancel: () => {
      if (!finished) release();
    },
  };
}
