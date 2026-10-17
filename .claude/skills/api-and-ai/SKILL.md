---
name: api-and-ai
description: RALPH Fastify API endpoints, dashboard polling, Gemini usage (Ralph persona, per-turn interpretation + English translation, TTS), environment variables, and the Vercel deployment. Use when working in apps/api, apps/api/src/ai, env config, or deploying.
---

# API + AI

## Endpoints (Fastify, JSON unless noted)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/visits` | Create patient + visit (kiosk start) |
| GET | `/api/visits/:id/status` | Kiosk polls this: `waiting` / `in_room` (→ goodbye screen), check-in due? |
| POST | `/api/visits/:id/complaint` | Set chief complaint → first node |
| POST | `/api/visits/:id/turns/audio` | Multipart audio → transcript + interpretation + next node |
| POST | `/api/visits/:id/turns/tap` | Tap answer → next node |
| POST | `/api/visits/:id/parent` | Parent confirm/edit + parent-only answers |
| POST | `/api/visits/:id/checkins` | Check-in result (better/same/worse/no_response + face) |
| GET | `/api/staff/queue` | Queue: alerts first, then arrival |
| GET | `/api/staff/visits/:id` | Patient view: answers, conversation, check-ins, alerts |
| POST | `/api/staff/visits/:id/actions` | `call_in`, `acknowledge_flag` (logged in `nurse_actions`) |
| POST | `/api/tts` | `{text, lang}` → `{ url: "/api/tts/<hash>" }` (generates + stores in `tts_cache` if missing) |
| GET | `/api/tts/:hash` | Cached audio bytes, long `Cache-Control` |
| POST | `/api/demo/*` | Seed, reset, fast-forward, inject "getting worse" (only when `DEMO_MODE=true`) |

Games send nothing to the API (entertainment only).

**Live updates = polling.** No WebSockets (Vercel Functions). Staff views use TanStack Query `refetchInterval: LIVE_POLL_MS` (2.5 s); the kiosk polls `/status` the same way. New-alert detection (pulse + chime) is client-side by diffing flag ids. Keep polled endpoints cheap. Kiosk responses must never contain flags of any kind.

## Gemini — the child side only
The staff side uses **no AI**. Gemini is used for exactly three things:
1. **Transcribe** the child's clip (`GEMINI_STT_MODEL`).
2. **Interpret + translate** each turn (`GEMINI_MODEL`, low temperature): map to the node's slot, write Ralph's short reaction, give `text_en`. Contract in the `triage-engine` skill.
3. **Ralph's voice** (`GEMINI_TTS_MODEL`, `RALPH_VOICE`).

- SDK: `@google/genai`. Model IDs only from env.
- Every response Zod-validated; retry once, then fall back (tap options / browser `speechSynthesis`).
- Tree questions + UI strings are pre-translated at build time, never at request time.

## Prompts (`apps/api/src/ai/prompts.ts`)
**Ralph persona (system):** You are Ralph, a gentle, playful character helping a child aged {age} in a hospital waiting room. Use very short sentences (≤ 20 words), simple words, warm tone, in {language}. Never mention diagnoses, diseases, needles, or anything scary. Never give medical advice. Only react to the child's answer and stay on the current question. If the child says something suggesting someone is hurting them or they're unsafe, set safeguarding_concern=true. (The reply shown is the fixed pre-translated `safeguarding_reply`, chosen by code — not the model's text.)

**Interpretation (per turn):** map the transcript to the node's options/slot; translate the child's words faithfully to English in `text_en` (keep the child's phrasing — "my tummy hurts really bad", not "severe abdominal pain"); return the JSON contract exactly.

## Vercel deployment
- Two Vercel projects from the same GitHub repo:
  - **`ralph-api`** — Root Directory `apps/api`. Framework auto-detected as Fastify from `src/index.ts` (which calls `listen`). All env vars from `.env.example` (except `PORT`) go in its Environment Variables.
  - **`ralph-web`** — Root Directory `apps/web`, Vite preset. `apps/web/vercel.json` rewrites `/api/:path*` to the API project's production URL, then falls back to `/index.html`. **If the API project's URL isn't `ralph-api.vercel.app`, update that rewrite.**
- Serverless rules: no in-memory state or `setInterval` between requests (check-in timing is driven by the kiosk client + `CHECKIN_INTERVAL_SEC`); no writing files (use Postgres); DB pool `max: 3`; body ≤ 4.5 MB.
- Every push to a branch gets a preview URL; `main` → production.

## Env (`.env.example` is the source of truth)
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_STT_MODEL`, `GEMINI_TTS_MODEL`, `RALPH_VOICE`, `DATABASE_URL`, `PUBLIC_BASE_URL`, `CHECKIN_INTERVAL_SEC`, `DEMO_MODE`, `SUPPORTED_LANGS`, `PORT` (local only). `pnpm check` verifies Gemini + Tiger connectivity without printing secrets.
