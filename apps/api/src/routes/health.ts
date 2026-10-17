import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../db/client';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let db = 'unconfigured';
    if (sql) {
      try {
        await sql`SELECT 1`;
        db = 'ok';
      } catch {
        db = 'error';
      }
    }
    return { ok: true, db };
  });
};
