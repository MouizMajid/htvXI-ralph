// Ralph's voice (TTS, cached in Postgres) and ears (spoken answers + chat transcription).
// Every failure is soft: the kiosk falls back to the browser's voice, or to tapping.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SpokenAnswerResponse } from '@ralph/shared';
import { synthesize, transcribe, ttsAvailable, ttsHash } from '../ai/voice.js';
import { getTts, hasTts, putTts } from '../db/tts.js';
import * as engine from '../triage/engine.js';
import { HttpError, parse } from '../http.js';
import { env } from '../env.js';

const IdParams = z.object({ id: z.string().uuid() });
const TtsBody = z.object({ text: z.string().trim().min(1).max(300) });
const HashParams = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) });

/** Audio formats the transcription model accepts (no audio/mp4 — the kiosk records WAV). */
const AUDIO_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/flac']);

/** Reads a multipart upload: the audio file plus simple text fields (e.g. node_id). */
async function readAudio(req: FastifyRequest): Promise<{ audio: Buffer; mime: string; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let audio: Buffer | null = null;
  let mime = '';
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      mime = part.mimetype.split(';')[0]!.trim();
      audio = await part.toBuffer();
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }
  if (!audio || audio.length === 0) throw new HttpError(400, 'no audio received');
  if (!AUDIO_TYPES.has(mime)) throw new HttpError(415, `unsupported audio type ${mime}`);
  return { audio, mime: mime === 'audio/x-wav' ? 'audio/wav' : mime, fields };
}

export const voiceRoutes: FastifyPluginAsync = async (app) => {
  /**
   * A line Ralph will say → a URL to play. Cached lines (from `pnpm tts:warm`) come back at once.
   * Uncached lines are generated (~4 s) only when TTS_ON_DEMAND=true; otherwise 404 straight away
   * and the kiosk uses the browser voice. That also keeps strangers from spending our TTS quota.
   */
  app.post('/tts', async (req, reply) => {
    const { text } = parse(TtsBody, req.body);
    const hash = ttsHash(text);
    const url = `/api/tts/${hash}`;
    if (await hasTts(hash)) return { url, cached: true };
    if (!env.TTS_ON_DEMAND) return reply.code(404).send({ error: 'not pre-generated; use the browser voice' });
    if (!ttsAvailable()) return reply.code(503).send({ error: 'Ralph’s voice is not configured' });
    const audio = await synthesize(text);
    if (!audio) return reply.code(503).send({ error: 'Ralph’s voice is unavailable right now' });
    await putTts(hash, 'audio/wav', audio);
    return { url, cached: false };
  });

  app.get('/tts/:hash', async (req, reply) => {
    const { hash } = parse(HashParams, req.params);
    const clip = await getTts(hash);
    if (!clip) throw new HttpError(404, 'clip not found');
    // Content-addressed: the same hash always means the same audio.
    return reply.header('Content-Type', clip.mime).header('Cache-Control', 'public, max-age=31536000, immutable').send(clip.audio);
  });

  /** A spoken answer to the current question (multipart: node_id + audio). */
  app.post('/visits/:id/turns/audio', async (req): Promise<SpokenAnswerResponse> => {
    const { id } = parse(IdParams, req.params);
    const { audio, mime, fields } = await readAudio(req);
    const nodeId = z.string().min(1).parse(fields.node_id);
    const visit = await engine.loadVisit(id);
    const transcript = await transcribe(audio, mime, visit.language);
    return engine.answerSpoken(id, { node_id: nodeId, transcript });
  });

  /** Waiting-room chat microphone: audio → text (the kiosk then sends it as a chat message). */
  app.post('/visits/:id/transcribe', async (req) => {
    const { id } = parse(IdParams, req.params);
    const { audio, mime } = await readAudio(req);
    const visit = await engine.loadVisit(id);
    return { text: await transcribe(audio, mime, visit.language) };
  });
};
