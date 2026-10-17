---
name: api-and-ai
description: RALPH Fastify API endpoints, Socket.IO events, Gemini prompts (Ralph persona, interpretation, staff summary, nurse briefing), and environment variables. Use when working in apps/api/src/routes, apps/api/src/ai, realtime, or env config.
---

# API + AI

## Endpoints (Fastify, JSON unless noted)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/visits` | Create patient + visit (kiosk start) |
| POST | `/api/visits/:id/complaint` | Set chief complaint → first node |
| POST | `/api/visits/:id/turns/audio` | Multipart audio → transcript + interpretation + next node |
| POST | `/api/visits/:id/turns/tap` | Tap answer → next node |
| POST | `/api/visits/:id/parent` | Parent confirm/edit + parent-only answers |
| POST | `/api/visits/:id/checkins` | Check-in result |
| POST | `/api/visits/:id/games` | Batch of game events + round summary |
| GET | `/api/staff/queue` | Sorted queue |
| GET | `/api/staff/visits/:id` | Full patient view incl. trends |
| POST | `/api/staff/visits/:id/briefing` | Generate/return briefing text + audio URL |
| POST | `/api/staff/visits/:id/actions` | Confirm level, mark seen, note, acknowledge flag |
| POST | `/api/tts` | `{text, voice, lang}` → audio URL (cached) |
| POST | `/api/demo/*` | Seed, reset, fast-forward, inject deterioration (only when `DEMO_MODE=true`) |

Socket.IO (server → staff): `queue:update`, `visit:update`, `flag:new`. Kiosk responses must never contain safeguarding flags.

## Gemini
- SDK: `@google/genai`. Check current docs for call shape (some newer docs use an "Interactions API").
- Model IDs only from env. Low temperature for interpretation/summary; slightly higher for Ralph reactions.
- Every response Zod-validated; retry once, then fall back.

## Prompts (`apps/api/src/ai/prompts.ts`)
**Ralph persona (system):** You are Ralph, a gentle, playful character helping a child aged {age} in a hospital waiting room. Use very short sentences (≤ 20 words), simple words, warm tone, in {language}. Never mention diagnoses, diseases, needles, or anything scary. Never give medical advice. Only react to the child's answer and stay on the current question. If the child says something suggesting someone is hurting them or they're unsafe, set safeguarding_concern=true. (The reply shown is the fixed pre-translated `safeguarding_reply`, chosen by code — not the model's text.)

**Interpretation (per turn):** map transcript to node's options/slot; return the JSON contract in the `triage-engine` skill exactly.

**Staff summary:** from structured slots, check-ins, scores, flags only (never free invention) → JSON: `chief_complaint_quote`, `chief_complaint_en`, `history_from_parent[]`, `positives[]`, `negatives[]`, `red_flags[]`, `suggested_level`, `level_reasons[]`, `trend_sentence`, `conversation_opener`. No diagnosis or "likely condition". Never include safeguarding content.

**Briefing script:** ≤ 55 words, spoken style: name + age → complaint → red flags → trend → suggested level. Example: "Maya, six. Tummy pain since this morning, now on the lower right. Vomited twice. Pain went from two to four in forty minutes and reaction time dropped by a third. Suggested level two. Please reassess." Never mention safeguarding (audio may be overheard).

## Env (`.env.example` is the source of truth)
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_STT_MODEL`, `GEMINI_TTS_MODEL`, `RALPH_VOICE`, `NURSE_VOICE`, `DATABASE_URL`, `PUBLIC_BASE_URL`, `CHECKIN_INTERVAL_SEC`, `DEMO_MODE`, `SUPPORTED_LANGS`, `PORT`.
