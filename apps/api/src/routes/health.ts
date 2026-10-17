import type { FastifyPluginAsync } from 'fastify';
import { SUPPORTED_LANGS } from '@ralph/shared';
import { sql } from '../db/client.js';

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
    // `langs` proves the @ralph/shared workspace package loads in the deployed function.
    return { ok: true, db, langs: SUPPORTED_LANGS.length };
  });
};
