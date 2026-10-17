import { GoogleGenAI } from '@google/genai';
import { env } from '../env';

/** null until GEMINI_API_KEY is set; callers must fall back (tap options / speechSynthesis). */
export const gemini = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

// TODO(Tier 1 #3/#4): transcribe(), interpret(), tts() — check current SDK call shape first.
