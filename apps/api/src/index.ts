// Entry point. Vercel auto-detects Fastify from this file — it must import `fastify` itself and
// call listen(). Routes are registered in build-app.ts (not app.ts: Vercel would treat that as the entry).
import Fastify from 'fastify';
import { configureApp } from './build-app.js';
import { env } from './env.js';

const app = await configureApp(Fastify({ logger: true }));

// Don't `await` this: on Vercel, listen() is intercepted and a top-level await on it
// keeps the module from ever finishing loading (every request hangs).
app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
