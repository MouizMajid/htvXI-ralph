import type { FastifyPluginAsync } from 'fastify';

/** Demo-only controls (registered only when DEMO_MODE=true). */
export const demoRoutes: FastifyPluginAsync = async (app) => {
  // TODO(Tier 1 #8): seed, reset, fast-forward, inject deterioration
  app.post('/reset', async (_req, reply) => reply.code(501).send({ error: 'not implemented' }));
};
