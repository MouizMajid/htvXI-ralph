-- Slice 2: schema for the "conversation + alerts, nurse triages" product.
-- Removes the old AI-summary / suggested-level / score / game-metrics design.

DROP MATERIALIZED VIEW IF EXISTS game_metrics_2m;
DROP TABLE IF EXISTS game_events;
DROP TABLE IF EXISTS summaries;

ALTER TABLE visits
  DROP COLUMN IF EXISTS suggested_level,
  DROP COLUMN IF EXISTS confirmed_level,
  DROP COLUMN IF EXISTS current_score,
  DROP COLUMN IF EXISTS score_band,
  ADD COLUMN tree_id TEXT,
  ADD COLUMN parent_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN parent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN called_in_at TIMESTAMPTZ,
  -- 'kiosk' = real check-in, 'seed' = synthetic background kids (re-created by `pnpm db:seed`)
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'kiosk' CHECK (origin IN ('kiosk', 'seed'));

-- Turns: keep the question asked and how the answer came in, so staff read a real conversation.
ALTER TABLE turns
  ADD COLUMN question TEXT,
  ADD COLUMN input TEXT CHECK (input IN ('tap', 'voice', 'text', 'skip'));

-- Alerts: a stable key per finding so re-evaluating never duplicates (see triage-engine skill).
ALTER TABLE flags ADD COLUMN key TEXT;
UPDATE flags SET key = kind || ':' || id WHERE key IS NULL;
ALTER TABLE flags ALTER COLUMN key SET NOT NULL;
ALTER TABLE flags ADD CONSTRAINT flags_visit_key_unique UNIQUE (visit_id, key);

-- Check-ins: English version of anything said (voice check-ins later).
ALTER TABLE checkins ADD COLUMN note_en TEXT;

-- Check-in timeline per child (Tier 2 chart + Tiger track). Real-time so fresh check-ins show at once.
CREATE MATERIALIZED VIEW checkins_5m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT visit_id,
       time_bucket('5 minutes', at) AS bucket,
       avg(pain_face)                              AS avg_pain,
       max(pain_face)                              AS max_pain,
       count(*) FILTER (WHERE feeling = 'worse')   AS worse_count,
       count(*)                                    AS checkin_count
FROM checkins
GROUP BY visit_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('checkins_5m',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '1 minute');
