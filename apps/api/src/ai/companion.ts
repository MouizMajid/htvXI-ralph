import { CompanionAiSchema, type CompanionAi, type CompanionTurnBody } from '@ralph/shared';
import { env } from '../env.js';
import { gemini, withinBudget } from './gemini.js';
import { companionPersona } from './prompts.js';

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  'zh-CN': 'Simplified Chinese',
};

/**
 * One companion turn via Gemini. Returns null when Gemini isn't configured, fails, is slower
 * than TEXT_BUDGET_MS, or fails Zod twice — caller falls back to the deterministic reply.
 */
export async function companionReply(body: CompanionTurnBody): Promise<CompanionAi | null> {
  if (!gemini || !env.GEMINI_MODEL) return null;

  const contents = [
    // Ralph speaks first, but Gemini expects the conversation to open with a user turn.
    { role: 'user', parts: [{ text: '(The child sits down at the tablet.)' }] },
    ...body.history.slice(-12).map((h) => ({
      role: h.speaker === 'ralph' ? 'model' : 'user',
      parts: [{ text: h.text }],
    })),
    {
      role: 'user',
      parts: [
        {
          text: body.message,
        },
      ],
    },
  ];

  const client = gemini;
  return withinBudget('companion', async () => {
    const res = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: companionPersona(body.age_years, LANG_NAMES[body.language] ?? 'English', body.first_name),
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    });
    try {
      const parsed = CompanionAiSchema.safeParse(JSON.parse(res.text ?? ''));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  });
}
