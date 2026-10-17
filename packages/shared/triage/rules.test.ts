import { describe, expect, it } from 'vitest';
import type { Checkin } from '../schemas.js';
import { evaluateAlerts, type AlertInput } from './rules.js';
import { MAYA } from './fixtures/maya.js';

const at = (min: number) => new Date(Date.UTC(2026, 9, 17, 10, min));
const base: AlertInput = { age_years: 7, complaint: 'tummy', slots: {}, checkins: [] };
const keys = (input: Partial<AlertInput>) => evaluateAlerts({ ...base, ...input }).map((a) => a.key);

describe('Maya (demo scenario)', () => {
  const maya = { age_years: MAYA.age_years, complaint: MAYA.complaint, slots: MAYA.slots, parent: MAYA.parent };

  it('has no alerts on arrival', () => {
    expect(evaluateAlerts({ ...maya, checkins: [], child_texts_en: [MAYA.slots.anything_else] })).toEqual([]);
  });

  it('gets "pain 2 → 4" and "worse twice" after her check-ins', () => {
    const alerts = evaluateAlerts({ ...maya, checkins: MAYA.checkinsGettingWorse });
    expect(alerts).toEqual([
      { kind: 'deterioration', key: 'det:pain_up:4', reason: 'Pain went from 2 → 4' },
      { kind: 'deterioration', key: 'det:worse_twice', reason: 'Said they feel worse at 2 check-ins in a row' },
    ]);
  });

  it('is deterministic (same input → same keys)', () => {
    const input = { ...maya, checkins: MAYA.checkinsGettingWorse };
    expect(evaluateAlerts(input)).toEqual(evaluateAlerts(input));
  });
});

describe('red flags', () => {
  it('breathing', () => {
    expect(keys({ complaint: 'breathing' })).toContain('red:breathing_complaint');
    expect(keys({ slots: { hard_to_breathe: 'yes' } })).toContain('red:hard_to_breathe');
    expect(keys({ child_texts_en: ["I can't breathe good"] })).toContain('red:breathing_words');
    expect(keys({ child_texts_en: ['I breathe fine'] })).toEqual([]);
  });

  it('worst pain face, from the tree or a check-in', () => {
    expect(keys({ slots: { pain_face: 5 } })).toEqual(['red:worst_pain']);
    expect(keys({ checkins: [{ at: at(0), feeling: 'same', pain_face: 5 }] })).toContain('red:worst_pain');
    expect(keys({ slots: { pain_face: 4 } })).toEqual([]);
  });

  it('lots of vomiting only with no fluids kept down', () => {
    expect(keys({ slots: { vomit_count: 5, keeps_drinks: 'no' } })).toEqual(['red:vomit_no_fluids']);
    expect(keys({ slots: { vomit_count: 5 }, parent: { keeps_fluids_down: 'no' } })).toEqual(['red:vomit_no_fluids']);
    expect(keys({ slots: { vomit_count: 5, keeps_drinks: 'yes' } })).toEqual([]);
    expect(keys({ slots: { vomit_count: 3, keeps_drinks: 'no' } })).toEqual([]);
  });

  it('parent-reported dehydration and sleepiness', () => {
    expect(keys({ parent: { peed_recently: 'no' } })).toEqual(['red:no_pee']);
    expect(keys({ parent: { very_sleepy: 'yes' } })).toEqual(['red:very_sleepy']);
    expect(keys({ parent: { peed_recently: 'not_sure', very_sleepy: 'no' } })).toEqual([]);
  });

  it('temperature rules', () => {
    expect(keys({ parent: { max_temp_c: 40.2 } })).toEqual(['red:high_temp']);
    expect(keys({ parent: { max_temp_c: 38.5 } })).toEqual([]);
    expect(keys({ age_years: 0.1, parent: { max_temp_c: 38.2 } })).toEqual(['red:young_fever']);
  });

  it('rash with fever (measured or child feels hot), not rash alone', () => {
    expect(keys({ parent: { rash: 'yes', max_temp_c: 38.5 } })).toEqual(['red:rash_fever']);
    expect(keys({ slots: { feels_hot: 'yes' }, parent: { rash: 'yes' } })).toEqual(['red:rash_fever']);
    expect(keys({ parent: { rash: 'yes' } })).toEqual([]);
  });
});

describe('getting worse', () => {
  const ci = (feeling: Checkin['feeling'], pain_face?: number, note_en?: string): Checkin => ({
    at: at(0),
    feeling,
    pain_face,
    note_en,
  });

  it('pain rise is measured from the first report, and a further rise gets a new key', () => {
    expect(keys({ slots: { pain_face: 1 }, checkins: [ci('same', 2)] })).toEqual([]);
    expect(keys({ slots: { pain_face: 1 }, checkins: [ci('same', 3)] })).toEqual(['det:pain_up:3']);
    expect(keys({ slots: { pain_face: 1 }, checkins: [ci('same', 3), ci('same', 4)] })).toEqual(['det:pain_up:4']);
  });

  it('uses the first check-in as baseline when the tree had no face', () => {
    expect(keys({ checkins: [ci('same', 1), ci('same', 3)] })).toEqual(['det:pain_up:3']);
  });

  it('"worse" only counts at two check-ins in a row', () => {
    expect(keys({ checkins: [ci('worse'), ci('same'), ci('worse')] })).toEqual([]);
    expect(keys({ checkins: [ci('same'), ci('worse'), ci('worse')] })).toEqual(['det:worse_twice']);
  });

  it('new breathing words at a check-in', () => {
    expect(keys({ checkins: [ci('worse', undefined, "it's hard to breathe")] })).toEqual(['det:new_breathing']);
  });
});

describe('not responding', () => {
  it('fires only after the last two check-ins go unanswered', () => {
    const nr = (min: number): Checkin => ({ at: at(min), feeling: 'no_response' });
    expect(keys({ checkins: [nr(0)] })).toEqual([]);
    expect(keys({ checkins: [nr(0), nr(15)] })).toEqual(['unresp:2']);
    expect(keys({ checkins: [nr(0), nr(15), { at: at(30), feeling: 'same' }] })).toEqual([]);
  });
});
