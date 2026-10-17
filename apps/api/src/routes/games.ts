import type { FastifyPluginAsync } from 'fastify';
import { GameResultSchema, gameDeteriorationReasons, type Alert, type Reason } from '@ralph/shared';
import { dbFor } from '../db/visit.js';
import * as visitsDb from '../db/visits.js';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * POST /api/visits/:id/games — one finished game (Firefly Tap or Cyber Circuit).
 * Writes per-target rows to `game_events`, a summary row to `game_rounds`, and
 * computes deterioration reasons vs the child's first round of the same game.
 */
export const gameRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>('/visits/:id/games', async (req, reply) => {
    const parsed = GameResultSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const g = parsed.data;
    const visitId = req.params.id;
    const db = dbFor(visitId);
    if (!db) return { ok: true, persisted: false, reasons: [] as Reason[] };

    let reasons: Reason[] = [];
    let persisted = false;

    try {
      const start = new Date(g.started_at).getTime();
      if (g.events.length) {
        const rows = g.events.map((e) => ({
          visit_id: visitId,
          at: new Date(start + e.at_ms),
          game: g.game,
          round: e.round,
          reaction_ms: e.reaction_ms === null ? null : Math.round(e.reaction_ms),
          hit: e.hit,
          hand: e.hand,
          phase: e.phase ?? null,
          accuracy_px: e.accuracy_px ?? null,
          label: e.label ?? null,
        }));
        await db`INSERT INTO game_events ${db(rows)}`;
      }

      // Baseline = first round of this game for this visit.
      const [baseline] = await db<{ summary: Record<string, unknown> }[]>`
        SELECT summary FROM game_rounds
        WHERE visit_id = ${visitId} AND game = ${g.game}
        ORDER BY at ASC LIMIT 1`;

      reasons = baseline
        ? gameDeteriorationReasons(
            { medianReactionMs: num(baseline.summary.medianReactionMs), hitRate: num(baseline.summary.hitRate) },
            { medianReactionMs: num(g.summary.medianReactionMs), hitRate: num(g.summary.hitRate) },
          )
        : [];

      await db`INSERT INTO game_rounds (visit_id, game, handedness, summary, observations, reasons)
               VALUES (${visitId}, ${g.game}, ${g.handedness}, ${db.json(g.summary)},
                       ${db.json(g.observations)}, ${db.json(reasons as never)})`;
      persisted = true;
    } catch {
      /* Game tables optional if 004 migration hasn't been applied yet */
    }

    // Surface significant game deterioration as a nurse heads-up alert on the visit.
    try {
      const alerts: Alert[] = reasons
        .filter((r) => r.points >= 2)
        .map((r) => ({
          kind: 'deterioration',
          key: `det:game:${g.game}`,
          reason: r.text,
        }));
      if (alerts.length > 0) {
        await visitsDb.insertNewAlerts(visitId, alerts);
      }
    } catch {
      /* ignore if visit does not exist in DB */
    }

    return { ok: true, persisted, reasons };
  });
};
