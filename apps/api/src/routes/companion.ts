import type { FastifyPluginAsync } from 'fastify';
import {
  CompanionTurnBodySchema,
  SAFEGUARDING_REPLY,
  checkRedFlagPhrases,
  detectFeeling,
  detectSafeguarding,
  safeguardingAlert,
  wantsQuiet,
  type Alert,
  type CompanionTurnResponse,
} from '@ralph/shared';
import { companionReply } from '../ai/companion.js';
import { dbFor } from '../db/visit.js';
import * as visitsDb from '../db/visits.js';
import * as engine from '../triage/engine.js';

/**
 * Companion chat while waiting.
 * Code decides every alert (safeguarding phrases, red-flag phrases);
 * Gemini only writes Ralph's friendly words. Kiosk responses never contain alerts.
 */
export const companionRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>('/visits/:id/companion', async (req, reply) => {
    const parsed = CompanionTurnBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const visitId = req.params.id;
    const db = dbFor(visitId);

    // 1. Deterministic phrase signals first.
    const sgPhrase = detectSafeguarding({ transcript: body.message, lang: body.language });
    const redFlags = checkRedFlagPhrases(body.message);

    // 2. LLM for the friendly words (may be null → kiosk fallback).
    const ai = sgPhrase.fired ? null : await companionReply(body);

    // 3. Safeguarding: OR of phrase list + AI signal → fixed line, private staff alert, no follow-up.
    const sg = detectSafeguarding({
      transcript: body.message,
      lang: body.language,
      llm_concern: ai?.safeguarding_concern,
    });
    const sgAlert = safeguardingAlert(sg);

    const extraAlerts: Alert[] = [];
    if (sgAlert) extraAlerts.push(sgAlert);
    for (const r of redFlags) {
      extraAlerts.push({
        kind: 'red_flag',
        key: `red:companion:${r}`,
        reason: `${r} (said to Ralph while waiting)`,
      });
    }

    const feeling = ai?.feeling ?? detectFeeling(body.message);
    const replyText = sg.fired ? SAFEGUARDING_REPLY[body.language] : (ai?.ralph_reply ?? null);

    if (db) {
      try {
        await db`INSERT INTO turns (visit_id, node_id, speaker, text_original, text_en, input)
                 VALUES (${visitId}, 'companion', 'child', ${body.message},
                         ${body.language === 'en' ? body.message : null}, 'text')`;
        if (replyText) {
          await db`INSERT INTO turns (visit_id, node_id, speaker, text_original)
                   VALUES (${visitId}, 'companion', 'ralph', ${replyText})`;
        }
        if (body.is_checkin_reply || feeling) {
          const noteText = ai?.new_symptoms.length ? ai.new_symptoms.join(', ') : body.message;
          await visitsDb.insertCheckin(visitId, {
            feeling: feeling ?? 'same',
            pain_face: ai?.pain_face ?? null,
            note: noteText,
            note_en: body.language === 'en' ? noteText : (ai?.new_symptoms.join(', ') || null),
          });
        }
        await engine.refreshAlerts(visitId, extraAlerts);
      } catch {
        /* Demo visit or unmigrated DB: fail soft so kiosk chat keeps working */
      }
    }

    const res: CompanionTurnResponse = {
      reply: replyText,
      feeling,
      wants_quiet: sg.fired ? false : (ai?.child_wants_quiet ?? wantsQuiet(body.message)),
    };
    return res;
  });
};
