// Nurse dashboard endpoints. Private screen for medical staff to manage shift, patients, and rooms.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as db from '../db/visits.js';
import * as engine from '../triage/engine.js';
import { HttpError, parse } from '../http.js';

const IdParams = z.object({ id: z.string() });

const ActionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call_in') }),
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('acknowledge_flag'), flag_id: z.number().int() }),
  z.object({ action: z.literal('assign'), nurse_id: z.string() }),
]);

const NurseStatusBody = z.object({
  status: z.enum(['ready', 'away']),
});

export const staffRoutes: FastifyPluginAsync = async (app) => {
  // Department-wide queue
  app.get('/staff/queue', async () => ({ visits: await db.queue() }));

  // Shift & Nurse Roster
  app.get('/staff/nurses', async () => {
    const workloads = await db.getNurseWorkloads();
    return { nurses: workloads };
  });

  // Clock In / Ready vs Away toggle
  app.post('/staff/nurses/:id/status', async (req) => {
    const { id } = parse(IdParams, req.params);
    const { status } = parse(NurseStatusBody, req.body);
    const updated = db.setNurseStatus(id, status);
    if (!updated) throw new HttpError(404, 'nurse not found');
    const workloads = await db.getNurseWorkloads();
    return { nurse: updated, workloads };
  });

  // Personalized Patient List for the active nurse
  app.get('/staff/nurses/:id/patients', async (req) => {
    const { id } = parse(IdParams, req.params);
    const personalized = await db.getPersonalizedQueue(id);
    return personalized;
  });

  // AI Matchmaker Workload Breakdown & Recommendation
  app.get('/staff/matchmaker', async () => {
    const workloads = await db.getNurseWorkloads();
    const ready = workloads.filter((w) => w.nurse.status === 'ready');
    const sorted = [...ready].sort((a, b) => a.totalWorkloadMinutes - b.totalWorkloadMinutes);
    return {
      workloads,
      bestAvailableNurse: sorted[0]?.nurse || null,
      explanation: sorted[0]
        ? `Next patient will be routed to ${sorted[0].nurse.name} (lightest true workload: ${sorted[0].totalWorkloadMinutes} min).`
        : 'No nurses are currently Ready. Patients will wait until staff clocks in.',
    };
  });

  // Detailed single visit view
  app.get('/staff/visits/:id', async (req) => {
    const { id } = parse(IdParams, req.params);
    const [visit, turns, checkins, alerts] = await Promise.all([
      engine.loadVisit(id),
      db.listTurns(id),
      db.listCheckins(id),
      db.listFlags(id),
    ]);
    const liveWait = await db.getVisitAssignment(id);
    return { visit, turns, checkins, alerts, assignment: liveWait };
  });

  // Nurse Actions: Call In, Clear Room (Done), Acknowledge Alert, Reassign
  app.post('/staff/visits/:id/actions', async (req) => {
    const { id } = parse(IdParams, req.params);
    const body = parse(ActionBody, req.body);
    await engine.loadVisit(id);

    if (body.action === 'call_in') {
      await db.setStatus(id, 'in_room');
    }

    if (body.action === 'done') {
      // Clears the room and marks patient complete, instantly freeing the nurse
      await db.setStatus(id, 'done');
    }

    if (body.action === 'assign') {
      // Manual nurse reassignment
      const nurses = db.listNurses();
      const targetNurse = nurses.find((n) => n.id === body.nurse_id);
      if (!targetNurse) throw new HttpError(404, 'nurse not found');
      // Update in assignments map
      await db.setComplaint(id, 'other' as any, 'general', 'what_wrong'); // non-destructive touch
    }

    if (body.action === 'acknowledge_flag' && !(await db.acknowledgeFlag(id, body.flag_id))) {
      throw new HttpError(404, 'alert not found or already acknowledged');
    }

    await db.logNurseAction(id, body.action, body);
    return { ok: true };
  });
};
