import { InterpretationSchema, type Interpretation, type Lang, type TreeNode } from '@ralph/shared';
import { env } from '../env.js';
import { gemini, withinBudget } from './gemini.js';
import { allowedValuesText, interpretationPrompt } from './prompts.js';

const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  'zh-CN': 'Simplified Chinese',
};

/**
 * One spoken answer → Gemini's reading of it (Zod-validated; retried once on bad JSON, all within
 * TEXT_BUDGET_MS). null when Gemini is unavailable, slow, or returns junk — the caller then asks
 * the child to tap instead.
 */
export async function interpretTurn(p: {
  node: TreeNode;
  age: number;
  lang: Lang;
  transcript: string;
}): Promise<Interpretation | null> {
  if (!gemini || !env.GEMINI_MODEL) return null;
  const prompt = interpretationPrompt({
    age: p.age,
    language: LANG_NAMES[p.lang],
    question: p.node.ask,
    answerType: p.node.answer_type,
    allowed: allowedValuesText(p.node.answer_type, p.node.options, p.node.max),
    transcript: p.transcript,
  });

  const client = gemini;
  return withinBudget('interpret', async () => {
    const res = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    return parseJson(res.text);
  });
}

function parseJson(text: string | undefined): Interpretation | null {
  try {
    const parsed = InterpretationSchema.safeParse(JSON.parse(text ?? ''));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
