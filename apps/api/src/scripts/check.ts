// `pnpm check` — verifies Gemini + Tiger Data connections. Never prints secrets.
import { GoogleGenAI } from '@google/genai';
import postgres from 'postgres';
import { env } from '../env.js';

let failed = false;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string) => {
  failed = true;
  console.log(`  ✗ ${msg}`);
};

console.log('\nGemini');
if (!env.GEMINI_API_KEY) {
  bad('GEMINI_API_KEY is empty');
} else {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  try {
    const available = new Set<string>();
    for await (const m of await ai.models.list()) {
      if (m.name) available.add(m.name.replace(/^models\//, ''));
    }
    ok(`API key works (${available.size} models visible)`);
    for (const [key, id] of [
      ['GEMINI_MODEL', env.GEMINI_MODEL],
      ['GEMINI_STT_MODEL', env.GEMINI_STT_MODEL],
      ['GEMINI_TTS_MODEL', env.GEMINI_TTS_MODEL],
    ] as const) {
      if (!id) bad(`${key} is empty`);
      else if (available.has(id)) ok(`${key} = ${id} exists`);
      else bad(`${key} = ${id} NOT found in model list`);
    }
  } catch (e) {
    bad(`listing models failed: ${(e as Error).message}`);
  }

  if (env.GEMINI_MODEL) {
    try {
      const t0 = Date.now();
      const res = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: 'Reply with exactly: Ralph is ready',
      });
      ok(`generateContent replied "${res.text?.trim()}" in ${Date.now() - t0} ms`);
    } catch (e) {
      bad(`generateContent failed: ${(e as Error).message}`);
    }
  }
}

console.log('\nTiger Data');
if (!env.DATABASE_URL) {
  bad('DATABASE_URL is empty');
} else {
  const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 10 });
  try {
    const [pg] = await sql<{ v: string }[]>`SELECT current_setting('server_version') AS v`;
    ok(`connected (Postgres ${pg?.v})`);
    const [ts] = await sql<{ v: string }[]>`SELECT extversion AS v FROM pg_extension WHERE extname = 'timescaledb'`;
    if (ts) ok(`TimescaleDB ${ts.v} installed`);
    else bad('TimescaleDB extension not installed');
    const tables = await sql<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('patients','visits','checkins','game_events')`;
    if (tables.length === 4) ok('migrations applied (core tables exist)');
    else console.log(`  · migrations not applied yet — run \`pnpm db:migrate\``);
  } catch (e) {
    bad(`query failed: ${(e as Error).message}`);
  } finally {
    await sql.end();
  }
}

console.log(failed ? '\nSome checks failed.\n' : '\nAll good.\n');
process.exit(failed ? 1 : 0);
