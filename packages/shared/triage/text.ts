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

/** Words that flip a phrase's meaning ("don't" normalizes to "don t", hence "t"). */
const NEGATIONS = new Set(['not', 'no', 'never', 't', 'dont', 'doesnt', 'didnt', 'isnt', 'cant']);

/**
 * Like findPhrase, but a phrase's words may have up to `maxGap` filler words between them,
 * so "chest hurts" matches "my chest really hurts". A negation in the gap blocks the match
 * ("chest does not hurt"). zh-CN falls back to findPhrase.
 */
export function findLoosePhrase(text: string, phrases: readonly string[], lang: Lang, maxGap = 2): string | null {
  if (lang === 'zh-CN') return findPhrase(text, phrases, lang);
  const words = normalizeText(text.replace(/['’`]/g, ' ')).split(' ').filter(Boolean);
  if (!words.length) return null;
  for (const raw of phrases) {
    const want = normalizeText(raw.replace(/['’`]/g, ' ')).split(' ').filter(Boolean);
    if (want.length && words.some((_, start) => matchesFrom(words, want, start, maxGap))) return raw;
  }
  return null;
}

function matchesFrom(words: string[], want: string[], start: number, maxGap: number): boolean {
  if (words[start] !== want[0]) return false;
  // "I did not throw up blood": a negation just before the phrase blocks it too.
  if (words.slice(Math.max(0, start - 2), start).some((w) => NEGATIONS.has(w))) return false;
  let at = start;
  for (const w of want.slice(1)) {
    let next = at + 1;
    while (next < words.length && words[next] !== w && next - at - 1 < maxGap) {
      if (NEGATIONS.has(words[next]!)) return false;
      next++;
    }
    if (words[next] !== w) return false;
    at = next;
  }
  return true;
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
