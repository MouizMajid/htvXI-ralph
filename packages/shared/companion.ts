import { normalizeText } from './triage/text.js';

/**
 * Companion chat helpers (waiting room) — deterministic, shared by API and kiosk.
 *
 * The chat is company, not assessment: Gemini (or these offline fallbacks) writes Ralph's
 * friendly words, the child's messages reach the nurse as their own words, and alerts come
 * only from the shared rules (rules.ts). Nothing here records how the child feels — if a
 * message sounds like "worse", the kiosk offers the check-in so the child answers by tap.
 */

/** Ralph goes quiet if the child doesn't reply for this long (they can wake him anytime). */
export const COMPANION_QUIET_AFTER_MS = 60_000;

/** A check-in left unanswered this long is recorded as `no_response`. */
export const CHECKIN_ANSWER_TIMEOUT_MS = 60_000;

/** Strip apostrophes before normalizing so "can't" -> "cant". */
const normPhrase = (s: string) => normalizeText(s.replace(/['’`]/g, ''));

const WORSE = ['worse', 'awful', 'terrible', 'more pain', 'hurts more', 'not good', 'horrible', 'feel sick'];
const BETTER = ['better', 'good', 'great', 'fine', 'happy', 'awesome', 'less pain', 'not hurting'];

/**
 * Does this message sound like "I feel worse"? Keyword match, code only. Used for two
 * things: picking a kind offline reply, and offering the tap check-in. Never stored.
 */
export function soundsWorse(text: string): boolean {
  const norm = ` ${normPhrase(text)} `;
  if (/\bnot (bad|too bad)\b/.test(norm)) return false;
  return WORSE.some((w) => norm.includes(` ${w} `)) || /\bnot (good|great|better|ok|okay|fine)\b/.test(norm);
}

function soundsBetter(text: string): boolean {
  const norm = ` ${normPhrase(text)} `;
  return !soundsWorse(text) && BETTER.some((w) => norm.includes(` ${w} `));
}

/** Child is signalling they're done talking. */
export function wantsQuiet(text: string): boolean {
  const norm = ` ${normPhrase(text)} `;
  return [
    ' bye ',
    ' goodbye ',
    ' stop ',
    ' leave me alone ',
    ' dont want to talk ',
    ' i m tired ',
    ' im tired ',
    ' be quiet ',
    ' shh ',
    ' later ',
  ].some((p) => norm.includes(p));
}

/** Offline conversation starters — fun topics. */
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

/** Deterministic offline reply (no LLM): react, then the next fun topic. English only. */
export function fallbackReply(childText: string, turnIndex: number): { reply: string; wantsQuiet: boolean } {
  if (wantsQuiet(childText)) return { reply: "Okay! I'll be right here if you want to talk.", wantsQuiet: true };
  const topic = FALLBACK_TOPICS[turnIndex % FALLBACK_TOPICS.length]!;
  if (soundsWorse(childText)) {
    return { reply: "I'm sorry you feel that way. Let's tell the nurse with a quick tap.", wantsQuiet: false };
  }
  if (soundsBetter(childText)) return { reply: `Yay, I'm so glad! ${topic}`, wantsQuiet: false };
  return { reply: `${REACTIONS[turnIndex % REACTIONS.length]} ${topic}`, wantsQuiet: false };
}
