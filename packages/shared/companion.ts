import type { Feeling } from './types';
import { normalizeTranscript } from './triage/safeguarding';

/**
 * Companion chat helpers — deterministic, shared by API and kiosk.
 * The LLM writes friendly replies; these functions decide what gets flagged.
 */

/** Timings for the companion loop. Demo mode shrinks them (see `fastCompanionTimings`). */
export interface CompanionTimings {
  /** How long Ralph waits for a reply before going quiet. */
  replyWaitMs: number;
  /** Quiet period before Ralph checks in again ("Hey, how are you feeling now?"). */
  quietCheckinMs: number;
}

export const AUTO_CHECKIN_MINUTES = 12;

export const DEFAULT_COMPANION_TIMINGS: CompanionTimings = {
  replyWaitMs: 60_000,
  quietCheckinMs: AUTO_CHECKIN_MINUTES * 60_000,
};

export const fastCompanionTimings: CompanionTimings = {
  replyWaitMs: 15_000,
  quietCheckinMs: 30_000,
};

/**
 * Red-flag phrases a child might say mid-chat. Team-defined DEMO list (en only for
 * now) — matches → staff `red_flag` alert. Code decides, not the LLM.
 */
export const RED_FLAG_PHRASES_EN: readonly { phrase: string; reason: string }[] = [
  { phrase: "can't breathe", reason: 'Says it is hard to breathe' },
  { phrase: 'cant breathe', reason: 'Says it is hard to breathe' },
  { phrase: 'hard to breathe', reason: 'Says it is hard to breathe' },
  { phrase: 'cannot breathe', reason: 'Says it is hard to breathe' },
  { phrase: 'chest hurts', reason: 'Says chest hurts' },
  { phrase: 'so sleepy', reason: 'Says very sleepy' },
  { phrase: 'really sleepy', reason: 'Says very sleepy' },
  { phrase: 'cant stay awake', reason: 'Says very sleepy' },
  { phrase: "can't stay awake", reason: 'Says very sleepy' },
  { phrase: 'everything is spinning', reason: 'Says dizzy / spinning' },
  { phrase: 'room is spinning', reason: 'Says dizzy / spinning' },
  { phrase: 'going to faint', reason: 'Says they might faint' },
  { phrase: 'gonna faint', reason: 'Says they might faint' },
  { phrase: 'threw up again', reason: 'Vomited again while waiting' },
  { phrase: 'throwing up', reason: 'Vomiting while waiting' },
  { phrase: 'hurts so much', reason: 'Says pain is very bad' },
  { phrase: 'worst pain', reason: 'Says pain is very bad' },
  { phrase: 'cant see', reason: 'Says trouble seeing' },
  { phrase: "can't see", reason: 'Says trouble seeing' },
  { phrase: 'seeing double', reason: 'Says seeing double' },
];

export function checkRedFlagPhrases(text: string): string[] {
  const norm = ` ${normalizeTranscript(text)} `;
  const reasons = new Set<string>();
  for (const { phrase, reason } of RED_FLAG_PHRASES_EN) {
    if (norm.includes(` ${normalizeTranscript(phrase)} `)) reasons.add(reason);
  }
  return [...reasons];
}

const WORSE = ['worse', 'bad', 'awful', 'terrible', 'more pain', 'hurts more', 'not good', 'sick', 'horrible'];
const BETTER = ['better', 'good', 'great', 'fine', 'happy', 'awesome', 'less pain', 'not hurting'];
const SAME = ['same', 'okay', 'ok', 'meh', 'alright', 'so so', 'still'];

/**
 * Keyword fallback for "how are you feeling?" answers. Used when the LLM is
 * offline, and as a tie-breaker. Negation-aware for the common "not good" case.
 */
export function detectFeeling(text: string): Exclude<Feeling, 'no_response'> | null {
  const norm = ` ${normalizeTranscript(text)} `;
  const has = (words: string[]) => words.some((w) => norm.includes(` ${w} `));
  if (/\bnot (bad|too bad)\b/.test(norm)) return 'same';
  if (has(WORSE) || /\bnot (good|great|better|ok|okay|fine)\b/.test(norm)) return 'worse';
  if (has(BETTER)) return 'better';
  if (has(SAME)) return 'same';
  return null;
}

/** Child is signalling they're done talking. */
export function wantsQuiet(text: string): boolean {
  const norm = ` ${normalizeTranscript(text)} `;
  return [
    ' bye ',
    ' goodbye ',
    ' stop ',
    ' leave me alone ',
    ' dont want to talk ',
    ' don t want to talk ',
    ' i m tired ',
    ' im tired ',
    ' be quiet ',
    ' shh ',
    ' later ',
  ].some((p) => norm.includes(p));
}

/** Offline conversation starters — mix of well-being and fun topics. */
export const FALLBACK_TOPICS: readonly string[] = [
  'What is your favourite animal?',
  'What do you like to do for fun?',
  'Do you have a favourite game or show?',
  'If you could have any superpower, what would it be?',
  "What's the yummiest food in the whole world?",
  'Do you have a pet, or want one?',
  'What is your favourite colour?',
  'What would you build if you had a million blocks?',
  "What's something that made you laugh this week?",
  'Where would you go if you could go anywhere?',
];

const REACTIONS = ['Ooh, cool!', 'I love that!', 'That sounds fun!', 'Wow!', 'Nice!', 'Ha, awesome!'];

/** Deterministic offline reply (no LLM): react → next topic, or feelings response. */
export function fallbackReply(
  childText: string,
  turnIndex: number,
  isCheckin: boolean,
): { reply: string; feeling: Exclude<Feeling, 'no_response'> | null; wantsQuiet: boolean } {
  const feeling = detectFeeling(childText);
  if (wantsQuiet(childText)) {
    return { reply: "Okay! I'll be right here if you want to talk.", feeling, wantsQuiet: true };
  }
  const topic = FALLBACK_TOPICS[turnIndex % FALLBACK_TOPICS.length]!;
  if (isCheckin || feeling) {
    const react =
      feeling === 'worse'
        ? "I'm sorry you feel worse. I'll let the nurse know. Want to talk about something fun?"
        : feeling === 'better'
          ? 'Yay, I am so glad!'
          : 'Thanks for telling me.';
    return { reply: feeling === 'worse' ? react : `${react} ${topic}`, feeling, wantsQuiet: false };
  }
  return { reply: `${REACTIONS[turnIndex % REACTIONS.length]} ${topic}`, feeling, wantsQuiet: false };
}
