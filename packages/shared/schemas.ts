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
