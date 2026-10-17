---
name: database
description: RALPH database on Tiger Data (Postgres + TimescaleDB) — schema, hypertables for check-ins and game telemetry, continuous aggregates for trends, migrations, and synthetic seed data. Use when working in apps/api/src/db, writing SQL, or touching seed/demo data.
---

# Database (Tiger Cloud free plan)

- Client: `postgres` (porsager). Plain SQL migrations in `apps/api/src/db/migrations/NNN_name.sql`, run in order by a small runner script.
- `DATABASE_URL` from env, `sslmode=require`.
- Verify hypertable / cagg syntax against current Tiger Data docs before relying on it.
- **Synthetic data only**; every patient has `is_synthetic = true`.

## Schema
Relational: `patients`, `visits`, `turns`, `flags`, `summaries`, `nurse_actions` (audit log; overrides always logged).
Time-series hypertables: `checkins`, `game_events`.
Continuous aggregate: `game_metrics_2m` with `materialized_only = false` (real-time, so fresh demo data shows instantly) + a refresh policy.

The full DDL is in `apps/api/src/db/migrations/001_init.sql` — that file is the source of truth.

Key enums (TEXT columns):
- `visits.status`: `waiting | in_room | done`
- `visits.score_band`: `stable | watch | escalate`
- `turns.speaker`: `ralph | child | parent`
- `flags.kind`: `red_flag | deterioration | safeguarding | unresponsive`
- `checkins.feeling`: `better | same | worse | no_response`
- `game_events.game`: `bubble_pop | firefly | ralph_says`

## Seed
~6 synthetic visits (incl. Maya, 6, tummy — the demo star) and thousands of game/check-in events so charts look alive. Demo routes can reset and re-seed.
