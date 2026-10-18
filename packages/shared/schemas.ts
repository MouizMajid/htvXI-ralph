import { z } from 'zod';
import { BODY_REGIONS, COMPLAINTS, FACE_MAX, SUPPORTED_LANGS, YES_NO } from './types.js';

export const LangSchema = z.enum(SUPPORTED_LANGS);
export const ComplaintSchema = z.enum(COMPLAINTS);
export const YesNoSchema = z.enum(YES_NO);
export const BodyRegionSchema = z.enum(Object.keys(BODY_REGIONS) as [keyof typeof BODY_REGIONS]);
export const FaceSchema = z.number().int().min(0).max(FACE_MAX);

// ---------- Question trees ----------

const NextRuleSchema = z.union([
  z.object({ if: z.record(z.string(), z.union([z.string(), z.number()])), goto: z.string() }),
  z.object({ default: z.string() }),
]);

export const TreeNodeSchema = z.object({
  ask: z.string(),
  answer_type: z.enum(['yes_no', 'choice', 'body_map', 'faces', 'number', 'free_speech']),
  slot: z.string(),
  /** Required for `choice`. */
  options: z.array(z.string()).optional(),
  /** For `number`: tap buttons 1…max, where max means "max or more". */
  max: z.number().int().positive().optional(),
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

// ---------- Parent-only answers (parent confirm screen) ----------

export const ParentAnswersSchema = z.object({
  onset: z.enum(['today', '1_2_days', 'more_than_2_days', 'not_sure']).optional(),
  max_temp_c: z.number().min(30).max(45).optional(),
  meds_given: z.string().max(300).optional(),
  keeps_fluids_down: YesNoSchema.optional(),
  /** Peed in the last 8 hours? */
  peed_recently: YesNoSchema.optional(),
  /** Unusually sleepy or hard to wake? */
  very_sleepy: YesNoSchema.optional(),
  rash: YesNoSchema.optional(),
  conditions: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
});
export type ParentAnswers = z.infer<typeof ParentAnswersSchema>;

// ---------- Check-ins ----------

export const CheckinSchema = z.object({
  at: z.coerce.date(),
  feeling: z.enum(['better', 'same', 'worse', 'no_response']),
  pain_face: FaceSchema.nullable().optional(),
  /** Anything the child said at the check-in, in English (voice check-ins, slice 6+). */
  note_en: z.string().max(500).nullable().optional(),
});
export type Checkin = z.infer<typeof CheckinSchema>;

// ---------- Per-turn Gemini interpretation (see triage-engine skill) ----------

export const InterpretationSchema = z.object({
  slot_value: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
  ralph_reply: z.string().max(200),
  text_en: z.string().max(1000),
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

// ---------- Companion chat (waiting room) ----------

export const CompanionTurnBodySchema = z.object({
  message: z.string().min(1).max(500),
  /** How the message came in: typed, or the browser's speech-to-text. */
  input: z.enum(['text', 'voice']).default('text'),
  history: z
    .array(z.object({ speaker: z.enum(['ralph', 'child']), text: z.string().max(500) }))
    .max(30),
  first_name: z.string().max(60).default('friend'),
  age_years: z.number().min(0).max(18),
  language: LangSchema.default('en'),
});
export type CompanionTurnBody = z.infer<typeof CompanionTurnBodySchema>;

/**
 * Gemini response contract for one companion turn (Zod-validated; retry once, then the
 * offline fallback). Gemini writes words and translates; it never reports how the child feels.
 */
export const CompanionAiSchema = z.object({
  ralph_reply: z.string().min(1).max(240),
  /** The child's message translated to English for the nurse (same text if already English). */
  text_en: z.string().max(1000),
  safeguarding_concern: z.boolean(),
  child_wants_quiet: z.boolean(),
});
export type CompanionAi = z.infer<typeof CompanionAiSchema>;

/** What the kiosk receives. Never contains alert or safeguarding details. */
export interface CompanionTurnResponse {
  /** null → kiosk uses its offline fallback reply */
  reply: string | null;
  wants_quiet: boolean;
  /** The message sounded like "I feel worse" (keyword match) → show the tap check-in. */
  offer_checkin: boolean;
}
