export const SUPPORTED_LANGS = ['en', 'hi', 'es', 'fr', 'zh-CN'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export type AnswerType = 'yes_no' | 'choice' | 'body_map' | 'faces' | 'number' | 'free_speech';

export type VisitStatus = 'waiting' | 'in_room' | 'done';
export type Speaker = 'ralph' | 'child' | 'parent';
export type Feeling = 'better' | 'same' | 'worse' | 'no_response';

/** What the child picks on the first screen. */
export const COMPLAINTS = ['tummy', 'fever', 'breathing', 'other'] as const;
export type Complaint = (typeof COMPLAINTS)[number];

export const YES_NO = ['yes', 'no', 'not_sure'] as const;
export type YesNo = (typeof YES_NO)[number];

/** Body-map hotspots. The kiosk draws these as SVG regions over body-front/back.png. */
export const BODY_REGIONS = {
  head: 'Head',
  throat: 'Throat',
  chest: 'Chest',
  upper_tummy: 'Upper tummy',
  belly_button: 'Around belly button',
  lower_left_tummy: 'Lower-left tummy',
  lower_middle_tummy: 'Lower-middle tummy',
  lower_right_tummy: 'Lower-right tummy',
  back: 'Back',
  arms: 'Arms',
  legs: 'Legs',
  all_over: 'All over',
} as const;
export type BodyRegion = keyof typeof BODY_REGIONS;

/** Faces scale 0 (no hurt) … 5 (worst hurt). Team-drawn faces, not Wong-Baker. */
export const FACE_MAX = 5;

export type SlotValue = string | number | null;
export type SlotMap = Record<string, SlotValue>;

export type AlertKind = 'red_flag' | 'deterioration' | 'unresponsive' | 'safeguarding';

/**
 * A plain-language heads-up for the nurse. Never a diagnosis or a priority level.
 * `key` is stable for the same underlying finding so the API can avoid duplicates.
 */
export interface Alert {
  kind: AlertKind;
  key: string;
  reason: string;
}

/** What the kiosk needs to render one question (API → kiosk). Never includes alerts. */
export interface NodeView {
  /** Tree id — with `id`, the key for the translated question text. */
  tree: string;
  id: string;
  /** English source text (fallback when no translation exists). */
  ask: string;
  answer_type: AnswerType;
  options?: string[];
  max?: number;
}

/** Which fixed line Ralph says after an answer; the kiosk maps it to translated text + audio. */
export type ReplyKey = 'thanks' | 'safeguarding_reply';

/** Children under this age use parent mode (parent answers, no games). */
export const PARENT_MODE_MAX_AGE = 4;
