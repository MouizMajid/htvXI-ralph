// Nurse dashboard endpoints. No AI here — just the child's conversation, answers, check-ins, alerts.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as db from '../db/visits.js';
import * as engine from '../triage/engine.js';
import { HttpError, parse } from '../http.js';

const IdParams = z.object({ id: z.string().uuid() });

const ActionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call_in') }),
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('acknowledge_flag'), flag_id: z.number().int() }),
]);

export const staffRoutes: FastifyPluginAsync = async (app) => {
  app.get('/staff/queue', async () => ({ visits: await db.queue() }));

  app.get('/staff/visits/:id', async (req) => {
    const { id } = parse(IdParams, req.params);
    const [visit, turns, checkins, alerts] = await Promise.all([
      engine.loadVisit(id),
      db.listTurns(id),
      db.listCheckins(id),
      db.listFlags(id),
    ]);
    return { visit, turns, checkins, alerts };
  });

  app.post('/staff/visits/:id/actions', async (req) => {
    const { id } = parse(IdParams, req.params);
    const body = parse(ActionBody, req.body);
    await engine.loadVisit(id);
    if (body.action === 'call_in') await db.setStatus(id, 'in_room');
    if (body.action === 'done') await db.setStatus(id, 'done');
    if (body.action === 'acknowledge_flag' && !(await db.acknowledgeFlag(id, body.flag_id))) {
      throw new HttpError(404, 'alert not found or already acknowledged');
    }
    await db.logNurseAction(id, body.action, body);
    return { ok: true };
  });
};
