---
name: database
description: RALPH database on Tiger Data (Postgres + TimescaleDB) — schema, check-ins hypertable, continuous aggregates, migrations, and synthetic seed data. Use when working in apps/api/src/db, writing SQL, or touching seed/demo data.
---

# Database (Tiger Cloud free plan)

- Client: `postgres` (porsager). Plain SQL migrations in `apps/api/src/db/migrations/NNN_name.sql`, run in order by a small runner script.
- `DATABASE_URL` from env, `sslmode=require`. Pool is `max: 3` because each Vercel Function instance opens its own connections.
- The dev and production deployments share the one Tiger service, so migrations run from a laptop (`pnpm db:migrate`) apply everywhere. Migrations must be additive/idempotent-safe; never edit an applied migration — add a new numbered file.
- Verify hypertable / cagg syntax against current Tiger Data docs before relying on it.
- **Synthetic data only**; every patient has `is_synthetic = true`.

## Schema
Relational: `patients`, `visits`, `turns`, `flags`, `nurse_actions` (audit log).
Time-series hypertable: `checkins` (the child's own reports over the wait — the "getting worse" signal).
Cache: `tts_cache` (hash → audio BYTEA; `002_tts_cache.sql`), because Vercel Functions have no persistent disk.

Migration `003_conversation_alerts.sql` (applied) removed the old summaries/levels/scores/game tables and added:
- `visits.tree_id`, `parent_answers` (JSONB), `parent_confirmed_at`, `called_in_at`, `origin` (`kiosk` | `seed`)
- `turns.question` (the question as asked) and `turns.input` (`tap` | `voice` | `text` | `skip`)
- `flags.key` + `UNIQUE (visit_id, key)` — alerts are inserted with `ON CONFLICT DO NOTHING`
- `checkins.note_en`
- continuous aggregate `checkins_5m` (avg/max pain, worse count per visit per 5 min, real-time)

Rules: never edit an applied migration — add `004_…`. All SQL lives in `apps/api/src/db/visits.ts`. Use `id::int` when selecting BIGSERIAL ids (postgres.js returns them as strings otherwise). Default timestamps to the DB clock (`coalesce(${at}::timestamptz, now())`) — mixing laptop and DB clocks reorders conversations.

The full DDL is in `apps/api/src/db/migrations/001_init.sql` — that file is the source of truth.

Key enums (TEXT columns):
- `visits.status`: `waiting | in_room | done`
- `turns.speaker`: `ralph | child | parent`
- `flags.kind`: `red_flag | deterioration | safeguarding | unresponsive`
- `checkins.feeling`: `better | same | worse | no_response`

## Seed
`pnpm db:seed` replaces the 6 `origin = 'seed'` background kids (Wei zh-CN, Liam en, Priya hi, Mateo es, Ava en parent-mode, Chloé fr — data in `seed-data.ts`). It runs them through the real engine with back-dated timestamps, so their alerts come from the real rules. It never touches kiosk visits. **Maya is not seeded** — she checks in live in the demo. Demo routes can reset and re-seed.
