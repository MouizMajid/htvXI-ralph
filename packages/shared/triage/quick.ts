import type { Lang, SlotValue } from '../types.js';
import type { TreeNode } from '../schemas.js';
import { normalizeText } from './text.js';

/*
 * Quick answers: plain English words mapped to an answer by code, before Gemini is asked.
 * "my belly button", "yeah", "a lot", "twice" are instant, free, and work when Gemini is down.
 * Deliberately conservative: anything unclear, mixed, or negated returns null and goes to
 * Gemini (or the child taps). The result still goes through normalizeAnswer.
 */

/** Strip apostrophes ("haven't" → "havent") so phrase lists stay simple. */
const norm = (s: string) => normalizeText(s.replace(/['’`]/g, ''));

const NEGATION = /\b(not|no|never|dont|doesnt|didnt|isnt|havent|cant)\b/;

const BODY_PHRASES: Record<string, readonly string[]> = {
  lower_middle_tummy: [
    'below my belly button', 'under my belly button', 'lower tummy', 'bottom of my tummy', 'bottom of my belly',
    'lower belly', 'low in my tummy', 'lower middle',
  ],
  lower_right_tummy: [
    'lower right', 'bottom right', 'down on the right', 'down here on the right', 'low on the right',
    'right side of my tummy', 'right side of my belly', 'right side of my stomach',
  ],
  lower_left_tummy: [
    'lower left', 'bottom left', 'down on the left', 'down here on the left', 'low on the left',
    'left side of my tummy', 'left side of my belly', 'left side of my stomach',
  ],
  upper_tummy: [
    'upper tummy', 'top of my tummy', 'top of my belly', 'top of my stomach', 'upper belly', 'upper stomach', 'under my ribs',
  ],
  belly_button: ['belly button', 'bellybutton', 'tummy button', 'navel', 'middle of my tummy', 'middle of my belly'],
  all_over: ['all over', 'everywhere', 'whole body', 'my whole body'],
  head: ['headache', 'forehead', 'head'],
  throat: ['sore throat', 'throat'],
  chest: ['chest'],
  back: ['back'],
  arms: ['arms', 'arm', 'hands', 'hand', 'elbow', 'shoulder'],
  legs: ['legs', 'leg', 'knee', 'knees', 'foot', 'feet'],
};
/** Tummy words without a part ("my tummy") — the child should point instead. */
const VAGUE_TUMMY = ['tummy', 'belly', 'stomach', 'tum'];

const FACE_PHRASES: Record<number, readonly string[]> = {
  0: ['doesnt hurt', 'it doesnt hurt', 'no pain', 'not at all', 'fine', 'zero', '0'],
  1: ['a tiny bit', 'tiny bit', 'a teeny bit', 'teeny', 'one', '1'],
  2: ['a little bit', 'a little', 'a bit', 'kind of', 'two', '2'],
  3: ['quite a lot', 'pretty bad', 'three', '3'],
  4: ['a lot', 'really bad', 'so much', 'four', '4'],
  5: ['the worst', 'worst ever', 'worst', 'five', '5'],
};

const CHOICE_PHRASES: Record<string, readonly string[]> = {
  today: ['today', 'this morning', 'this afternoon', 'tonight', 'just now', 'earlier today'],
  'before today': ['before today', 'yesterday', 'last night', 'days ago', 'a few days', 'last week', 'a long time'],
  'not sure': ['not sure', 'dont know', 'dunno', 'no idea', 'idk'],
  normal: ['normal', 'regular'],
  runny: ['runny', 'diarrhea', 'diarrhoea', 'watery'],
  'not gone': ['not gone', 'havent gone', 'didnt go', 'havent pooped', 'didnt poop', 'no poop'],
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, none: 0, once: 1, one: 1, twice: 2, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Finds which values' phrases appear in `text`, longest phrases first; each match is blanked
 * out so "below my belly button" doesn't also count as "belly button". Returns the distinct
 * values found and what's left of the text.
 */
function scan<V>(text: string, table: [V, readonly string[]][]): { values: V[]; rest: string } {
  const pairs = table.flatMap(([v, ps]) => ps.map((p) => [v, norm(p)] as const));
  pairs.sort((a, b) => b[1].length - a[1].length);
  let rest = ` ${text} `;
  const values: V[] = [];
  for (const [v, p] of pairs) {
    if (!rest.includes(` ${p} `)) continue;
    rest = rest.split(` ${p} `).join(' · ');
    if (!values.includes(v)) values.push(v);
  }
  return { values, rest };
}

/** One clear value and no negation left over → that value; otherwise null. */
function single<V>(text: string, table: [V, readonly string[]][]): V | null {
  const { values, rest } = scan(text, table);
  return values.length === 1 && !NEGATION.test(rest) ? values[0]! : null;
}

function yesNo(text: string): SlotValue {
  const words = text.split(' ');
  if (/\b(not sure|dont know|dunno|no idea|idk|maybe)\b/.test(text)) return words.length <= 6 ? 'not_sure' : null;
  if (['i did', 'i have', 'i do', 'i am', 'it is', 'uh huh', 'mhm'].includes(text)) return 'yes';
  if (['i didnt', 'i havent', 'i dont', 'not really', 'im not', 'it isnt', 'uh uh'].includes(text)) return 'no';
  const first = words[0]!;
  const yes = ['yes', 'yeah', 'yep', 'yup', 'yea', 'ya'].includes(first);
  const no = ['no', 'nope', 'nah'].includes(first);
  if (yes === no) return null;
  // "yes … no" in one breath is unclear.
  const rest = words.slice(1).join(' ');
  if (yes && /\b(no|nope|nah)\b/.test(rest)) return null;
  if (no && /\b(yes|yeah|yep)\b/.test(rest)) return null;
  return yes ? 'yes' : 'no';
}

function count(text: string): SlotValue {
  if (/\b(lots|many|a lot|loads)\b/.test(text)) return null;
  const nums = text
    .split(' ')
    .map((w) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w]))
    .filter((n): n is number => n !== undefined);
  const distinct = [...new Set(nums)];
  return distinct.length === 1 ? distinct[0]! : null;
}

/** The answer plainly given in an English transcript, or null to ask Gemini / the child. */
export function quickAnswer(node: TreeNode, transcript: string, lang: Lang): SlotValue {
  if (lang !== 'en') return null;
  const text = norm(transcript);
  if (!text) return null;
  switch (node.answer_type) {
    case 'yes_no':
      return yesNo(text);
    case 'body_map': {
      const { values, rest } = scan(text, Object.entries(BODY_PHRASES));
      const vague = VAGUE_TUMMY.some((w) => rest.includes(` ${w} `));
      return values.length === 1 && !NEGATION.test(rest) && !(vague && !values[0]!.endsWith('tummy') && values[0] !== 'belly_button')
        ? values[0]!
        : null;
    }
    case 'faces':
      return single(text, Object.entries(FACE_PHRASES).map(([k, v]) => [Number(k), v] as [number, readonly string[]]));
    case 'number':
      return NEGATION.test(text) ? null : count(text);
    case 'choice': {
      const table = (node.options ?? []).map((o) => [o, [o, ...(CHOICE_PHRASES[o] ?? [])]] as [string, readonly string[]]);
      return single(text, table);
    }
    default:
      return null;
  }
}
