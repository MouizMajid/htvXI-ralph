import postgres from 'postgres';
import { env } from '../env';

/**
 * null until DATABASE_URL is set, so the API still boots for frontend work.
 * Small pool: on Vercel many function instances may each hold connections.
 */
export const sql = env.DATABASE_URL
  ? postgres(env.DATABASE_URL, { ssl: 'require', max: 3, idle_timeout: 20, onnotice: () => {} })
  : null;

export function requireDb() {
  if (!sql) throw new Error('DATABASE_URL is not set');
  return sql;
}
