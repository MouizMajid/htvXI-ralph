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
export type ReplyKey = 'thanks' | 'safeguarding_reply' | 'try_tapping';

/** Result of a spoken answer (POST /visits/:id/turns/audio). Never includes alerts. */
export interface SpokenAnswerResponse {
  /** What we heard (transcript), shown to the child. null if nothing usable was heard. */
  heard: string | null;
  /** true → saved like a tap and the tree moved on; false → ask the child to tap. */
  accepted: boolean;
  /** The validated answer that was saved (accepted only). */
  value: SlotValue;
  /** Next question (accepted), or the same question again (not accepted). */
  next: NodeView | null;
  reply: ReplyKey;
  /** Ralph's own short reaction in the child's language (accepted voice answers only). */
  line: string | null;
}

/** Who is signed in to the staff dashboard (badge + PIN sign-in). */
export interface StaffSession {
  badge: string;
  name: string;
}

// ---------- Staff dashboard responses (GET /api/staff/queue, /api/staff/visits/:id) ----------

export interface StaffQueueAlert {
  id: number;
  kind: AlertKind;
  reason: string;
  acknowledged: boolean;
}

export interface StaffQueueItem {
  id: string;
  first_name: string;
  age_years: number;
  language: Lang;
  arrived_at: string;
  status: VisitStatus;
  parent_mode: boolean;
  chief_complaint: Complaint | null;
  /** The child's first words (typed/spoken), in English. */
  complaint_words_en: string | null;
  open_alerts: number;
  alerts: StaffQueueAlert[];
}

export interface StaffTurn {
  id: number;
  at: string;
  /** Tree question id, or 'companion' for waiting-room chat. */
  node_id: string | null;
  speaker: Speaker;
  question: string | null;
  text_original: string | null;
  text_en: string | null;
  slot: string | null;
  slot_value: SlotValue;
  input: 'tap' | 'voice' | 'text' | 'skip' | null;
}

export interface StaffAlert {
  id: number;
  at: string;
  kind: AlertKind;
  key: string;
  reason: string;
  acknowledged_at: string | null;
}

export interface StaffVisitDetail {
  visit: {
    id: string;
    first_name: string;
    age_years: number;
    language: Lang;
    arrived_at: string;
    status: VisitStatus;
    parent_mode: boolean;
    chief_complaint: Complaint | null;
    tree_id: string | null;
    slots: SlotMap;
    parent_answers: Record<string, unknown>;
    parent_confirmed_at: string | null;
    called_in_at: string | null;
  };
  turns: StaffTurn[];
  checkins: { at: string; feeling: Feeling; pain_face: number | null; note_en?: string | null }[];
  alerts: StaffAlert[];
}

/** Children under this age use parent mode (parent answers, no games). */
export const PARENT_MODE_MAX_AGE = 4;
