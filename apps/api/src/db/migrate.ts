import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requireDb } from './client';

const sql = requireDb();
const dir = fileURLToPath(new URL('./migrations/', import.meta.url));

await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
const applied = new Set((await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name));

for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(name)) continue;
  const body = await readFile(dir + name, 'utf8');
  console.log(`applying ${name}`);
  // Continuous aggregates can't be created inside a transaction, so no sql.begin() here.
  await sql.unsafe(body);
  await sql`INSERT INTO _migrations (name) VALUES (${name})`;
}

console.log('migrations up to date');
await sql.end();
