// Turn raw microphone samples into a small WAV file. We record WAV ourselves (not MediaRecorder)
// because iPhones only record audio/mp4, which Gemini's transcription model doesn't accept.

/** Averages `input` (at `fromRate` Hz) down to `toRate` Hz. Returns the input if no change needed. */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** 16-bit mono PCM WAV (RIFF) for `samples` in -1..1. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Root-mean-square loudness of a chunk, 0..1 (for "is anyone talking?"). */
export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
