import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGS, type Lang } from '../types.js';
import { SAFEGUARDING_PHRASES, detectSafeguarding, safeguardingAlert } from './safeguarding.js';
import { findPhrase } from './text.js';

/** One disclosure and one innocent sentence (often using the same verb) per language. */
const CASES: Record<Lang, { positive: string; benign: string[] }> = {
  en: {
    positive: 'My dad hits me when he gets angry.',
    benign: ['My brother hit the ball really far', 'My tummy hurts me a lot', 'I got hit by a ball, it hurts'],
  },
  es: { positive: 'Mi tío me pega mucho', benign: ['Me lastima la panza', 'Me duele la cabeza'] },
  fr: { positive: "Il me frappe quand je pleure", benign: ["J'ai mal au ventre", 'Ça me fait mal ici'] },
  hi: { positive: 'पापा मुझे मारते हैं', benign: ['मेरे पेट में दर्द है', 'मुझे बुखार है'] },
  'zh-CN': { positive: '爸爸打我', benign: ['我肚子疼', '我想打电话给妈妈'] },
};

describe.each(SUPPORTED_LANGS.map((l) => [l] as const))('%s phrase list', (lang) => {
  it('has phrases', () => {
    expect(SAFEGUARDING_PHRASES[lang].length).toBeGreaterThan(10);
  });
  it('fires on a disclosure', () => {
    expect(detectSafeguarding({ transcript: CASES[lang].positive, lang }).fired).toBe(true);
  });
  it('does not fire on ordinary symptom talk', () => {
    for (const benign of CASES[lang].benign) {
      expect(detectSafeguarding({ transcript: benign, lang }), benign).toMatchObject({ fired: false });
    }
  });
});

describe('detectSafeguarding', () => {
  it('fires on the LLM signal alone (OR, not AND)', () => {
    expect(detectSafeguarding({ transcript: 'I want to stay here', lang: 'en', llm_concern: true })).toEqual({
      fired: true,
      signals: ['llm'],
      phrase: null,
    });
  });

  it('reports both signals when both fire', () => {
    expect(detectSafeguarding({ transcript: 'he hits me', lang: 'en', llm_concern: true }).signals).toEqual([
      'phrase',
      'llm',
    ]);
  });

  it('checks the English translation too (missed or mixed-language wording)', () => {
    const r = detectSafeguarding({ transcript: 'algo raro', lang: 'es', text_en: 'someone hurt me at home' });
    expect(r).toMatchObject({ fired: true, phrase: 'someone hurt me' });
  });

  it('catches English words mixed into another language (code-switching)', () => {
    expect(detectSafeguarding({ transcript: 'मेरे uncle hit me', lang: 'hi' }).fired).toBe(true);
  });

  it('nothing → not fired, no alert', () => {
    const r = detectSafeguarding({ transcript: 'my tummy hurts', lang: 'en', llm_concern: false });
    expect(r.fired).toBe(false);
    expect(safeguardingAlert(r)).toBeNull();
  });

  it('builds a staff-only alert that says why', () => {
    const alert = safeguardingAlert(detectSafeguarding({ transcript: 'she hurts me', lang: 'en' }));
    expect(alert).toMatchObject({ kind: 'safeguarding', key: 'safeguarding:she hurts me' });
    expect(alert?.reason).toContain('she hurts me');
  });
});

describe('findPhrase', () => {
  it('matches whole words, ignoring case and punctuation', () => {
    expect(findPhrase('He HIT me!!', ['hit me'], 'en')).toBe('hit me');
    expect(findPhrase('the white meat', ['hit me'], 'en')).toBeNull();
  });
  it('matches Chinese as substrings', () => {
    expect(findPhrase('昨天爸爸打我了', ['打我'], 'zh-CN')).toBe('打我');
  });
});
