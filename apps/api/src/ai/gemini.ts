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

/**
 * Time budget for one interpretation or chat reply, retries included. An overloaded model once
 * took 43 s to answer; a child shouldn't wait that long, so we give up and fall back.
 */
export const TEXT_BUDGET_MS = 8_000;

/** Rejects if `p` takes longer than `ms`. */
export function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs `once` until it returns a value, within TEXT_BUDGET_MS. Retries only when the model
 * answered with unusable JSON (null); an API error (quota, overload, timeout) ends it at once,
 * since retrying those just burns quota and time.
 */
export async function withinBudget<T>(what: string, once: (msLeft: number) => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + TEXT_BUDGET_MS;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const msLeft = deadline - Date.now();
    if (msLeft < 500) break;
    try {
      const result = await within(once(msLeft), msLeft, what);
      if (result !== null) return result;
      console.warn(`${what}: attempt ${attempt} returned unusable JSON`);
    } catch (err) {
      console.warn(`${what}: attempt ${attempt} failed:`, (err as Error).message.slice(0, 200));
      break;
    }
  }
  return null;
}
