// `pnpm tts:warm` — pre-generate Ralph's fixed lines so they play instantly in the demo
// (first-time generation takes ~4 s). Skips lines already cached; safe to re-run.
// The kiosk asks for exactly these strings, so the cache keys match.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RED_FLAG_REPLY, SAFEGUARDING_REPLY, TREES } from '@ralph/shared';
import { synthesize, ttsAvailable, ttsHash } from '../ai/voice.js';
import { requireDb } from '../db/client.js';
import { hasTts, putTts } from '../db/tts.js';

const enPath = fileURLToPath(new URL('../../../web/src/i18n/en.json', import.meta.url));
const en = JSON.parse(await readFile(enPath, 'utf8')) as Record<string, any>;

/**
 * Fixed kiosk lines Ralph says (no {{placeholders}} — those can't be pre-generated), in the
 * order a demo hears them: the free tier allows ~10 clips a day, so the first ones matter most.
 * Chat replies aren't here: they're made up live (browser voice unless TTS_ON_DEMAND).
 */
const FIXED_LINES = [
  en.welcome.greeting,
  en.complaint.ask,
  en.ralph.thanks,
  ...Object.values(TREES.tummy!.nodes).map((n) => n.ask),
  en.talk.tryTapping.body_map,
  en.talk.notHeard,
  en.checkin.ask,
  en.checkin.face,
  en.talk.tryTapping.faces,
  en.talk.tryTapping.other,
  en.games.fireflyTap.doneSpeech,
  en.games.cyber.bootDoneSpeech,
  en.games.cyber.doneSpeech,
  en.games.cyber.timeUpSpeech,
  en.goodbye.spoken,
  SAFEGUARDING_REPLY.en,
  ...Object.values(TREES).flatMap((tree) => Object.values(tree.nodes).map((n) => n.ask)),
  ...Object.values(SAFEGUARDING_REPLY),
  ...Object.values(RED_FLAG_REPLY),
].filter((l): l is string => typeof l === 'string' && !l.includes('{{'));

const lines = [...new Set(FIXED_LINES)];

const PACE_MS = 21_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  // Free tier: 3 TTS requests a minute, so pace them (and retry once after a pause).
  let audio = await synthesize(text);
  if (!audio) {
    await sleep(PACE_MS);
    audio = await synthesize(text);
  }
  if (lines.slice(i + 1).length) await sleep(PACE_MS);
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
