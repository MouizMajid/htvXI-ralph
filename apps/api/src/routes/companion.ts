// Waiting-room chat with Ralph. Company, not assessment:
//  - Gemini writes Ralph's reply and an English translation of the child's message.
//  - The exchange is stored as conversation turns, so the nurse reads the child's own words.
//  - Alerts come only from code: the shared rules re-run over the conversation (breathing,
//    "chest hurts", …) and safeguarding is phrase list OR AI signal. A red-flag message gets a
//    fixed reply ("I'm letting the nurse know") and the tap check-in, never chit-chat.
//  - If Gemini fails, Ralph's offline reply comes from here too, so the nurse sees what he said.
//  - Nothing records how the child feels. If the message sounds like "worse", the kiosk is
//    told to offer the tap check-in, so the child answers it themselves.
// Kiosk responses never contain alert or safeguarding details.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CompanionTurnBodySchema,
  RED_FLAG_REPLY,
  SAFEGUARDING_REPLY,
  detectSafeguarding,
  fallbackReply,
  safeguardingAlert,
  soundsWorse,
  wantsQuiet,
  worryingWords,
  type CompanionTurnResponse,
} from '@ralph/shared';
import { companionReply } from '../ai/companion.js';
import * as db from '../db/visits.js';
import * as engine from '../triage/engine.js';
import { parse } from '../http.js';

const IdParams = z.object({ id: z.string().uuid() });

export const companionRoutes: FastifyPluginAsync = async (app) => {
  app.post('/visits/:id/companion', async (req) => {
    const { id } = parse(IdParams, req.params);
    const body = parse(CompanionTurnBodySchema, req.body);
    const visit = await engine.loadVisit(id);

    // A phrase-list hit skips Gemini entirely: Ralph says only the fixed line.
    const phraseHit = detectSafeguarding({ transcript: body.message, lang: body.language });
    const ai = phraseHit.fired ? null : await companionReply(body);
    const textEn = body.language === 'en' ? body.message : (ai?.text_en ?? null);

    const sg = detectSafeguarding({
      transcript: body.message,
      lang: body.language,
      text_en: textEn ?? undefined,
      llm_concern: ai?.safeguarding_concern,
    });
    const sgAlert = safeguardingAlert(sg);
    // Red-flag words (code): a fixed calm reply instead of chit-chat; refreshAlerts raises the alert.
    const worry = !sg.fired && textEn ? worryingWords(textEn) : null;
    const reply = sg.fired
      ? SAFEGUARDING_REPLY[body.language]
      : worry
        ? RED_FLAG_REPLY[body.language]
        : (ai?.ralph_reply ??
          // Offline replies are English only; other languages get the kiosk's own fallback.
          (body.language === 'en' ? fallbackReply(body.message, body.history.length).reply : null));

    await db.insertChatTurns(visit.id, {
      child_original: body.message,
      child_en: textEn,
      input: body.input,
      ralph_reply: reply,
    });
    await engine.refreshAlerts(visit.id, sgAlert ? [sgAlert] : []);

    const res: CompanionTurnResponse = {
      reply,
      wants_quiet: sg.fired ? false : (ai?.child_wants_quiet ?? wantsQuiet(body.message)),
      offer_checkin: !sg.fired && (worry !== null || soundsWorse(textEn ?? body.message)),
    };
    return res;
  });
};
