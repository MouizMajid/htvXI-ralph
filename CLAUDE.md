# RALPH — Rapid Assessment for Little Patients in Healthcare

Hack the Valley 11 (Toronto, Oct 2026) weekend prototype. **Synthetic data only. Not a medical device. Never gives a diagnosis.**

Ralph is a hand-drawn **raccoon** on a waiting-room tablet who talks with kids (STT + TTS), asks adaptive symptom questions, keeps them busy with simple fun games, and checks in every few minutes ("better, same, or worse?"). The staff side is **not AI**: it hands the nurse the child's whole conversation as readable English text, plus a few plain-language alerts. The nurse triages and talks to the child **in person** ("Ralph told me you were feeling sick — want to tell me more?"); RALPH's job ends when the child is called in.
**Core claim:** kids' own words reach the care team before the nurse walks over, and a child who says they're getting worse doesn't go unnoticed.

## Team & constraints
- 4 people. **Mouiz is lead dev** (with Claude Code). Others: hand-drawn art/design, pitch/video, testing + synthetic data + light frontend.
- Draft submission ~T+20h, presentation ~T+30h (T = ~1:00 AM Sat). Optimise for a working end-to-end demo first.
- Responsive website only (PWA). Kiosk = phone/iPad, staff dashboard = laptop/iPad.
- Target age **4–12**. Under-4 is supported via "parent mode" (parent answers, no games) but is not the marketed use case.
- Languages: `en`, `hi`, `es`, `fr`, `zh-CN`.

## Non-negotiable product rules
1. **No diagnosis, no triage.** RALPH outputs the conversation, structured answers, and plain-language alerts. No suggested level, no scores, no AI summaries. The nurse triages.
2. **Alerts are deterministic.** Red flags, "getting worse", and safeguarding detection live in code. The LLM only interprets answers, translates to English, and writes Ralph's friendly lines.
3. **Parent in the loop.** Parent confirms/corrects the transcript and adds facts the child can't.
4. **Every question has a tap fallback** (yes/no/not sure, body map, faces scale). Voice is optional.
5. **Ralph stays on topic.** No open chat — ask the current question, react briefly, or play a game.
6. **Safeguarding.** Possible-harm disclosure → fixed calm line, private staff flag, no follow-up questions, never shown on kiosk. See the `triage-engine` skill.
7. **Synthetic data only**, including the demo.
8. **No copyrighted art or clinical tools.** Team's own drawings; no Wong-Baker FACES. Alert rules are team-defined demo rules, labelled as such.
9. **Games are just for fun.** They keep the child occupied between check-ins; no performance metrics, no clinical claims, no alerts from games.

