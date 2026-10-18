import { describe, expect, it } from 'vitest';
import { fallbackReply, soundsWorse, wantsQuiet } from './companion.js';

describe('soundsWorse (offers the tap check-in; never stored)', () => {
  it.each([
    ['I feel worse', true],
    ['worse, my tummy hurts more', true],
    ['not good', true],
    ['not bad', false],
    ['I feel better now', false],
    ['I like dinosaurs', false],
  ])('%s → %s', (text, expected) => {
    expect(soundsWorse(text)).toBe(expected);
  });
});

describe('wantsQuiet / fallbackReply', () => {
  it('detects bye', () => {
    expect(wantsQuiet('ok bye ralph')).toBe(true);
    expect(wantsQuiet('I like bikes')).toBe(false);
  });
  it('reacts and asks a fun topic', () => {
    expect(fallbackReply('I like bikes', 0).reply).toMatch(/\?$/);
  });
  it('points a "worse" message to the tap check-in', () => {
    expect(fallbackReply('I feel worse', 0).reply).toMatch(/nurse/);
  });
  it('is never cheery about symptoms', () => {
    expect(fallbackReply('I threw up blood', 0).reply).not.toMatch(/cool|fun|awesome|wow/i);
    expect(fallbackReply('my tummy hurts', 3).reply).toMatch(/nurse/);
    expect(fallbackReply('I like hot dogs', 0).reply).not.toMatch(/nurse/);
  });
  it('goes quiet on bye', () => {
    expect(fallbackReply('bye', 0)).toMatchObject({ wantsQuiet: true });
  });
});
