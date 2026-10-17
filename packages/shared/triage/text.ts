import type { Lang } from '../types.js';

/** Lowercase, Unicode-normalize, turn punctuation/symbols into spaces, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * First phrase found in `text`, or null. Matches whole words (so "hit me" doesn't
 * match "white meat"); for zh-CN, which has no word spaces, matches substrings.
 */
export function findPhrase(text: string, phrases: readonly string[], lang: Lang): string | null {
  const norm = normalizeText(text);
  if (!norm) return null;
  const haystack = lang === 'zh-CN' ? norm.replace(/\s/g, '') : ` ${norm} `;
  for (const raw of phrases) {
    const p = normalizeText(raw);
    if (!p) continue;
    const needle = lang === 'zh-CN' ? p.replace(/\s/g, '') : ` ${p} `;
    if (haystack.includes(needle)) return raw;
  }
  return null;
}
