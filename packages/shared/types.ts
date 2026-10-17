export const SUPPORTED_LANGS = ['en', 'hi', 'es', 'fr', 'zh-CN'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export type AnswerType = 'yes_no' | 'choice' | 'body_map' | 'faces' | 'number' | 'free_speech';

export type VisitStatus = 'waiting' | 'in_room' | 'done';
export type ScoreBand = 'stable' | 'watch' | 'escalate';
export type Speaker = 'ralph' | 'child' | 'parent';
export type FlagKind = 'red_flag' | 'deterioration' | 'safeguarding' | 'unresponsive';
export type Feeling = 'better' | 'same' | 'worse' | 'no_response';
export type GameId = 'bubble_pop' | 'firefly' | 'ralph_says';

export type SlotValue = string | number | null;
export type SlotMap = Record<string, SlotValue>;

/** One deterministic finding, always with a human-readable reason. */
export interface Reason {
  points: number;
  alert: boolean;
  text: string;
}

/** Suggested triage level, 1 (most urgent) … 5. Always "nurse to confirm". */
export type SuggestedLevel = 1 | 2 | 3 | 4 | 5;

/** Children under this age use parent mode (no games, limited signals). */
export const PARENT_MODE_MAX_AGE = 4;
