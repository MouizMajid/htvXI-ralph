// Kiosk (child + parent) endpoints. Responses NEVER include alerts or safeguarding info.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ComplaintSchema,
  CreateVisitBodySchema,
  FaceSchema,
  PARENT_MODE_MAX_AGE,
  ParentAnswersSchema,
} from '@ralph/shared';
import * as db from '../db/visits.js';
import * as engine from '../triage/engine.js';
import { env } from '../env.js';
import { parse } from '../http.js';

const IdParams = z.object({ id: z.string().uuid() });

const TapBody = z.object({
  node_id: z.string(),
  value: z.unknown().optional(),
  skip: z.boolean().optional(),
});

const ParentBody = z.object({
  answers: ParentAnswersSchema,
  edits: z.array(z.object({ node_id: z.string(), value: z.unknown() })).optional(),
});

const CheckinBody = z.object({
  feeling: z.enum(['better', 'same', 'worse', 'no_response']),
  pain_face: FaceSchema.nullable().optional(),
  note: z.string().max(300).optional(),
  source: z.enum(['companion', 'game', 'timer']).optional(),
});

export const visitRoutes: FastifyPluginAsync = async (app) => {
  app.post('/visits', async (req, reply) => {
    const body = parse(CreateVisitBodySchema, req.body);
    const parent_mode = body.age_years < PARENT_MODE_MAX_AGE;
    const id = await db.createVisit({ ...body, parent_mode });
    return reply.code(201).send({ visit_id: id, parent_mode });
  });

  app.post('/visits/:id/complaint', async (req) => {
    const { id } = parse(IdParams, req.params);
    const { complaint } = parse(z.object({ complaint: ComplaintSchema }), req.body);
    return { node: await engine.startComplaint(id, complaint) };
  });

  /** Tap answer (typed text on a free-speech question is recorded as the child's words). */
  app.post('/visits/:id/turns/tap', async (req) => {
    const { id } = parse(IdParams, req.params);
    return engine.answer(id, { ...parse(TapBody, req.body), input: 'tap' });
  });

  app.post('/visits/:id/parent', async (req) => {
    const { id } = parse(IdParams, req.params);
    await engine.parentConfirm(id, parse(ParentBody, req.body));
    return { ok: true };
  });

  app.post('/visits/:id/checkins', async (req) => {
    const body = parse(CheckinBody, req.body);
    const rawId = (req.params as { id?: string })?.id;
    if (rawId === 'demo') return { ok: true };
    const { id } = parse(IdParams, req.params);
    await engine.checkin(id, {
      feeling: body.feeling,
      pain_face: body.pain_face,
      note: body.note,
      note_en: body.note,
    });
    return { ok: true };
  });

  /** Polled by the kiosk: has the nurse called the child in? When is the next check-in due? */
  app.get('/visits/:id/status', async (req) => {
    const { id } = parse(IdParams, req.params);
    const [visit, checkins] = await Promise.all([engine.loadVisit(id), db.listCheckins(id)]);
    const last = checkins.at(-1)?.at ?? visit.parent_confirmed_at;
    const next_checkin_at =
      visit.status === 'waiting' && last ? new Date(new Date(last).getTime() + env.CHECKIN_INTERVAL_SEC * 1000) : null;
    return { status: visit.status, current_node: visit.current_node, next_checkin_at };
  });
};
