// Ralph's voice (Gemini TTS) and ears (Gemini Transcribe), via the Interactions API.
// Both return null on any failure — callers fall back (browser voice / tap buttons).
import { createHash } from 'node:crypto';
import type { Lang } from '@ralph/shared';
import { env } from '../env.js';
import { gemini } from './gemini.js';

/** How Ralph sounds. Part of the cache key, so changing it regenerates clips. */
export const RALPH_STYLE =
  'a warm, playful, gentle raccoon friend talking slowly and kindly to a young child in a hospital waiting room';

const TTS_TIMEOUT_MS = 25_000;
const STT_TIMEOUT_MS = 20_000;

/** Kid words that help transcription (custom vocabulary biasing). */
const KID_VOCABULARY = [
  'tummy', 'throw up', 'threw up', 'poop', 'pee', 'ouchie', 'fever', 'cough', 'breathe',
  'dizzy', 'itchy', 'belly button', 'Ralph',
];

/** Transcription language hints. Hindi is left to auto-detect: Hindi-English mixing is common. */
const TRANSCRIBE_LANGS: Record<Lang, string[]> = {
  en: ['en-US'],
  hi: [],
  es: ['es-US'],
  fr: ['fr-FR'],
  'zh-CN': ['cmn-Hans-CN'],
};

function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);
}

const voiceName = () => env.RALPH_VOICE || 'Achird';

/**
 * Cache key for a spoken line. Language isn't included: the TTS model detects it from the
 * text, so the same words always sound the same.
 */
export function ttsHash(text: string): string {
  return createHash('sha256').update([env.GEMINI_TTS_MODEL, voiceName(), RALPH_STYLE, text].join('|')).digest('hex');
}

export const ttsAvailable = () => Boolean(gemini && env.GEMINI_TTS_MODEL);

/** Ralph says `text`. Returns WAV bytes (24 kHz mono 16-bit), or null. */
export async function synthesize(text: string): Promise<Buffer | null> {
  if (!gemini || !env.GEMINI_TTS_MODEL) return null;
  try {
    const res = await within(
      gemini.interactions.create({
        model: env.GEMINI_TTS_MODEL,
        input: [
          {
            type: 'user_input',
            content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: RALPH_STYLE }] }],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: voiceName() }] },
      }, { retries: { strategy: 'none' }, timeout_ms: TTS_TIMEOUT_MS }),
      TTS_TIMEOUT_MS,
      'TTS',
    );
    const data = res.output_audio?.data;
    return data ? Buffer.from(data, 'base64') : null;
  } catch (err) {
    console.warn('voice: TTS failed:', (err as Error).message.slice(0, 200));
    return null;
  }
}

/** What the child said in `audio` (WAV / WebM / OGG …), or null if nothing usable came back. */
export async function transcribe(audio: Buffer, mimeType: string, lang: Lang): Promise<string | null> {
  if (!gemini || !env.GEMINI_STT_MODEL) return null;
  try {
    const res = await within(
      gemini.interactions.create({
        model: env.GEMINI_STT_MODEL,
        input: [{ type: 'audio', data: audio.toString('base64'), mime_type: mimeType }],
        generation_config: {
          transcription_config: { language_codes: TRANSCRIBE_LANGS[lang], custom_vocabulary: KID_VOCABULARY },
        },
      }, { retries: { strategy: 'none' }, timeout_ms: STT_TIMEOUT_MS }),
      STT_TIMEOUT_MS,
      'transcription',
    );
    const text = res.output_text?.trim();
    return text ? text.slice(0, 1000) : null;
  } catch (err) {
    console.warn('voice: transcription failed:', (err as Error).message.slice(0, 200));
    return null;
  }
}
