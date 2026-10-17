import type { Lang } from '../types.js';

/**
 * Deterministic safeguarding phrase check — one of two signals (the other is the
 * LLM's `safeguarding_concern`). Flag if EITHER fires. See triage-engine skill.
 *
 * TODO(Tier 1 #5): load curated per-language lists from
 * i18n/safeguarding/{lang}.json and add Vitest cases (positive + benign per language).
 */

export interface SafeguardingMatch {
  fired: boolean;
  phrase: string | null;
}

export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkSafeguarding(
  transcript: string,
  phrases: readonly string[],
  lang: Lang,
): SafeguardingMatch {
  const text = normalizeTranscript(transcript);
  for (const raw of phrases) {
    const phrase = normalizeTranscript(raw);
    if (!phrase) continue;
    // zh-CN has no word spaces: plain substring. Others: match on word boundaries.
    const hit =
      lang === 'zh-CN'
        ? text.includes(phrase)
        : ` ${text} `.includes(` ${phrase} `);
    if (hit) return { fired: true, phrase: raw };
  }
  return { fired: false, phrase: null };
}
