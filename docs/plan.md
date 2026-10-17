# RALPH — Build plan, decisions, open questions

## How we build
One **slice** at a time. Each slice is one cohesive portion that touches only the files it needs, ends with tests passing (and a device check for UI), and lands as one commit / PR (branch `slice-N-name` → `main`, Vercel gives each PR a preview URL). We don't start the next slice until the current one is green.

`packages/shared` (types, Zod schemas, pure tree/alert logic) is the contract between web and api, so the two sides stay decoupled.

## Tier 1 slices

| # | Slice | Touches only | Done when | Status |
|---|---|---|---|---|
| 0 | **Baseline + deploy smoke test** | git, Vercel projects | Committed + pushed; Vercel `ralph-api` `/api/health` returns `db: ok` through `ralph-web` | 🟡 works on preview; merge PR to finish |
| 1 | **Conversation + alert core** | `packages/shared` | Full tummy tree; red-flag, getting-worse, not-responding rules; safeguarding phrase check. Vitest: Maya's path, each rule, safeguarding positive + benign | 🟡 PR open |
| 2 | **Visit API + seed** | `apps/api` routes + db, migration `003` cleanup | Create visit, complaint, tap turn, parent answers, check-ins, staff reads, call-in — tested with Fastify `inject` against Tiger; seed creates Maya + 5 synthetic kids | ⬜ |
| 3 | **Kiosk tap flow** | `apps/web/src/kiosk` (not games) | Welcome → language → who's here → complaint → tree (yes/no, choice, body map, faces) → parent confirm → waiting → goodbye on call-in. Reducer unit tests + browser click-through + phone check | ⬜ |
| 4 | **Staff dashboard** | `apps/web/src/staff` | Queue (alerts first, then arrival) + patient view (alerts, answers table, conversation, check-ins, call-in), polling 2.5 s. Phone check-in appears on laptop within 3 s | ⬜ |
| | **Milestone A — tap-only demo works end to end; deploy** | | | |
| 5 | **Ralph speaks** | TTS route, pre-gen script, audio player, `<Ralph pose="talk">` sync | Fixed lines play instantly from cache; dynamic lines cached in Tiger; no key → browser voice fallback | ⬜ |
| 6 | **Ralph listens** | recorder, `/turns/audio`, `apps/api/src/ai` | Hold-to-talk → transcript → interpretation + English translation → next node. Tested with recorded clips; Zod retry + tap fallback; safeguarding OR-logic | ⬜ |
| 7 | **Waiting room: Firefly Tap + check-ins** | `kiosk/games`, waiting screen, check-in UI | Fun game rounds; check-in due every `CHECKIN_INTERVAL_SEC` appears at end of a round; "worse"/face changes raise getting-worse alerts on the dashboard | ⬜ |
| 8 | **Demo panel + production** | `DemoPanel`, demo routes, domain | Scripted Maya scenario runs 3× in a row on the production URL | ⬜ |
| | **Milestone B — Tier 1 done → draft submission** | | | |

**Tier 2 (after draft):** Firewall Hacker (numbers in two colours, ages ~8+), fever + breathing trees, check-in timeline chart (Tiger continuous aggregate), multilingual polish + reviewed safeguarding lists.

## Parallel work for teammates
- **Art:** Ralph frames now; then body map, faces 0–5, complaint icons (needed by slice 3), firefly + jar + stickers (slice 7). Placeholders cover gaps; check at `/art`.
- **Synthetic data:** write Maya + 5 other kid scenarios as plain text (age, complaint, what they'd say, parent answers, how check-ins go) before slice 2.
- **Language speakers:** review UI strings + `safeguarding_reply`, and write the safeguarding phrase list for their language before slice 1 is finalised.
- **Testing:** try each finished slice's preview URL on real phones + iPads.

## Decided
- 4-person team; Mouiz is lead developer. Draft ~20 h after start, presentation ~30 h.
- Ralph is a raccoon. Responsive website / PWA for phone, iPad, laptop.
- Languages: English, Hindi, Spanish, French, Mandarin (Simplified). Child answers are translated to English for staff (Gemini), shown next to the original words.
- Marketed for ages 4–12; under-4 allowed via parent mode.
- **Staff side has no AI.** It shows the child's conversation as readable text, structured answers, check-ins, and alerts. No summaries, suggested levels, scores, or audio briefings. The nurse triages and talks to the child **in person**; RALPH's job ends at "Call in".
- **Alerts kept (deterministic):** red flags from answers, "getting worse" from check-ins, "not responding" to check-ins, and the private safeguarding flag. Queue = alerts first, then arrival.
- **Games are entertainment only** (Firefly Tap in Tier 1, Firewall Hacker with numbers + colours in Tier 2). No metrics, no clinical claims. Ralph checks in every few minutes, between rounds.
- Safeguarding: deterministic phrase list **OR** LLM signal; fixed pre-translated reply; staff-only flag.
- **Hosting: Vercel**, not Vultr. Two projects (`ralph-web`, `ralph-api`); polling instead of WebSockets; TTS cache in Postgres.
- Gemini + Tiger set up and verified (`pnpm check`); migrations `001`, `002` applied.

## Still open
- Gemini free-tier rate limits (watch during rehearsal)
- Domain name (GoDaddy Registry via MLH code) → point at `ralph-web`
- Which teammate reviews each non-English language
