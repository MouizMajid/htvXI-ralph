# RALPH — Rapid Assessment for Little Patients in Healthcare

Hack the Valley 11 (Toronto, Oct 2026) weekend prototype. **Synthetic data only. Not a medical device. Never gives a diagnosis.**

Ralph is a hand-drawn **raccoon** on a waiting-room tablet who talks with kids (STT + TTS), asks adaptive symptom questions, and plays short games that double as alertness checks. Nurses get a live dashboard: queue sorted by suggested urgency, summary in the child's own words, trends, red-flag alerts that explain **why**, and a 15 s audio briefing.
**Core claim:** help the care team catch a child getting worse sooner.

## Team & constraints
- 4 people. **Mouiz is lead dev** (with Claude Code). Others: hand-drawn art/design, pitch/video, testing + synthetic data + light frontend.
- Draft submission ~T+20h, presentation ~T+30h (T = ~1:00 AM Sat). Optimise for a working end-to-end demo first.
- Responsive website only (PWA). Kiosk = phone/iPad, staff dashboard = laptop/iPad.
- Target age **4–12**. Under-4 is supported via "parent mode" (parent answers, no games) but is not the marketed use case.
- Languages: `en`, `hi`, `es`, `fr`, `zh-CN`.

## Non-negotiable product rules
1. **No diagnosis.** Output = structured symptom summary, red-flag alerts, *suggested* priority. UI says "Suggested — nurse to confirm."
2. **Safety logic is deterministic.** Red flags, triage level, scoring, and safeguarding detection live in code. The LLM interprets answers and writes friendly language; it never decides urgency alone.
3. **Parent in the loop.** Parent confirms/corrects the transcript and adds facts the child can't.
4. **Every question has a tap fallback** (yes/no/not sure, body map, faces scale). Voice is optional.
5. **Ralph stays on topic.** No open chat — ask the current question, react briefly, or play a game.
6. **Safeguarding.** Possible-harm disclosure → fixed calm line, private staff flag, no follow-up questions, never shown on kiosk. See the `triage-engine` skill.
7. **Synthetic data only**, including the demo.
8. **No copyrighted art or clinical tools.** Team's own drawings; no Wong-Baker FACES. Triage rules are team-defined demo rules, labelled as such.

## Stack
TypeScript everywhere, pnpm workspaces monorepo, one deploy.
- **Web:** React 18 + Vite, Tailwind (mobile-first), React Router (`/kiosk/*`, `/staff/*`), TanStack Query, Socket.IO client, Framer Motion, Recharts, i18next, `vite-plugin-pwa`. Fonts: Nunito + Noto Sans Devanagari + Noto Sans SC.
- **API:** Node 22 + Fastify, Socket.IO, Zod, `@google/genai` (Gemini for interpretation, summaries, Transcribe STT, TTS; browser `speechSynthesis` fallback).
- **DB:** Tiger Data (Tiger Cloud free) — Postgres + TimescaleDB, `postgres` (porsager) client, plain SQL migrations.
- **Deploy:** Vultr VM, Docker Compose, Caddy (HTTPS required for mic), GoDaddy Registry domain.
- **Tests:** Vitest.
- **Gemini model IDs change often — never hard-code; read from env and verify against https://ai.google.dev/gemini-api/docs/models.**

## Repo layout
```
apps/web/            React kiosk (src/kiosk) + staff dashboard (src/staff); art in public/ralph, public/icons
apps/api/            Fastify: routes/, ai/, triage/, scoring/, db/migrations, realtime.ts
packages/shared/     types.ts, schemas.ts (zod), triage/trees/*.json, triage/rules.ts, triage/safeguarding.ts
docs/                pitch, demo script, tracks, privacy, schedule (for humans; not needed for coding)
```

## Coding conventions
- TS strict. Shared types in `packages/shared`.
- Zod-validate every external input and every Gemini response. Never trust LLM JSON unparsed.
- Triage, scoring, and safeguarding logic are **pure functions with Vitest tests**, including Maya-scenario fixtures.
- No model IDs, keys, or URLs hard-coded — env only (`.env.example`).
- Kiosk fails soft: any API error → Ralph says "Oops, let's try tapping!" and the flow continues.
- Kiosk components stay dumb; flow state in one `useReducer` per session.
- Ralph is rendered only via `<Ralph pose=… />`; art is a drop-in PNG swap (see `kiosk-ui`). Check art at `/art`.
- Styling uses only theme tokens from `apps/web/src/index.css` — no raw colours — so restyles are one-file changes.
- Commit small and often; the team works in parallel.

## Build order — Tier 1 (must ship)
1. Monorepo scaffold, env, Tiger connection, migrations, seed
2. Kiosk: welcome → complaint → tummy tree with taps → parent confirm
3. Push-to-talk → Transcribe → interpretation → next node
4. Ralph TTS (pre-generated fixed lines + dynamic fallback)
5. Rules engine + suggested level + safeguarding detector
6. Staff queue + patient view + summary, realtime
7. Bubble Pop + check-ins + deterioration score with reasons
8. Demo panel + scripted Maya scenario
9. Deploy to Vultr behind Caddy on the domain

Tier 2: fever + breathing trees, Firefly + Ralph Says, briefing audio, trend charts, multilingual. Tier 3: Live API, volume-driven lip flap, SMS, nurse mobile view.
If a Tier 1 item slips >2 h, cut Tier 2 — not sleep.

## Where the detail lives
Skills in `.claude/skills/` (load the relevant one before working in that area):
- `triage-engine` — tree format, per-turn AI contract, red flags, suggested level, deterioration score, **safeguarding**
- `kiosk-ui` — child flow, games, art filenames, visual style, staff dashboard UI
- `speech-i18n` — STT/TTS pipeline, caching, multilingual rules
- `database` — Tiger/Timescale schema, hypertables, caggs, seed
- `api-and-ai` — endpoints, socket events, Gemini prompts, env vars

Human docs in `docs/`: `pitch.md` (demo script, tracks, privacy/ethics), `plan.md` (hour-by-hour schedule, decisions log, open questions).
