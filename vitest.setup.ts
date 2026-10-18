// Load the root .env (if present) so API integration tests can reach Tiger + Gemini.
// Tests that need the DB skip themselves when DATABASE_URL is missing.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tests don't call Gemini (free, deterministic; Ralph uses offline replies). Set
// RALPH_TEST_LIVE_AI=1 to run against the real model. loadEnvFile won't override this.
if (!process.env.RALPH_TEST_LIVE_AI) process.env.GEMINI_API_KEY = '';

// Test-only staff sign-in (never the real accounts or secret).
process.env.STAFF_ACCOUNTS = '9001:1234:Test Nurse;9002:5678:Test Doctor';
process.env.SESSION_SECRET = 'test-only-session-secret-0123456789';

const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
