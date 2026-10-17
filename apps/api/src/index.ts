// Entry point. Vercel auto-detects Fastify from src/index.ts and runs it as a Function;
// locally `pnpm dev` runs the same file on PORT.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { healthRoutes } from './routes/health.js';
import { demoRoutes } from './routes/demo.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
// Vercel caps request bodies at 4.5 MB; a 15 s opus clip is well under 100 KB.
await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 } });

await app.register(healthRoutes, { prefix: '/api' });
if (env.DEMO_MODE) await app.register(demoRoutes, { prefix: '/api/demo' });
// TODO(Tier 1): visits, turns, checkins, games, staff, tts routes

// Don't `await` this: on Vercel, listen() is intercepted and a top-level await on it
// keeps the module from ever finishing loading (every request hangs).
app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
