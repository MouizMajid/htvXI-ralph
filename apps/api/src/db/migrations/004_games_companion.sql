-- Firefly Tap + Cyber Circuit games, round summaries, companion check-in source.
-- Runs after 003_conversation_alerts.sql (which dropped the old game_events table).

CREATE TABLE IF NOT EXISTS game_events (
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  game TEXT NOT NULL CHECK (game IN ('bubble_pop', 'firefly', 'ralph_says', 'firefly_tap', 'cyber_circuit')),
  round INT NOT NULL,
  reaction_ms INT,
  hit BOOLEAN,
  hand TEXT,
  phase TEXT,
  accuracy_px REAL,
  label TEXT
);
CREATE INDEX IF NOT EXISTS game_events_visit_idx ON game_events (visit_id, at DESC);

-- One row per finished game round: summary numbers + nurse-facing notes + score reasons.
CREATE TABLE IF NOT EXISTS game_rounds (
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  game TEXT NOT NULL,
  handedness TEXT,
  summary JSONB NOT NULL,
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS game_rounds_visit_idx ON game_rounds (visit_id, game, at);

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS source TEXT;  -- companion | game | timer
