// `pnpm db:seed` — replaces the synthetic background kids (origin = 'seed'). Never touches kiosk visits.
import { PARENT_MODE_MAX_AGE } from '@ralph/shared';
import * as engine from '../triage/engine.js';
import { requireDb } from './client.js';
import { SEED_KIDS } from './seed-data.js';
import * as db from './visits.js';

const sql = requireDb();
const minutes = (n: number) => n * 60_000;

const old = await db.visitIdsByOrigin('seed');
await db.deleteVisits(old);
console.log(`removed ${old.length} old seed visits`);

for (const kid of SEED_KIDS) {
  const arrived = new Date(Date.now() - minutes(kid.arrived_min_ago));
  const id = await db.createVisit({
    first_name: kid.first_name,
    age_years: kid.age_years,
    language: kid.language,
    parent_mode: kid.age_years < PARENT_MODE_MAX_AGE,
    origin: 'seed',
    arrived_at: arrived,
  });
  await engine.startComplaint(id, kid.complaint);

  // Answers spread over the first few minutes after arrival.
  for (const [i, a] of kid.answers.entries()) {
    await engine.answer(id, {
      node_id: a.node_id,
      value: a.said?.original ?? a.value,
      skip: a.skip,
      input: a.said ? 'voice' : 'tap',
      text_original: a.said?.original,
      text_en: a.said?.en,
      at: new Date(arrived.getTime() + minutes(1 + i * 0.5)),
    });
  }
  await engine.parentConfirm(id, { answers: kid.parent, at: new Date(arrived.getTime() + minutes(6)) });
  for (const c of kid.checkins) {
    await engine.checkin(id, { feeling: c.feeling, pain_face: c.pain_face, at: new Date(arrived.getTime() + minutes(c.after_min)) });
  }

  const alerts = await db.listFlags(id);
  console.log(`${kid.first_name.padEnd(6)} ${kid.language.padEnd(5)} ${alerts.map((a) => a.key).join(', ') || '(no alerts)'}`);
}

await sql.end();
