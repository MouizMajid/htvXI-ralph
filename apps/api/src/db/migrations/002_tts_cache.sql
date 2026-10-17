-- Dynamic TTS audio cache. Vercel functions have no persistent disk, so audio
-- lives in Postgres, keyed by sha256(voice | lang | text), served by GET /api/tts/:hash.
CREATE TABLE tts_cache (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  audio BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
