import type { FastifyPluginAsync } from 'fastify';
import {
  CheckinBodySchema,
  CompanionTurnBodySchema,
  checkRedFlagPhrases,
  checkSafeguarding,
  detectFeeling,
  isUnresponsive,
  wantsQuiet,
  type CompanionTurnResponse,
  type Lang,
} from '@ralph/shared';
import sgEn from '@ralph/shared/triage/i18n/safeguarding/en.json';
import sgEs from '@ralph/shared/triage/i18n/safeguarding/es.json';
import sgFr from '@ralph/shared/triage/i18n/safeguarding/fr.json';
import sgHi from '@ralph/shared/triage/i18n/safeguarding/hi.json';
import sgZh from '@ralph/shared/triage/i18n/safeguarding/zh-CN.json';
import replyEn from '@ralph/shared/triage/i18n/en.json';
import replyEs from '@ralph/shared/triage/i18n/es.json';
import replyFr from '@ralph/shared/triage/i18n/fr.json';
import replyHi from '@ralph/shared/triage/i18n/hi.json';
import replyZh from '@ralph/shared/triage/i18n/zh-CN.json';
import { companionReply } from '../ai/companion';
import { dbFor } from '../db/visit';
import { toStaff } from '../realtime';

type PhraseFile = { phrases?: string[] };
type ReplyFile = { safeguarding_reply?: string };

const PHRASES: Record<Lang, string[]> = {
  en: (sgEn as PhraseFile).phrases ?? [],
  es: (sgEs as PhraseFile).phrases ?? [],
  fr: (sgFr as PhraseFile).phrases ?? [],
  hi: (sgHi as PhraseFile).phrases ?? [],
  'zh-CN': (sgZh as PhraseFile).phrases ?? [],
};
const FIXED_EN = 'Thank you for telling me. A nurse will come talk with you.';
const SAFEGUARDING_REPLY: Record<Lang, string> = {
  en: (replyEn as ReplyFile).safeguarding_reply ?? FIXED_EN,
  es: (replyEs as ReplyFile).safeguarding_reply ?? FIXED_EN,
  fr: (replyFr as ReplyFile).safeguarding_reply ?? FIXED_EN,
  hi: (replyHi as ReplyFile).safeguarding_reply ?? FIXED_EN,
  'zh-CN': (replyZh as ReplyFile).safeguarding_reply ?? FIXED_EN,
};

async function raiseFlag(visitId: string, kind: 'red_flag' | 'safeguarding' | 'unresponsive', reason: string) {
  const db = dbFor(visitId);
  if (db) await db`INSERT INTO flags (visit_id, kind, reason) VALUES (${visitId}, ${kind}, ${reason})`;
  try {
    toStaff().emit('flag:new', { visitId, kind, reason });
  } catch {
    /* realtime not attached in scripts */
  }
}

/**
 * Companion chat + check-ins.
 * Code decides every flag (safeguarding phrases, red-flag phrases, unresponsive);
 * Gemini only writes Ralph's friendly words. Kiosk responses never contain flags.
 */
export const companionRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>('/visits/:id/companion', async (req, reply) => {
    const parsed = CompanionTurnBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const visitId = req.params.id;
    const db = dbFor(visitId);

    // 1. Deterministic signals first.
    const sg = checkSafeguarding(body.message, PHRASES[body.language], body.language);
    const redFlags = checkRedFlagPhrases(body.message);

    // 2. LLM for the friendly words (may be null → kiosk fallback).
    const ai = sg.fired ? null : await companionReply(body);

    // 3. Safeguarding: OR of both signals → fixed line, private staff flag, no follow-up.
    const sgFired = sg.fired || ai?.safeguarding_concern === true;
    if (sgFired) {
      const why = [sg.fired && `phrase "${sg.phrase}"`, ai?.safeguarding_concern && 'AI signal']
        .filter(Boolean)
        .join(' + ');
      await raiseFlag(visitId, 'safeguarding', `Companion chat: ${why}`);
    }

    for (const r of redFlags) await raiseFlag(visitId, 'red_flag', `${r} (said to Ralph while waiting)`);
    if (ai?.new_symptoms.length) {
      try {
        toStaff().emit('visit:update', visitId);
      } catch {
        /* ignore */
      }
    }

    const feeling = ai?.feeling ?? detectFeeling(body.message);
    const replyText = sgFired ? SAFEGUARDING_REPLY[body.language] : (ai?.ralph_reply ?? null);

    if (db) {
      await db`INSERT INTO turns (visit_id, node_id, speaker, text_original)
               VALUES (${visitId}, 'companion', 'child', ${body.message})`;
      if (replyText) {
        await db`INSERT INTO turns (visit_id, node_id, speaker, text_original)
                 VALUES (${visitId}, 'companion', 'ralph', ${replyText})`;
      }
      if (body.is_checkin_reply || feeling) {
        await db`INSERT INTO checkins (visit_id, at, pain_face, feeling, note, source)
                 VALUES (${visitId}, now(), ${ai?.pain_face ?? null}, ${feeling ?? null},
                         ${ai?.new_symptoms.join(', ') || null}, 'companion')`;
      }
    }

    const res: CompanionTurnResponse = {
      reply: replyText,
      feeling,
      wants_quiet: sgFired ? false : (ai?.child_wants_quiet ?? wantsQuiet(body.message)),
    };
    return res;
  });

  app.post<{ Params: { id: string } }>('/visits/:id/checkins', async (req, reply) => {
    const parsed = CheckinBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const c = parsed.data;
    const visitId = req.params.id;
    const db = dbFor(visitId);
    if (!db) return { ok: true, persisted: false };

    await db`INSERT INTO checkins (visit_id, at, pain_face, feeling, note, source)
             VALUES (${visitId}, now(), ${c.pain_face ?? null}, ${c.feeling}, ${c.note ?? null}, ${c.source})`;

    const recent = await db<{ feeling: string }[]>`
      SELECT feeling FROM checkins WHERE visit_id = ${visitId} ORDER BY at DESC LIMIT 2`;
    if (c.feeling === 'no_response' && isUnresponsive(recent.map((r) => r.feeling))) {
      await raiseFlag(visitId, 'unresponsive', 'Not responding to Ralph (2 check-ins in a row)');
    }
    if (c.feeling === 'worse') {
      try {
        toStaff().emit('visit:update', visitId);
      } catch {
        /* ignore */
      }
    }
    return { ok: true, persisted: true };
  });
};
