import postgres from 'postgres';
import { env } from '../env';

/** null until DATABASE_URL is set, so the API still boots for frontend work. */
export const sql = env.DATABASE_URL ? postgres(env.DATABASE_URL, { ssl: 'require' }) : null;

export function requireDb() {
  if (!sql) throw new Error('DATABASE_URL is not set');
  return sql;
}
