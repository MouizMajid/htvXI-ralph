// Load the root .env (if present) so API integration tests can reach Tiger + Gemini.
// Tests that need the DB skip themselves when DATABASE_URL is missing.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tests don't call Gemini (free, deterministic; Ralph uses offline replies). Set
// RALPH_TEST_LIVE_AI=1 to run against the real model. loadEnvFile won't override this.
if (!process.env.RALPH_TEST_LIVE_AI) process.env.GEMINI_API_KEY = '';

const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
