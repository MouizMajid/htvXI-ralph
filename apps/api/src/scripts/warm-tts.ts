// `pnpm tts:warm` — pre-generate Ralph's fixed lines so they play instantly in the demo
// (first-time generation takes ~4 s). Skips lines already cached; safe to re-run.
// The kiosk asks for exactly these strings, so the cache keys match.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SAFEGUARDING_REPLY, TREES } from '@ralph/shared';
import { synthesize, ttsAvailable, ttsHash } from '../ai/voice.js';
import { requireDb } from '../db/client.js';
import { hasTts, putTts } from '../db/tts.js';

const enPath = fileURLToPath(new URL('../../../web/src/i18n/en.json', import.meta.url));
const en = JSON.parse(await readFile(enPath, 'utf8')) as Record<string, Record<string, string>>;

/** Fixed kiosk lines Ralph says (no {{placeholders}} — those can't be pre-generated). */
const FIXED_LINES = [
  en.complaint?.ask,
  en.ralph?.thanks,
  en.talk?.tryTapping,
  en.checkin?.ask,
  en.companion?.didntCatch,
  ...Object.values(SAFEGUARDING_REPLY),
  ...Object.values(TREES).flatMap((tree) => Object.values(tree.nodes).map((n) => n.ask)),
].filter((l): l is string => Boolean(l) && !l!.includes('{{'));

const lines = [...new Set(FIXED_LINES)];

if (!ttsAvailable()) {
  console.error('Gemini TTS is not configured (GEMINI_API_KEY / GEMINI_TTS_MODEL).');
  process.exit(1);
}

let made = 0;
let skipped = 0;
let failed = 0;
for (const [i, text] of lines.entries()) {
  const hash = ttsHash(text);
  const label = `[${i + 1}/${lines.length}] ${text.slice(0, 60)}`;
  if (await hasTts(hash)) {
    skipped++;
    console.log(`${label}  (cached)`);
    continue;
  }
  const audio = await synthesize(text);
  if (!audio) {
    failed++;
    console.log(`${label}  FAILED (will use the browser voice)`);
    continue;
  }
  await putTts(hash, 'audio/wav', audio);
  made++;
  console.log(`${label}  ✓ ${Math.round(audio.length / 1024)} KB`);
}

console.log(`\nDone: ${made} generated, ${skipped} already cached, ${failed} failed.`);
await requireDb().end();
process.exit(failed ? 1 : 0);
