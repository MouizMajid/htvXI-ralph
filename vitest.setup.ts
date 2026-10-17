// Load the root .env (if present) so API integration tests can reach Tiger + Gemini.
// Tests that need the DB skip themselves when DATABASE_URL is missing.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
