import { GoogleGenAI } from '@google/genai';
import { env } from '../env.js';

/**
 * null until GEMINI_API_KEY is set; callers must fall back (tap options / browser voice).
 * No automatic retries: the SDK default (5 attempts, up to 60 s backoff) would stall a kiosk
 * request for minutes on a quota error. Our callers retry once themselves or fall back.
 */
export const gemini = env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { retryOptions: { attempts: 1 } } })
  : null;
