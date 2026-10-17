import { z } from 'zod';
import { SUPPORTED_LANGS } from './types';

export const LangSchema = z.enum(SUPPORTED_LANGS);

// ---------- Triage trees ----------

const NextRuleSchema = z.union([
  z.object({ if: z.record(z.string(), z.union([z.string(), z.number()])), goto: z.string() }),
  z.object({ default: z.string() }),
]);

export const TreeNodeSchema = z.object({
  ask: z.string(),
  answer_type: z.enum(['yes_no', 'choice', 'body_map', 'faces', 'number', 'free_speech']),
  slot: z.string(),
  options: z.array(z.string()).optional(),
  /** Empty or missing → end of tree. */
  next: z.array(NextRuleSchema).optional(),
});

export const TreeSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  start: z.string(),
  nodes: z.record(z.string(), TreeNodeSchema),
});

export type TreeNode = z.infer<typeof TreeNodeSchema>;
export type Tree = z.infer<typeof TreeSchema>;

// ---------- Per-turn Gemini interpretation (see triage-engine skill) ----------

export const InterpretationSchema = z.object({
  slot_value: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
  ralph_reply: z.string().max(200),
  extra_symptoms: z.array(z.string()),
  safeguarding_concern: z.boolean(),
  off_topic: z.boolean(),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

// ---------- API bodies ----------

export const CreateVisitBodySchema = z.object({
  first_name: z.string().min(1).max(60),
  age_years: z.number().min(0).max(18),
  weight_kg: z.number().positive().max(200).optional(),
  language: LangSchema.default('en'),
});
export type CreateVisitBody = z.infer<typeof CreateVisitBodySchema>;

// ---------- Games (Firefly Tap, Cyber Circuit) ----------

const HandSchema = z.enum(['dominant', 'non_dominant']);

/** One row per target / link → `game_events`. */
export const GameEventSchema = z.object({
  at_ms: z.number().nonnegative(),
  round: z.number().int().nonnegative(),
  phase: z.string().max(20).optional(),
  hand: HandSchema,
  reaction_ms: z.number().nonnegative().nullable(),
  hit: z.boolean(),
  accuracy_px: z.number().nonnegative().nullable().optional(),
  label: z.string().max(8).optional(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

const SummaryValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const GameResultSchema = z.object({
  game: z.enum(['firefly_tap', 'cyber_circuit']),
  handedness: z.enum(['left', 'right', 'unknown']),
  started_at: z.string().datetime(),
  events: z.array(GameEventSchema).max(500),
  /** Flat numbers for trends + baseline comparison (medianReactionMs, hitRate, …). */
  summary: z.record(z.string(), SummaryValue),
  /** Nurse-facing plain-language notes from motorObservations(). */
  observations: z.array(z.string().max(200)).max(20),
});
export type GameResult = z.infer<typeof GameResultSchema>;

// ---------- Check-ins ----------

export const CheckinBodySchema = z.object({
  feeling: z.enum(['better', 'same', 'worse', 'no_response']),
  pain_face: z.number().int().min(0).max(5).nullable().optional(),
  note: z.string().max(300).optional(),
  source: z.enum(['companion', 'game', 'timer']).default('companion'),
});
export type CheckinBody = z.infer<typeof CheckinBodySchema>;

// ---------- Companion chat ----------

export const CompanionTurnBodySchema = z.object({
  message: z.string().min(1).max(500),
  history: z
    .array(z.object({ speaker: z.enum(['ralph', 'child']), text: z.string().max(500) }))
    .max(30),
  first_name: z.string().max(60).default('friend'),
  age_years: z.number().min(0).max(18),
  language: LangSchema.default('en'),
  /** true when the child is answering a "how are you feeling now?" check-in */
  is_checkin_reply: z.boolean().default(false),
});
export type CompanionTurnBody = z.infer<typeof CompanionTurnBodySchema>;

/** Gemini response contract for one companion turn. Zod-validated; retry once, then fallback. */
export const CompanionAiSchema = z.object({
  ralph_reply: z.string().min(1).max(240),
  feeling: z.enum(['better', 'same', 'worse']).nullable(),
  pain_face: z.number().int().min(0).max(5).nullable(),
  new_symptoms: z.array(z.string().max(80)).max(10),
  safeguarding_concern: z.boolean(),
  child_wants_quiet: z.boolean(),
});
export type CompanionAi = z.infer<typeof CompanionAiSchema>;

/** What the kiosk receives. Never contains safeguarding or red-flag info. */
export interface CompanionTurnResponse {
  /** null → kiosk uses its offline fallback reply */
  reply: string | null;
  feeling: 'better' | 'same' | 'worse' | null;
  wants_quiet: boolean;
}

