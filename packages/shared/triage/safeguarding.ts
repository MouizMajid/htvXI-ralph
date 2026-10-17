import type { Alert, Lang } from '../types.js';
import { findPhrase } from './text.js';
import en from './i18n/safeguarding/en.json' with { type: 'json' };
import hi from './i18n/safeguarding/hi.json' with { type: 'json' };
import es from './i18n/safeguarding/es.json' with { type: 'json' };
import fr from './i18n/safeguarding/fr.json' with { type: 'json' };
import zhCN from './i18n/safeguarding/zh-CN.json' with { type: 'json' };

/*
 * Safeguarding = two independent signals; flag if EITHER fires (never AND):
 *   1. deterministic phrase lists (this file), 2. the LLM's `safeguarding_concern`.
 * False positives are acceptable; false negatives are not. See triage-engine skill.
 *
 * Lists avoid bare "hurts me" etc. — in a symptom conversation ("my tummy hurts me")
 * that would fire constantly and train staff to ignore the flag.
 */
export const SAFEGUARDING_PHRASES: Record<Lang, string[]> = {
  en: en.phrases,
  hi: hi.phrases,
  es: es.phrases,
  fr: fr.phrases,
  'zh-CN': zhCN.phrases,
};

export interface SafeguardingInput {
  /** What the child said, in the session language. */
  transcript: string;
  lang: Lang;
  /** English translation (also checked against the English list — covers code-switching). */
  text_en?: string;
  /** From the per-turn interpretation call; undefined if that call failed. */
  llm_concern?: boolean;
}

export interface SafeguardingResult {
  fired: boolean;
  signals: ('phrase' | 'llm')[];
  phrase: string | null;
}

export function detectSafeguarding({ transcript, lang, text_en, llm_concern }: SafeguardingInput): SafeguardingResult {
  const phrase =
    findPhrase(transcript, SAFEGUARDING_PHRASES[lang], lang) ??
    (lang !== 'en' ? findPhrase(transcript, SAFEGUARDING_PHRASES.en, 'en') : null) ??
    (text_en ? findPhrase(text_en, SAFEGUARDING_PHRASES.en, 'en') : null);

  const signals: SafeguardingResult['signals'] = [];
  if (phrase) signals.push('phrase');
  if (llm_concern) signals.push('llm');
  return { fired: signals.length > 0, signals, phrase };
}

/** Staff-only alert. Never sent to the kiosk or parent view. */
export function safeguardingAlert(result: SafeguardingResult): Alert | null {
  if (!result.fired) return null;
  const how = result.phrase ? `phrase "${result.phrase}"` : 'AI flagged the wording';
  return {
    kind: 'safeguarding',
    key: `safeguarding:${result.phrase ?? 'llm'}`,
    reason: `Possible safeguarding concern — ${how}. Talk with the child privately.`,
  };
}
