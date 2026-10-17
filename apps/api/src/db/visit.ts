import { sql } from './client.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DB handle if this visit can be persisted, else null. Lets the kiosk games and
 * companion run before the visits flow / DATABASE_URL exist (visit id "demo").
 */
export function dbFor(visitId: string) {
  return sql && UUID_RE.test(visitId) ? sql : null;
}
