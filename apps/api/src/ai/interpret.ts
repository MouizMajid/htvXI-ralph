import { InterpretationSchema, type Interpretation, type Lang, type TreeNode } from '@ralph/shared';
import { env } from '../env.js';
import { gemini } from './gemini.js';
import { allowedValuesText, interpretationPrompt } from './prompts.js';

const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  'zh-CN': 'Simplified Chinese',
};

/**
 * One spoken answer → Gemini's reading of it (Zod-validated; retry once). null when Gemini is
 * unavailable or returns junk twice — the caller then asks the child to tap instead.
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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await gemini.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: { temperature: 0.2, responseMimeType: 'application/json' },
      });
      const parsed = InterpretationSchema.safeParse(JSON.parse(res.text ?? ''));
      if (parsed.success) return parsed.data;
      console.warn('interpret: invalid JSON shape:', parsed.error.issues[0]?.message);
    } catch (err) {
      console.warn(`interpret: attempt ${attempt + 1} failed:`, (err as Error).message.slice(0, 200));
    }
  }
  return null;
}
