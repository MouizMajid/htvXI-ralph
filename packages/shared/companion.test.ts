import { describe, expect, it } from 'vitest';
import { checkRedFlagPhrases, detectFeeling, fallbackReply, wantsQuiet } from './companion.js';

describe('detectFeeling', () => {
  it.each([
    ['I feel better now', 'better'],
    ['kinda the same', 'same'],
    ['worse, my tummy hurts more', 'worse'],
    ['not good', 'worse'],
    ['not bad', 'same'],
    ['I like dinosaurs', null],
  ])('%s → %s', (text, expected) => {
    expect(detectFeeling(text)).toBe(expected);
  });
});

describe('checkRedFlagPhrases', () => {
  it('catches breathing trouble with apostrophes stripped', () => {
    expect(checkRedFlagPhrases("I can't breathe good")).toContain('Says it is hard to breathe');
  });
  it('benign text', () => {
    expect(checkRedFlagPhrases('I breathe on the window to draw')).toEqual([]);
  });
});

describe('wantsQuiet / fallbackReply', () => {
  it('detects bye', () => {
    expect(wantsQuiet('ok bye ralph')).toBe(true);
    expect(wantsQuiet('I like bikes')).toBe(false);
  });
  it('fallback asks a topic and reports feeling', () => {
    const r = fallbackReply('better', 0, true);
    expect(r.feeling).toBe('better');
    expect(r.reply).toMatch(/\?$/);
  });
});
