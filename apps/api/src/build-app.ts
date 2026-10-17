import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { registerErrorHandler } from './http.js';
import { healthRoutes } from './routes/health.js';
import { demoRoutes } from './routes/demo.js';
import { visitRoutes } from './routes/visits.js';
import { staffRoutes } from './routes/staff.js';

/** Registers plugins + routes on an existing instance (index.ts creates it — Vercel requires that). */
export async function configureApp(app: FastifyInstance) {
  registerErrorHandler(app);

  await app.register(cors, { origin: true });
  // Vercel caps request bodies at 4.5 MB; a 15 s opus clip is well under 100 KB.
  await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 } });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(visitRoutes, { prefix: '/api' });
  await app.register(staffRoutes, { prefix: '/api' });
  if (env.DEMO_MODE) await app.register(demoRoutes, { prefix: '/api/demo' });

  return app;
}

/** A fully configured app that isn't listening — for tests (app.inject). */
export async function buildApp({ logger = true }: { logger?: boolean } = {}) {
  return configureApp(Fastify({ logger }));
}
