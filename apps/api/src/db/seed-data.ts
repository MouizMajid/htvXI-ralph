// Synthetic background kids for the waiting room (all fictional). Maya is NOT here — she checks in
// live during the demo. Each kid goes through the real engine, so alerts come from the real rules.
import type { Complaint, Feeling, Lang, ParentAnswers } from '@ralph/shared';

export interface SeedAnswer {
  node_id: string;
  value?: unknown;
  skip?: boolean;
  /** Spoken answer in the child's language + English (for free-speech questions). */
  said?: { original: string; en: string };
}

export interface SeedKid {
  first_name: string;
  age_years: number;
  language: Lang;
  complaint: Complaint;
  /** How long ago they arrived. */
  arrived_min_ago: number;
  answers: SeedAnswer[];
  parent: ParentAnswers;
  /** Minutes after arrival. */
  checkins: { after_min: number; feeling: Feeling; pain_face?: number }[];
}

export const SEED_KIDS: SeedKid[] = [
  {
    first_name: 'Wei',
    age_years: 11,
    language: 'zh-CN',
    complaint: 'other',
    arrived_min_ago: 70,
    answers: [
      { node_id: 'what_wrong', said: { original: '我摔倒了，手腕很疼', en: 'I fell and my wrist really hurts' } },
      { node_id: 'where', value: 'arms' },
      { node_id: 'pain_face', value: 3 },
      { node_id: 'how_long', value: 'today' },
      { node_id: 'hot', value: 'no' },
      { node_id: 'breathing', value: 'no' },
      { node_id: 'anything_else', skip: true },
    ],
    parent: { onset: 'today', meds_given: "Children's ibuprofen at 9 am", peed_recently: 'yes' },
    checkins: [
      { after_min: 20, feeling: 'same', pain_face: 3 },
      { after_min: 40, feeling: 'better', pain_face: 2 },
      { after_min: 60, feeling: 'same', pain_face: 2 },
    ],
  },
  {
    first_name: 'Liam',
    age_years: 9,
    language: 'en',
    complaint: 'other',
    arrived_min_ago: 55,
    answers: [
      { node_id: 'what_wrong', said: { original: "my ear really hurts and it's ringing", en: "my ear really hurts and it's ringing" } },
      { node_id: 'where', value: 'head' },
      { node_id: 'pain_face', value: 3 },
      { node_id: 'how_long', value: 'before today' },
      { node_id: 'hot', value: 'yes' },
      { node_id: 'breathing', value: 'no' },
      { node_id: 'anything_else', said: { original: "I couldn't sleep last night", en: "I couldn't sleep last night" } },
    ],
    parent: { onset: '1_2_days', max_temp_c: 38.3, peed_recently: 'yes' },
    checkins: [
      { after_min: 20, feeling: 'same', pain_face: 3 },
      { after_min: 40, feeling: 'same', pain_face: 3 },
    ],
  },
  {
    first_name: 'Priya',
    age_years: 7,
    language: 'hi',
    complaint: 'fever',
    arrived_min_ago: 40,
    answers: [
      {
        node_id: 'what_wrong',
        said: { original: 'मुझे बहुत बुखार है और सिर में दर्द है', en: 'I have a really high fever and my head hurts' },
      },
      { node_id: 'where', value: 'head' },
      { node_id: 'pain_face', value: 3 },
      { node_id: 'how_long', value: 'today' },
      { node_id: 'hot', value: 'yes' },
      { node_id: 'breathing', value: 'no' },
      { node_id: 'anything_else', said: { original: 'मेरे पैरों पर लाल दाने हैं', en: 'There are red spots on my legs' } },
    ],
    parent: { onset: 'today', max_temp_c: 39.4, rash: 'yes', peed_recently: 'yes' },
    checkins: [{ after_min: 20, feeling: 'same', pain_face: 3 }],
  },
  {
    first_name: 'Mateo',
    age_years: 5,
    language: 'es',
    complaint: 'tummy',
    arrived_min_ago: 30,
    answers: [
      { node_id: 'where', value: 'belly_button' },
      { node_id: 'pain_face', value: 3 },
      { node_id: 'how_long', value: 'today' },
      { node_id: 'throw_up', value: 'yes' },
      { node_id: 'throw_up_count', value: 5 },
      { node_id: 'drink', value: 'no' },
      { node_id: 'poop', value: 'runny' },
      { node_id: 'hot', value: 'no' },
      { node_id: 'anything_else', said: { original: 'me duele mucho la panza', en: 'my tummy hurts a lot' } },
    ],
    parent: { onset: 'today', keeps_fluids_down: 'no', peed_recently: 'not_sure' },
    checkins: [{ after_min: 15, feeling: 'same', pain_face: 3 }],
  },
  {
    first_name: 'Ava',
    age_years: 2.5,
    language: 'en',
    complaint: 'fever',
    arrived_min_ago: 20,
    answers: [
      {
        node_id: 'what_wrong',
        said: {
          original: "She's had a fever since last night and isn't eating much",
          en: "She's had a fever since last night and isn't eating much",
        },
      },
      { node_id: 'where', value: 'all_over' },
      { node_id: 'pain_face', value: 2 },
      { node_id: 'how_long', value: 'before today' },
      { node_id: 'hot', value: 'yes' },
      { node_id: 'breathing', value: 'no' },
      { node_id: 'anything_else', skip: true },
    ],
    parent: { onset: '1_2_days', max_temp_c: 38.6, meds_given: 'Acetaminophen 4 hours ago', peed_recently: 'yes' },
    checkins: [],
  },
  {
    first_name: 'Chloé',
    age_years: 10,
    language: 'fr',
    complaint: 'breathing',
    arrived_min_ago: 8,
    answers: [
      {
        node_id: 'what_wrong',
        said: { original: "j'ai du mal à respirer et je tousse beaucoup", en: "it's hard to breathe and I'm coughing a lot" },
      },
      { node_id: 'where', value: 'chest' },
      { node_id: 'pain_face', value: 3 },
      { node_id: 'how_long', value: 'today' },
      { node_id: 'hot', value: 'no' },
      { node_id: 'breathing', value: 'yes' },
      { node_id: 'anything_else', skip: true },
    ],
    parent: { onset: 'today', conditions: 'Asthma', meds_given: 'Two puffs of her blue inhaler 30 min ago' },
    checkins: [],
  },
];
