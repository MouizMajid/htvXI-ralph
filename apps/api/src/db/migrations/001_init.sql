-- RALPH initial schema. Synthetic data only.
-- Verify hypertable / continuous-aggregate syntax against current Tiger Data docs.

-- ---------- relational ----------

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  age_years NUMERIC(4,1) NOT NULL,
  weight_kg NUMERIC(5,1),
  language TEXT NOT NULL DEFAULT 'en',
  is_synthetic BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  site TEXT NOT NULL DEFAULT 'demo-paeds-er',
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chief_complaint TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'in_room', 'done')),
  parent_mode BOOLEAN NOT NULL DEFAULT FALSE,
  current_node TEXT,
  slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_level SMALLINT CHECK (suggested_level BETWEEN 1 AND 5),
  confirmed_level SMALLINT CHECK (confirmed_level BETWEEN 1 AND 5),
  current_score SMALLINT NOT NULL DEFAULT 0,
  score_band TEXT NOT NULL DEFAULT 'stable'
    CHECK (score_band IN ('stable', 'watch', 'escalate'))
);
CREATE INDEX visits_status_idx ON visits (status);

CREATE TABLE turns (
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  node_id TEXT,
  speaker TEXT NOT NULL CHECK (speaker IN ('ralph', 'child', 'parent')),
  text_original TEXT,
  text_en TEXT,
  slot TEXT,
  slot_value JSONB,
  confidence REAL
);
CREATE INDEX turns_visit_idx ON turns (visit_id, at);

CREATE TABLE flags (
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL
    CHECK (kind IN ('red_flag', 'deterioration', 'safeguarding', 'unresponsive')),
  reason TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX flags_visit_idx ON flags (visit_id, at);

CREATE TABLE summaries (
  visit_id UUID PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary JSONB,
  briefing_text TEXT,
  briefing_audio_url TEXT
);

CREATE TABLE nurse_actions (
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  payload JSONB
);

-- ---------- time-series (hypertables) ----------

CREATE TABLE checkins (
  visit_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  pain_face SMALLINT CHECK (pain_face BETWEEN 0 AND 5),
  feeling TEXT CHECK (feeling IN ('better', 'same', 'worse', 'no_response')),
  note TEXT
);
SELECT create_hypertable('checkins', by_range('at'));
CREATE INDEX checkins_visit_idx ON checkins (visit_id, at DESC);

CREATE TABLE game_events (
  visit_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('bubble_pop', 'firefly', 'ralph_says')),
  round INT NOT NULL,
  reaction_ms INT,
  hit BOOLEAN,
  tracking_err_px REAL,
  seq_len INT
);
SELECT create_hypertable('game_events', by_range('at'));
CREATE INDEX game_events_visit_idx ON game_events (visit_id, at DESC);

-- ---------- continuous aggregate (trend charts + scoring) ----------

CREATE MATERIALIZED VIEW game_metrics_2m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT visit_id,
       time_bucket('2 minutes', at) AS bucket,
       game,
       avg(reaction_ms)      AS avg_reaction_ms,
       avg(hit::int)         AS hit_rate,
       avg(tracking_err_px)  AS avg_tracking_err,
       max(seq_len)          AS best_seq
FROM game_events
GROUP BY visit_id, bucket, game
WITH NO DATA;

SELECT add_continuous_aggregate_policy('game_metrics_2m',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '2 minutes',
  schedule_interval => INTERVAL '1 minute');
