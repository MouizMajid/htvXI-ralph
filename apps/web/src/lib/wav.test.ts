import { describe, expect, it } from 'vitest';
import { downsample, encodeWav, rms } from './wav';

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM header and samples', () => {
    const buf = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const v = new DataView(buf);
    const str = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect([str(0), str(8), str(12), str(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383]);
  });

  it('clips out-of-range samples instead of wrapping', () => {
    const v = new DataView(encodeWav(new Float32Array([2, -3]), 8000));
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([32767, -32768]);
  });
});

describe('downsample', () => {
  it('averages 48 kHz down to 16 kHz', () => {
    expect([...downsample(new Float32Array([0, 0.3, 0.6, 1, 1, 1]), 48000, 16000)].map((x) => +x.toFixed(2))).toEqual([0.3, 1]);
  });
  it('leaves audio alone when already at or below the target', () => {
    const a = new Float32Array([0.1, 0.2]);
    expect(downsample(a, 16000, 16000)).toBe(a);
  });
});

describe('rms', () => {
  it('is 0 for silence and grows with loudness', () => {
    expect(rms(new Float32Array(10))).toBe(0);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
