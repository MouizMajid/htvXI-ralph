import { beforeAll, describe, expect, it } from 'vitest';
import i18next, { type TFunction } from 'i18next';
import type { StaffQueueItem, StaffTurn, StaffVisitDetail } from '@ralph/shared';
import en from '../i18n/en.json';
import { answersAtAGlance, conversation, newAlertIds, parentDetails, rowStripe } from './dashboard-data';

let t: TFunction;
beforeAll(async () => {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  t = i18n.t;
});

let nextId = 1;
const turn = (p: Partial<StaffTurn>): StaffTurn => ({
  id: nextId++,
  at: '2026-10-17T10:00:00Z',
  node_id: null,
  speaker: 'child',
  question: null,
  text_original: null,
  text_en: null,
  slot: null,
  slot_value: null,
  input: 'tap',
  ...p,
});

const detail = (turns: StaffTurn[], tree_id = 'tummy'): StaffVisitDetail => ({
  visit: {
    id: 'v1',
    first_name: 'Maya',
    age_years: 6,
    language: 'en',
    arrived_at: '2026-10-17T10:00:00Z',
    status: 'waiting',
    parent_mode: false,
    chief_complaint: 'tummy',
    tree_id,
    slots: {},
    parent_answers: {},
    parent_confirmed_at: null,
    called_in_at: null,
  },
  turns,
  checkins: [],
  alerts: [],
});

describe('answersAtAGlance', () => {
  it('formats taps in plain English and marks parent corrections', () => {
    const rows = answersAtAGlance(
      t,
      detail([
        turn({ node_id: 'where', question: 'Can you show me where your tummy hurts?', slot_value: 'lower_right_tummy' }),
        turn({ node_id: 'pain_face', question: 'Which face shows how much it hurts?', slot_value: 2 }),
        turn({ node_id: 'throw_up_count', question: 'How many times did you throw up?', slot_value: 5 }),
        turn({ node_id: 'pain_face', speaker: 'parent', question: 'Which face shows how much it hurts?', slot_value: 4 }),
      ]),
    );
    expect(rows).toEqual([
      { question: 'Can you show me where your tummy hurts?', answer: 'Lower-right tummy', original: null, editedByParent: false },
      { question: 'Which face shows how much it hurts?', answer: 'A lot (4/5)', original: null, editedByParent: true },
      { question: 'How many times did you throw up?', answer: '5 or more', original: null, editedByParent: false },
    ]);
  });

  it("shows the child's words in English with the original alongside, and skips", () => {
    const rows = answersAtAGlance(
      t,
      detail(
        [
          turn({ node_id: 'what_wrong', input: 'voice', text_original: 'मुझे बुखार है', text_en: 'I have a fever', slot_value: 'मुझे बुखार है' }),
          turn({ node_id: 'anything_else', input: 'skip' }),
        ],
        'general',
      ),
    );
    expect(rows.map((r) => [r.answer, r.original])).toEqual([
      ['“I have a fever”', 'मुझे बुखार है'],
      ['Skipped', null],
    ]);
  });

  it('leaves waiting-room chat out of the glance table', () => {
    expect(answersAtAGlance(t, detail([turn({ node_id: 'companion', input: 'text', text_en: 'I like dogs' })]))).toEqual([]);
  });
});

describe('conversation', () => {
  it('keeps answers and chat in order, labelled', () => {
    const items = conversation(
      t,
      detail([
        turn({ node_id: 'throw_up', question: 'Have you thrown up?', slot_value: 'yes' }),
        turn({ node_id: 'companion', input: 'text', text_original: 'me duele', text_en: 'it hurts' }),
        turn({ node_id: 'companion', speaker: 'ralph', text_original: 'I am sorry!' }),
      ]),
    );
    expect(items).toMatchObject([
      { kind: 'answer', question: 'Have you thrown up?', answer: 'Yes', by: 'child' },
      { kind: 'chat', by: 'child', text: 'it hurts', original: 'me duele' },
      { kind: 'chat', by: 'ralph', text: 'I am sorry!', original: null },
    ]);
  });
});

describe('parentDetails', () => {
  it('lists only what the parent filled in, in plain words', () => {
    expect(parentDetails({ onset: '1_2_days', max_temp_c: 39.4, rash: 'yes', notes: '' })).toEqual([
      { label: 'Started', value: '1–2 days ago' },
      { label: 'Highest temperature', value: '39.4 °C' },
      { label: 'Rash', value: 'Yes' },
    ]);
  });
});

describe('queue helpers', () => {
  const item = (alerts: StaffQueueItem['alerts']): StaffQueueItem => ({
    id: 'q',
    first_name: 'A',
    age_years: 5,
    language: 'en',
    arrived_at: '2026-10-17T10:00:00Z',
    status: 'waiting',
    parent_mode: false,
    chief_complaint: 'tummy',
    complaint_words_en: null,
    open_alerts: alerts.filter((a) => !a.acknowledged).length,
    alerts,
  });

  it('stripe shows the most serious open alert, and nothing once acknowledged', () => {
    expect(rowStripe(item([]))).toBe('bg-staff-line');
    expect(rowStripe(item([{ id: 1, kind: 'deterioration', reason: '', acknowledged: false }]))).toBe('bg-warning');
    expect(
      rowStripe(
        item([
          { id: 1, kind: 'deterioration', reason: '', acknowledged: false },
          { id: 2, kind: 'red_flag', reason: '', acknowledged: false },
        ]),
      ),
    ).toBe('bg-danger');
    expect(rowStripe(item([{ id: 3, kind: 'safeguarding', reason: '', acknowledged: false }]))).toBe('bg-safeguard');
    expect(rowStripe(item([{ id: 2, kind: 'red_flag', reason: '', acknowledged: true }]))).toBe('bg-staff-line');
  });

  it('finds alerts raised since the last poll', () => {
    const q = [item([{ id: 7, kind: 'red_flag', reason: '', acknowledged: false }, { id: 8, kind: 'deterioration', reason: '', acknowledged: false }])];
    expect(newAlertIds(q, new Set([7]))).toEqual([8]);
  });
});
