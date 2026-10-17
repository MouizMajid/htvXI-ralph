-- Firefly Tap + Cyber Circuit games, round summaries, companion check-in source.

ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_game_check;
ALTER TABLE game_events ADD CONSTRAINT game_events_game_check
  CHECK (game IN ('bubble_pop', 'firefly', 'ralph_says', 'firefly_tap', 'cyber_circuit'));

ALTER TABLE game_events
  ADD COLUMN IF NOT EXISTS hand TEXT,          -- 'dominant' | 'non_dominant'
  ADD COLUMN IF NOT EXISTS phase TEXT,         -- cyber_circuit: warmup | offhand | bypass
  ADD COLUMN IF NOT EXISTS accuracy_px REAL,   -- tap distance from target centre
  ADD COLUMN IF NOT EXISTS label TEXT;         -- cyber_circuit node label ('7', 'C')

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