## Stack
TypeScript everywhere, pnpm workspaces monorepo.
- **Web:** React 18 + Vite, Tailwind (mobile-first), React Router (`/kiosk/*`, `/staff/*`), TanStack Query, Framer Motion, Recharts, i18next, `vite-plugin-pwa`. Fonts: Nunito + Noto Sans Devanagari + Noto Sans SC.
- **API:** Node 22 + Fastify, Zod, `@google/genai` (Gemini on the child side only: Transcribe STT, per-turn interpretation + English translation, Ralph's TTS; browser `speechSynthesis` fallback).
- **DB:** Tiger Data (Tiger Cloud free) — Postgres + TimescaleDB, `postgres` (porsager) client, plain SQL migrations.
- **Deploy: Vercel**, two projects from this repo. `ralph-web` (Root Directory `apps/web`, Vite) and `ralph-api` (Root Directory `apps/api`, Fastify zero-config — Vercel detects `src/index.ts` and runs it as one Function). `apps/web/vercel.json` rewrites `/api/*` → the API project, so the browser sees one origin. HTTPS is automatic (needed for mic). Custom domain from GoDaddy Registry points at `ralph-web`.
- **Staff sign-in:** badge + PIN checked on the server, signed HTTP-only cookie (`apps/api/src/auth.ts`). Every `/api/staff/*` data route requires it; kiosk routes stay open. Real hospitals: their SSO + MFA (pitch only).
- **Serverless constraints:** no WebSockets — staff dashboard and kiosk **poll** with TanStack Query (`LIVE_POLL_MS` in `apps/web/src/staff/live.ts`). No persistent disk — anything stored goes in Postgres (e.g. `tts_cache`). No in-memory state or timers between requests. Request body ≤ 4.5 MB.
- **Tests:** Vitest.
- **Gemini model IDs change often — never hard-code; read from env and verify against https://ai.google.dev/gemini-api/docs/models.**

## Repo layout
```
apps/web/            React kiosk (src/kiosk) + staff dashboard (src/staff); art in public/ralph, public/icons
apps/api/            Fastify: src/index.ts (entry), routes/, ai/, triage/, db/migrations, scripts/check.ts
packages/shared/     types.ts, schemas.ts (zod), triage/trees/*.json, triage/rules.ts, triage/safeguarding.ts
docs/                pitch, demo script, tracks, privacy, slice plan (for humans)
```

## Commands
`pnpm dev` (web :5173 + api :3001) · `pnpm test` · `pnpm typecheck` · `pnpm build` · `pnpm check` (Gemini + Tiger connectivity) · `pnpm db:migrate` · `pnpm db:seed`. Secrets live in root `.env` (gitignored; template `.env.example`) locally and in the `ralph-api` project's Environment Variables on Vercel.

## Coding conventions
- TS strict. Shared types in `packages/shared`; it is the contract between web and api.
- **In `apps/api` and `packages/shared`, relative imports end in `.js`** (`import { env } from './env.js'`) — Vercel runs compiled JS under Node's ESM rules. `pnpm typecheck` enforces it (NodeNext).
- `packages/shared` compiles to `dist/` on `pnpm install` (that's what Vercel's API loads); dev, Vite, and Vitest read the `.ts` source via the `source` export condition. If you add a shared file, nothing else is needed — but re-run `pnpm install` before testing a deploy locally.
- Zod-validate every external input and every Gemini response. Never trust LLM JSON unparsed.
- Tree, alert, and safeguarding logic are **pure functions with Vitest tests**, including Maya-scenario fixtures.
- No model IDs, keys, or URLs hard-coded — env only (`.env.example`).
- Kiosk fails soft: any API error → Ralph says "Oops, let's try tapping!" and the flow continues.
- Kiosk components stay dumb; flow state in one `useReducer` per session. Network calls only via `lib/api.ts`.
- Ralph is rendered only via `<Ralph pose=… />`; art is a drop-in PNG swap (see `kiosk-ui`). Check art at `/art`.
- Styling uses only theme tokens from `apps/web/src/index.css` — no raw colours — so restyles are one-file changes.
- **Work in slices** (see `docs/plan.md`): one cohesive portion at a time, touching only what it needs, tested, then one commit/PR. Don't drift into the next slice's files.

## Build order
Tier 1 is built as slices 0–8 in `docs/plan.md` (the current plan — check it for which slice is in progress).
Tier 2: Firewall Hacker game, fever + breathing trees, check-in timeline chart, multilingual polish. Tier 3: Live API, volume-driven lip flap, SMS.
If a Tier 1 slice slips >2 h, cut Tier 2 — not sleep.

## Where the detail lives
Skills in `.claude/skills/` (load the relevant one before working in that area):
- `triage-engine` — tree format, per-turn AI contract, alerts (red flag / getting worse / not responding), **safeguarding**
- `kiosk-ui` — child flow, games + check-ins, art, theming, staff dashboard (conversation view)
- `speech-i18n` — STT/TTS pipeline, caching, translation + multilingual rules
- `database` — Tiger/Timescale schema, check-ins hypertable, migrations, seed
- `api-and-ai` — endpoints, polling, Gemini usage, env vars, Vercel deploy

Human docs in `docs/`: `pitch.md` (pitch, demo script, tracks, privacy/ethics), `plan.md` (**slice plan + status**, decisions log, open questions).
