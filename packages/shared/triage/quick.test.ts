import { describe, expect, it } from 'vitest';
import { quickAnswer } from './quick.js';
import { TREES, getNode, normalizeAnswer } from './trees.js';

const tummy = TREES.tummy!;
const ask = (nodeId: string, said: string, lang: 'en' | 'es' = 'en') => quickAnswer(getNode(tummy, nodeId), said, lang);

describe('quick answers (code, before Gemini)', () => {
  it('body map: clear parts map to a region; vague or mixed answers do not', () => {
    expect(ask('where', 'my belly button')).toBe('belly_button');
    expect(ask('where', 'it hurts down here on the right side')).toBe('lower_right_tummy');
    expect(ask('where', 'the lower right side of my tummy')).toBe('lower_right_tummy');
    expect(ask('where', 'below my belly button')).toBe('lower_middle_tummy');
    expect(ask('where', 'My head.')).toBe('head');
    expect(ask('where', 'everywhere')).toBe('all_over');
    expect(ask('where', 'my tummy')).toBeNull(); // which part? the child points instead
    expect(ask('where', 'my head and my tummy')).toBeNull();
    expect(ask('where', 'my head and my legs')).toBeNull();
    expect(ask('where', 'not my head')).toBeNull();
  });

  it('yes / no / not sure', () => {
    expect(ask('throw_up', 'yeah I threw up')).toBe('yes');
    expect(ask('throw_up', 'Yes.')).toBe('yes');
    expect(ask('throw_up', "no I haven't")).toBe('no');
    expect(ask('throw_up', 'nope')).toBe('no');
    expect(ask('throw_up', "I don't know")).toBe('not_sure');
    expect(ask('throw_up', 'I did')).toBe('yes');
    expect(ask('throw_up', 'yes no maybe')).toBe('not_sure');
    expect(ask('throw_up', 'yes but no')).toBeNull();
    expect(ask('throw_up', 'I threw up in the car')).toBeNull(); // Gemini reads this one
  });

  it('faces', () => {
    expect(ask('pain_face', 'a lot')).toBe(4);
    expect(ask('pain_face', 'quite a lot')).toBe(3);
    expect(ask('pain_face', "it doesn't hurt")).toBe(0);
    expect(ask('pain_face', 'the worst')).toBe(5);
    expect(ask('pain_face', 'three')).toBe(3);
    expect(ask('pain_face', 'not a lot')).toBeNull();
  });

  it('numbers', () => {
    expect(ask('throw_up_count', 'twice')).toBe(2);
    expect(ask('throw_up_count', 'three times')).toBe(3);
    expect(ask('throw_up_count', '7')).toBe(7);
    expect(normalizeAnswer(getNode(tummy, 'throw_up_count'), 7)).toBe(5); // "5 or more"
    expect(ask('throw_up_count', 'two or three')).toBeNull();
    expect(ask('throw_up_count', 'lots of times')).toBeNull();
  });

  it('choices use only the options of this question', () => {
    expect(ask('how_long', 'yesterday')).toBe('before today');
    expect(ask('how_long', 'this morning')).toBe('today');
    expect(ask('poop', 'runny')).toBe('runny');
    expect(ask('poop', "I haven't gone")).toBe('not gone');
    expect(ask('poop', 'not normal')).toBeNull();
    expect(ask('how_long', 'runny')).toBeNull();
  });

  it('only English is matched by code; other languages go to Gemini', () => {
    expect(ask('throw_up', 'sí', 'es')).toBeNull();
    expect(ask('where', '', 'en')).toBeNull();
  });

  it('every quick answer passes the same validation as a tap', () => {
    const samples: [string, string][] = [
      ['where', 'belly button'], ['pain_face', 'a bit'], ['how_long', 'today'], ['throw_up', 'yes'],
      ['throw_up_count', 'once'], ['drink', 'no'], ['poop', 'normal'], ['hot', 'yeah'],
    ];
    for (const [id, said] of samples) {
      const v = ask(id, said);
      expect(v, `${id}: ${said}`).not.toBeNull();
      expect(normalizeAnswer(getNode(tummy, id), v)).toBe(v);
    }
  });
});
