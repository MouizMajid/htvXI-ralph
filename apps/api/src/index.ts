import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './env';
import { attachRealtime } from './realtime';
import { healthRoutes } from './routes/health';
import { demoRoutes } from './routes/demo';
import { companionRoutes } from './routes/companion';
import { gameRoutes } from './routes/games';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // ≤15 s clips

await app.register(healthRoutes, { prefix: '/api' });
await app.register(companionRoutes, { prefix: '/api' });
await app.register(gameRoutes, { prefix: '/api' });
if (env.DEMO_MODE) await app.register(demoRoutes, { prefix: '/api/demo' });
// TODO(Tier 1): visits, turns, staff, tts routes

attachRealtime(app.server);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
