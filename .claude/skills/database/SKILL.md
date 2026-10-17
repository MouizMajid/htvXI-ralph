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

**Pending cleanup (migration `003`, done in slice 2):** the product no longer has AI summaries, suggested levels, scores, or game metrics. Drop `summaries`, `visits.suggested_level/confirmed_level/current_score/score_band`, `game_events`, and the `game_metrics_2m` aggregate. Replace with a continuous aggregate over `checkins` (e.g. per-visit pain face per 5 min, `materialized_only = false`) for the check-in timeline. Never edit `001_init.sql` — it's already applied.

The full DDL is in `apps/api/src/db/migrations/001_init.sql` — that file is the source of truth.

Key enums (TEXT columns):
- `visits.status`: `waiting | in_room | done`
- `turns.speaker`: `ralph | child | parent`
- `flags.kind`: `red_flag | deterioration | safeguarding | unresponsive`
- `checkins.feeling`: `better | same | worse | no_response`

## Seed
~6 synthetic visits (incl. Maya, 6, tummy — the demo star) with full conversations, parent answers, and a few hours of check-ins, so the queue and patient views look real. Demo routes can reset and re-seed.
