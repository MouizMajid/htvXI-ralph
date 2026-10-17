import { z } from 'zod';

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default(''),
  GEMINI_STT_MODEL: z.string().default(''),
  GEMINI_TTS_MODEL: z.string().default(''),
  RALPH_VOICE: z.string().default(''),
  NURSE_VOICE: z.string().default(''),
  DATABASE_URL: z.string().default(''),
  PUBLIC_BASE_URL: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().int().default(3001),
  CHECKIN_INTERVAL_SEC: z.coerce.number().int().positive().default(120),
  DEMO_MODE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  SUPPORTED_LANGS: z
    .string()
    .default('en,hi,es,fr,zh-CN')
    .transform((v) => v.split(',').map((s) => s.trim())),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
