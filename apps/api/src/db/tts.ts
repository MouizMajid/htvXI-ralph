// Ralph's generated speech, cached in Postgres (Vercel has no persistent disk). Table: 002_tts_cache.sql.
import { requireDb } from './client.js';

export async function getTts(hash: string): Promise<{ mime: string; audio: Buffer } | null> {
  const sql = requireDb();
  const [row] = await sql<{ mime: string; audio: Buffer }[]>`SELECT mime, audio FROM tts_cache WHERE hash = ${hash}`;
  return row ?? null;
}

export async function hasTts(hash: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql`SELECT 1 FROM tts_cache WHERE hash = ${hash}`;
  return Boolean(row);
}

export async function putTts(hash: string, mime: string, audio: Buffer) {
  const sql = requireDb();
  await sql`
    INSERT INTO tts_cache (hash, mime, audio) VALUES (${hash}, ${mime}, ${audio})
    ON CONFLICT (hash) DO NOTHING`;
}
