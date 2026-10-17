import type { Alert, Complaint, SlotMap } from '../types.js';
import type { Checkin, ParentAnswers } from '../schemas.js';
import { findPhrase } from './text.js';

/*
 * Team-defined DEMO alert rules — NOT clinically validated.
 * Pure functions. They raise plain-language heads-ups for the nurse; they never
 * diagnose, score, or set a priority. The nurse triages.
 */

export const RULES = {
  /** Vomiting this many times (or more) + not keeping fluids down → red flag. */
  VOMIT_MANY: 4,
  FEVER_C: 38,
  HIGH_TEMP_C: 40,
  /** Fever under this age (years) → red flag. */
  YOUNG_FEVER_AGE: 0.25,
  /** Pain face rising by at least this much from the first report → getting worse. */
  PAIN_RISE: 2,
  WORST_FACE: 5,
} as const;

/** English phrases (matched on `text_en`) that mean trouble breathing. */
export const BREATHING_PHRASES = [
  "can't breathe",
  'cant breathe',
  'cannot breathe',
  'hard to breathe',
  'trouble breathing',
  'breathing is hard',
  "can't catch my breath",
  'short of breath',
  'out of breath',
];

export interface AlertInput {
  age_years: number;
  complaint: Complaint | null;
  slots: SlotMap;
  parent?: ParentAnswers;
  /** Oldest first. */
  checkins: Checkin[];
  /** The child's free-speech answers in English (tree answers + extra symptoms). */
  child_texts_en?: string[];
}

export function evaluateAlerts(input: AlertInput): Alert[] {
  return [...redFlags(input), ...gettingWorse(input), ...notResponding(input)];
}

function redFlags({ age_years, complaint, slots, parent, checkins, child_texts_en = [] }: AlertInput): Alert[] {
  const out: Alert[] = [];
  const red = (key: string, reason: string) => out.push({ kind: 'red_flag', key: `red:${key}`, reason });

  if (complaint === 'breathing') red('breathing_complaint', 'Came in for trouble breathing');
  if (slots.hard_to_breathe === 'yes') red('hard_to_breathe', "Says it's hard to breathe right now");
  const breathingWords = child_texts_en.map((t) => findPhrase(t, BREATHING_PHRASES, 'en')).find(Boolean);
  if (breathingWords) red('breathing_words', `Said "${breathingWords}"`);

  const faces = [slots.pain_face, ...checkins.map((c) => c.pain_face)];
  if (faces.some((f) => f === RULES.WORST_FACE)) red('worst_pain', 'Picked the worst pain face (5 of 5)');

  const vomits = typeof slots.vomit_count === 'number' ? slots.vomit_count : 0;
  const noFluids = slots.keeps_drinks === 'no' || parent?.keeps_fluids_down === 'no';
  if (vomits >= RULES.VOMIT_MANY && noFluids) {
    red('vomit_no_fluids', `Threw up ${vomits}${vomits >= 5 ? '+' : ''} times and can't keep drinks down`);
  }
  if (parent?.peed_recently === 'no') red('no_pee', 'Parent says no pee in the last 8 hours');
  if (parent?.very_sleepy === 'yes') red('very_sleepy', 'Parent says unusually sleepy or hard to wake');

  const temp = parent?.max_temp_c;
  if (temp !== undefined && temp >= RULES.HIGH_TEMP_C) red('high_temp', `Highest temperature ${temp} °C`);
  if (temp !== undefined && temp >= RULES.FEVER_C && age_years < RULES.YOUNG_FEVER_AGE) {
    red('young_fever', `Fever (${temp} °C) in a baby under 3 months`);
  }
  const fever = (temp !== undefined && temp >= RULES.FEVER_C) || slots.feels_hot === 'yes';
  if (parent?.rash === 'yes' && fever) red('rash_fever', 'Rash together with fever');

  return out;
}

function gettingWorse({ slots, checkins }: AlertInput): Alert[] {
  const out: Alert[] = [];

  // Pain trend: compare the latest face with the first one reported (tree answer, else first check-in).
  const checkinFaces = checkins.map((c) => c.pain_face).filter((f): f is number => typeof f === 'number');
  const first = typeof slots.pain_face === 'number' ? slots.pain_face : checkinFaces[0];
  const latest = checkinFaces.at(-1);
  if (first !== undefined && latest !== undefined && latest - first >= RULES.PAIN_RISE) {
    // Key includes the new value so a further rise (2→4→5) raises a fresh alert.
    out.push({ kind: 'deterioration', key: `det:pain_up:${latest}`, reason: `Pain went from ${first} → ${latest}` });
  }

  const [prev, last] = checkins.slice(-2);
  if (prev?.feeling === 'worse' && last?.feeling === 'worse') {
    out.push({ kind: 'deterioration', key: 'det:worse_twice', reason: 'Said they feel worse at 2 check-ins in a row' });
  }

  const newBreathing = checkins.map((c) => c.note_en && findPhrase(c.note_en, BREATHING_PHRASES, 'en')).find(Boolean);
  if (newBreathing) {
    out.push({ kind: 'deterioration', key: 'det:new_breathing', reason: `New at check-in: said "${newBreathing}"` });
  }
  return out;
}

function notResponding({ checkins }: AlertInput): Alert[] {
  const [prev, last] = checkins.slice(-2);
  return prev?.feeling === 'no_response' && last?.feeling === 'no_response'
    ? [{ kind: 'unresponsive', key: 'unresp:2', reason: "Didn't answer Ralph's last 2 check-ins" }]
    : [];
}
