import type { Checkin, ParentAnswers } from '../../schemas.js';
import type { SlotMap } from '../../types.js';

/** Maya, 6, tummy — the demo star (docs/pitch.md). Synthetic. Reused by API tests + seed. */
export const MAYA = {
  first_name: 'Maya',
  age_years: 6,
  language: 'en' as const,
  complaint: 'tummy' as const,
  /** Answers along her path through the tummy tree, in order. */
  answers: [
    ['where', 'lower_middle_tummy'],
    ['pain_face', 2],
    ['how_long', 'today'],
    ['throw_up', 'yes'],
    ['throw_up_count', 2],
    ['drink', 'yes'],
    ['poop', 'normal'],
    ['hot', 'no'],
    ['anything_else', 'it hurts really bad and I threw up'],
  ] as const,
  slots: {
    pain_location: 'lower_middle_tummy',
    pain_face: 2,
    onset_child: 'today',
    vomiting: 'yes',
    vomit_count: 2,
    keeps_drinks: 'yes',
    poop: 'normal',
    feels_hot: 'no',
    anything_else: 'it hurts really bad and I threw up',
  } satisfies SlotMap,
  parent: { onset: 'today', keeps_fluids_down: 'yes', peed_recently: 'yes', notes: 'Started this morning, no fever.' } satisfies ParentAnswers,
  /** 40 minutes in: she says "worse" twice and her face goes 2 → 4. */
  checkinsGettingWorse: [
    { at: new Date('2026-10-17T10:15:00Z'), feeling: 'same', pain_face: 2 },
    { at: new Date('2026-10-17T10:30:00Z'), feeling: 'worse', pain_face: 3 },
    { at: new Date('2026-10-17T10:45:00Z'), feeling: 'worse', pain_face: 4 },
  ] satisfies Checkin[],
};
