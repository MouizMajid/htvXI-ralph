# RALPH — Rapid Assessment for Little Patients in Healthcare

Hack the Valley 11. A friendly raccoon on a waiting-room tablet helps kids (4–12) tell the care team how they feel, and helps nurses catch a child getting worse sooner.

> Prototype. **Synthetic data only. Not a medical device. No diagnosis.** Triage rules are team-defined demo rules; real use would require clinician-validated criteria.

## Run it locally
Requires Node 22+ and pnpm (`npm i -g pnpm`).

```sh
pnpm install
cp .env.example .env      # fill in GEMINI_API_KEY, DATABASE_URL, etc.
pnpm db:migrate           # once DATABASE_URL points at Tiger Cloud
pnpm dev                  # api :3001 + web :5173
```

- Kiosk: http://localhost:5173/kiosk
- Staff dashboard: http://localhost:5173/staff
- To test on a phone/iPad on the same Wi-Fi, use the "Network" URL Vite prints (mic needs HTTPS outside localhost — use the deployed site for voice).

Other scripts: `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Deploy (Vercel)
Two Vercel projects imported from this repo:

| Project | Root Directory | Notes |
|---|---|---|
| `ralph-api` | `apps/api` | Fastify auto-detected. Add every variable from `.env.example` under Settings → Environment Variables. |
| `ralph-web` | `apps/web` | Vite preset. `apps/web/vercel.json` proxies `/api/*` to `ralph-api` — update the URL there if your API project got a different name. |

Push to `main` → production; any other branch → preview URL (HTTPS, so the mic works on phones). Run `pnpm db:migrate` from a laptop when adding migrations — prod and dev share the Tiger database.

## Layout
`apps/web` (React kiosk + dashboard) · `apps/api` (Fastify) · `packages/shared` (types, Zod schemas, triage trees + rules). Docs for humans in `docs/`; context for Claude Code in `CLAUDE.md` and `.claude/skills/`.


# RALPH — Rapid Assessment for Little Patients in Healthcare

> Project context for Claude Code. Read this whole file before writing code.
> Hackathon: **Hack the Valley 11** (Toronto, October 2026). Built in a weekend by a small student team.
> Everything here is a prototype using **synthetic data only**. RALPH is **not** a medical device and never gives a diagnosis.

---

## 0. Team, timeline, constraints

- **Team:** 4 people. **Mouiz is lead developer** and owns most of the code (with Claude Code). The other three cover design/hand-drawn art, pitch/video/slides, and testing + synthetic data + light frontend help.
- **Timeline (from ~1:00 AM Saturday):** draft submission in **~20 hours**, final presentation in **~30 hours**. Optimise for a working end-to-end demo by the draft deadline; polish after.
- **Platform:** a **responsive website** only (no native app). Must work well on **iPhone/Android phone**, **iPad**, and laptop. Kiosk = phone or iPad; staff dashboard = laptop or iPad.
- **Mascot:** Ralph is a **raccoon**.
- **Languages:** English, Hindi, Spanish, French, Mandarin (Simplified Chinese).
- **Gemini API key:** not claimed yet — first task is creating a key in Google AI Studio and checking free-tier limits.

---

## 1. One-paragraph pitch

Kids in paediatric ERs and walk-in clinics wait a long time, can't always explain what's wrong, and can quietly get worse while they wait. **RALPH** is a friendly hand-drawn character on a waiting-room tablet who talks with the child (speech-to-text + text-to-speech), asks simple questions that get more specific as the child answers, and plays short games that double as alertness checks. Nurses get a live dashboard: a queue sorted by suggested urgency, a summary in the child's own words, trends over time, red-flag alerts that explain **why**, and a 15-second audio briefing they can listen to while walking the floor. When the doctor walks in, they can say: *"Ralph told me your tummy hurts. Can you show me where?"*

**Core claim:** RALPH helps the care team **catch a child getting worse sooner** and turns waiting time into useful clinical information.

---

## 2. Non-negotiable product rules

1. **No diagnosis.** RALPH outputs a *structured symptom summary*, *red-flag alerts*, and a *suggested* triage priority. A nurse always confirms. UI copy everywhere says "Suggested — nurse to confirm."
2. **Safety logic is deterministic.** Red flags and triage suggestions come from explicit rules in code (`packages/shared/triage`). The LLM interprets answers and writes friendly language; it never decides urgency on its own.
3. **Parent/guardian in the loop.** The parent confirms or corrects the transcript and adds facts the child can't (onset, temperature, meds given).
4. **Every question has a tap fallback.** Big buttons (yes / no / not sure), a body map, and a faces scale. Voice is optional, not required.
5. **Ralph stays on topic.** No open-ended chat. Ralph only asks the current question, reacts briefly and kindly, or plays a game.
6. **Safeguarding.** If a child says something suggesting they are being hurt by someone or are unsafe at home, Ralph responds only with a calm, neutral line ("Thank you for telling me. A nurse will come talk with you.") and raises a **private staff flag**. Ralph never asks follow-up questions about it. This flag is never shown on the child or parent screen.
7. **Synthetic data only.** No real patient data anywhere, including the demo.
8. **No copyrighted art or clinical tools.** All Ralph art and UI icons are the team's own hand drawings. Do **not** use the Wong-Baker FACES scale (licensed); use our own drawn faces. Triage rules are team-defined demo rules, labelled as such.

---

## 3. Users

| User | Device | Needs |
|---|---|---|
| **Child (≈4–12)** | Phone or iPad (waiting-room tablet or the parent's phone via QR code at check-in) | Friendly, simple, big buttons, short sentences, voice, games |
| **Parent/guardian** | Same device (parent step) | Confirm transcript, add details, pick language |
| **Triage nurse** | Laptop or iPad dashboard | Prioritized queue, why a kid is flagged, quick audio briefing |
| **Doctor** | Dashboard patient view | Child's own words, trend, a conversation opener |

Children under 4 → "parent mode": the parent answers on the child's behalf; games are skipped.

---

## 4. Tech stack (decided)

### Overview
TypeScript everywhere, one monorepo, one deploy.

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces** | `apps/web`, `apps/api`, `packages/shared` share types and triage trees |
| Frontend | **React 18 + Vite + TypeScript** | Fast dev, team knows React |
| Styling | **Tailwind CSS**, mobile-first | Speed; custom kid-friendly theme; one layout that scales phone → iPad → laptop |
| Fonts | **Nunito** (Latin) + **Noto Sans Devanagari** (Hindi) + **Noto Sans SC** (Mandarin), Google Fonts | Rounded friendly look; correct rendering for all 5 languages |
| i18n | **i18next + react-i18next** | Static UI strings in 5 languages; Ralph's dynamic lines come from Gemini |
| PWA | `vite-plugin-pwa` (manifest + add-to-home-screen) | Fullscreen kiosk feel on iPad/phone without an app store |
| Animation | **Framer Motion** | Ralph's idle bob, talking, reactions, screen transitions |
| Routing | **React Router** | `/kiosk/*` (child) and `/staff/*` (nurse) |
| Server state | **TanStack Query** | Dashboard fetching + cache |
| Realtime | **Socket.IO** | Live queue updates and alerts pushed to dashboard |
| Charts | **Recharts** | Pain / reaction-time trends on patient view |
| Validation | **Zod** | Validate every Gemini JSON response and API body |
| Backend | **Node 22 + Fastify + TypeScript** | Light, fast, good multipart + websocket support |
| AI SDK | **`@google/genai`** (official Gemini SDK) | Conversation interpretation, summaries, briefings |
| Speech-to-text | **Gemini Transcribe** (pre-recorded clips) | Auto language detection, custom vocab hints |
| Text-to-speech | **Gemini TTS** | Expressive, controllable voice for Ralph; second voice for nurse briefings |
| TTS fallback | Browser `speechSynthesis` | If API is slow or down during demo |
| Database | **Tiger Data (Tiger Cloud, free plan)** — Postgres + TimescaleDB | Relational tables + time-series hypertables + continuous aggregates |
| DB client | **`postgres`** (porsager) + plain SQL migrations | Hypertables/caggs are SQL-native; ORMs get in the way |
| Hosting | **Vultr** cloud compute VM (Ubuntu) + **Docker Compose** | MLH Vultr track; one box runs web + api |
| HTTPS / proxy | **Caddy** | Automatic TLS. **HTTPS is required for microphone access in browsers.** |
| Domain | Registered via **GoDaddy Registry** | MLH domain track; points at the Vultr VM |

### Gemini model IDs — VERIFY BEFORE USE
Model names change often. Put them in env vars and confirm against https://ai.google.dev/gemini-api/docs/models at build time. As of Oct 2026 the docs list:
- General / interpretation / summaries: a current Gemini Flash model (docs examples show `gemini-3.7-flash`; use whatever the models page lists as the current fast Flash model)
- Speech-to-text: `gemini-3.5-transcribe` (pre-recorded audio; `-live` variant exists for streaming)
- Text-to-speech: `gemini-3.8-flash-tts` (or `gemini-3.8-flash-lite-tts` if latency matters)

Check the current SDK docs for the exact call shape (some newer docs use an "Interactions API"). Do not hard-code model IDs anywhere except `.env`.

### Why push-to-talk clips instead of the Live API
Kids in noisy waiting rooms + a controlled question tree = **record a short clip → transcribe → interpret**. This is more predictable, easier to debug, and lets us show the transcript for parent confirmation. The Gemini Live API (streaming voice agent) is a **stretch goal only**.

---

## 5. Repository layout

```
ralph/
├─ CLAUDE.md
├─ docker-compose.yml
├─ Caddyfile
├─ .env.example
├─ apps/
│  ├─ web/                      # React + Vite
│  │  ├─ public/
│  │  │  ├─ ralph/              # hand-drawn character frames (see §11)
│  │  │  ├─ icons/              # hand-drawn UI icons
│  │  │  └─ audio/cache/        # pre-generated TTS for fixed lines
│  │  └─ src/
│  │     ├─ kiosk/              # child + parent experience
│  │     │  ├─ screens/         # Welcome, Language, Conversation, ParentConfirm, Games, Waiting
│  │     │  ├─ components/      # Ralph, TalkButton, BodyMap, FacesScale, BigChoice
│  │     │  └─ games/           # BubblePop, FireflyFollow, RalphSays
│  │     ├─ staff/              # nurse dashboard
│  │     │  ├─ Queue.tsx
│  │     │  ├─ PatientView.tsx
│  │     │  └─ DemoPanel.tsx    # hidden behind ?demo=1
│  │     └─ lib/                # api client, socket, audio recorder, tts player
│  └─ api/                      # Fastify
│     └─ src/
│        ├─ routes/             # visits, turns, checkins, games, staff, tts, demo
│        ├─ ai/                 # gemini client, prompts, schemas
│        ├─ triage/             # engine that runs shared trees + rules
│        ├─ scoring/            # deterioration score
│        ├─ db/                 # migrations/*.sql, queries
│        └─ realtime.ts         # socket.io
└─ packages/
   └─ shared/
      ├─ types.ts
      ├─ schemas.ts             # zod
      └─ triage/
         ├─ trees/              # fever.json, tummy.json, breathing.json
         └─ rules.ts            # red flags + suggested level mapping
```

---

## 6. The child flow (kiosk)

1. **Welcome:** Ralph waves. "Hi! I'm Ralph. Can you help me learn how you're feeling?" Big "Let's go!" button.
2. **Language (parent):** language names written in their own script (no flags). Default English.
3. **Who's here:** parent enters child first name, age, and optionally weight. (Synthetic in demo.)
4. **Chief complaint:** "What's bothering you today?" Voice or tap: tummy / hot or sick / hard to breathe or coughing / something else.
5. **Adaptive questions:** the complaint's tree runs (§7). Each turn: Ralph asks → child holds the big talk button (or taps) → transcript appears → Gemini interprets → engine picks next node. Max ~8–10 questions.
6. **Body map + faces scale:** "Can you point to where it hurts?" (front/back drawing) and "Which face looks like how you feel?" (team-drawn faces, 0–5).
7. **Parent confirm:** shows the child's answers in plain text. Parent can edit, then answers parent-only questions: when it started, highest temperature, meds given and when, fluids in/out, known conditions. Free text allowed.
8. **Waiting mode:** Ralph offers games. Every N minutes (demo: 2 min, real: 15 min) Ralph does a **check-in**: "How's your tummy now? Better, same, or worse?" + faces scale.
9. **Called in:** a "Ralph says bye" screen with a sticker reward.

---

## 7. Triage engine

### Tree format (`packages/shared/triage/trees/*.json`)
```json
{
  "id": "tummy",
  "version": 1,
  "start": "where",
  "nodes": {
    "where": {
      "ask": "Can you show me where your tummy hurts?",
      "answer_type": "body_map",
      "slot": "pain_location",
      "next": [{ "default": "how_long" }]
    },
    "how_long": {
      "ask": "Did it start today, or before today?",
      "answer_type": "choice",
      "options": ["today", "before today", "not sure"],
      "slot": "onset_child",
      "next": [{ "default": "throw_up" }]
    },
    "throw_up": {
      "ask": "Have you thrown up?",
      "answer_type": "yes_no",
      "slot": "vomiting",
      "next": [
        { "if": { "vomiting": "yes" }, "goto": "throw_up_count" },
        { "default": "pain_face" }
      ]
    }
  }
}
```
`answer_type`: `yes_no | choice | body_map | faces | number | free_speech`.

### Per-turn AI call (interpretation, not decision)
Input to Gemini: node definition, child age, language, last few turns, raw transcript.
Required JSON output (validated with Zod; retry once, then fall back to tap options):
```ts
{
  slot_value: string | number | null,   // mapped to node's options when applicable
  confidence: number,                    // 0–1
  needs_clarification: boolean,          // true → show tap options / ask parent
  ralph_reply: string,                   // ≤ 20 words, kind, simple, in session language
  extra_symptoms: string[],              // anything else the child mentioned, normalized
  safeguarding_concern: boolean,         // see rule 6
  off_topic: boolean
}
```
Then **code** (not the LLM) writes the slot, evaluates red-flag rules, and chooses the next node.

### Red flags (team-defined demo rules)
Implemented in `rules.ts` as pure functions over the slot map + check-ins + game metrics. Examples:
- Trouble breathing / "can't breathe" / working hard to breathe
- Very sleepy, hard to wake, or not responding to two check-ins in a row
- Vomiting repeatedly + no fluids kept down / no pee for a long time
- Severe pain (faces 5) or pain moving to lower-right tummy
- Fever in a very young child (age threshold set by team)
- Rash + fever together
- Safeguarding concern (private flag, separate channel)

### Suggested priority
Map rules to a 1–5 "suggested level" modelled loosely on the Canadian paediatric triage scale (PaedsCTAS). Label in UI: **"Suggested level 3 — nurse to confirm."** Note in README that real use would require clinician-validated criteria.

---

## 8. Deterioration score (the "Catch It Early" core)

Computed in `apps/api/src/scoring`, recomputed on every check-in and game round. Explainable by design: every point comes with a reason string.

| Signal | Points | Reason text example |
|---|---|---|
| Faces/pain up ≥ 2 vs first report | +2 | "Pain went from 2 → 4" |
| Check-in answer "worse" | +1 | "Said tummy feels worse" |
| New red-flag symptom | ALERT | "New: says it's hard to breathe" |
| Reaction time > 30% slower than own baseline | +2 | "Reaction time down 35%" |
| Reaction time > 50% slower | +3 (replaces +2) | |
| Game accuracy drop > 25% | +1 | "Missing more targets" |
| No response to 2 check-ins in a row | +2 + ALERT | "Not responding to Ralph" |
| Waited longer than target for suggested level | +1 | "Waiting 95 min (target 60)" |

Bands: **0–2 stable**, **3–4 watch**, **5+ escalate** (moves up the queue, dashboard alert + sound).
Baseline = child's first game round, so each kid is compared to themselves.

---

## 9. Games (alertness signals, ~45–60 s each)

Frame as **"engagement and alertness trends,"** never as a neurological test.

1. **Bubble Pop** — bubbles appear at random spots; tap them. Logs reaction time (ms) per target, hits, misses.
2. **Firefly Follow** — drag your finger to follow a slow-moving firefly. Logs average distance from target (tracking accuracy), time on target.
3. **Ralph Says** — Ralph shows a short sequence of 3–5 coloured shapes; repeat it. Logs longest correct sequence, response time.

Each round writes one `game_events` row per target/attempt plus a summary row. Games get slightly easier for younger ages (bigger, slower targets).

---

## 10. Staff dashboard

### Queue (`/staff`)
- Sorted by: active alerts → suggested level → deterioration score → wait time.
- Each row: name, age, chief complaint in child's words ("my tummy hurts really bad"), suggested level badge, score band chip (stable / watch / escalate), wait time, sparkline of pain.
- Real-time via Socket.IO; new alerts pulse + optional chime.

### Patient view (`/staff/visit/:id`)
- **Summary card** (Gemini-generated from structured data): chief complaint (child quote + English translation if needed), parent-reported history, key positives/negatives, red flags, suggested level + reasons.
- **Why flagged** list: the deterioration reason strings.
- **Trends**: pain over time, reaction time vs baseline (from continuous aggregates).
- **Transcript**: full turn-by-turn, child words vs parent edits marked.
- **Conversation opener**: "Ralph told me your tummy hurts near your belly button. Can you show me where?"
- **▶ Play briefing**: 15–20 s audio summary (nurse voice, not Ralph's voice).
- **Nurse actions**: confirm/override level, mark "seen", add note. Overrides are logged.
- **Safeguarding flag** appears only here, in a distinct style.

### Demo panel (`?demo=1`)
Fast-forward time, trigger check-ins, inject a scripted deterioration for a chosen patient, reset seed data.

---

## 11. Hand-drawn art pipeline (Ralph + icons)

The team draws everything by hand. Code must work with **placeholder SVGs first**, using the exact filenames below, so real art is a drop-in swap.

### Drawing → app
1. Draw on paper (thick black marker) or iPad (Procreate/Fresco).
2. Paper: photograph flat in good light → clean up → export.
3. Export **transparent PNG at 1024×1024** (character) / **512×512** (icons). Optionally vectorize to SVG (Inkscape "Trace Bitmap") for crisp scaling.
4. Drop into `apps/web/public/ralph/` or `public/icons/` with the exact names below.
5. Keep a consistent canvas size and character position across frames so swaps don't jump.

### Ralph the raccoon — character notes
- Friendly, round, chunky raccoon: big soft eyes inside the classic dark "mask," small round ears, striped fluffy tail.
- Keep the mask **soft and cute, not bandit-like** (no sneaky expressions) — kids should read him as kind.
- Optional prop: a tiny stethoscope or a bandage on his tail so he reads as "hospital helper."
- The tail is a great animation channel: slow sway for idle, quick wag for happy, curled around him for gentle/concerned.
- Draw the tail as a **separate layer/file** (`ralph-tail.png`) if possible so it can be animated independently with Framer Motion.

### Ralph frames (`public/ralph/`)
| File | Use |
|---|---|
| `ralph-idle.png` | default; gentle bob via Framer Motion |
| `ralph-blink.png` | swapped in for ~120 ms every 3–5 s |
| `ralph-talk-1.png`, `ralph-talk-2.png`, `ralph-talk-3.png` | mouth closed / half / open; cycle while TTS plays (simple lip flap; optionally drive by audio volume) |
| `ralph-listen.png` | ear perked / leaning in, while recording |
| `ralph-think.png` | waiting on AI response |
| `ralph-happy.png` | after an answer, game wins |
| `ralph-gentle.png` | concerned-but-calm face for "worse" check-ins (never scary) |
| `ralph-wave.png` | welcome + goodbye |
| `ralph-celebrate.png` | sticker reward |
| `ralph-sleep.png` | optional, idle waiting screen |

### Icons (`public/icons/`)
- `body-front.png`, `body-back.png` (body map; regions defined as SVG hotspots in code)
- `face-0.png` … `face-5.png` (team's own faces scale — do not copy Wong-Baker)
- `yes.png`, `no.png`, `not-sure.png`
- `complaint-tummy.png`, `complaint-fever.png`, `complaint-breathing.png`, `complaint-other.png`
- `mic.png` (talk button), `play.png`, `game-bubbles.png`, `game-firefly.png`, `game-ralph-says.png`
- Game sprites: `bubble.png`, `firefly.png`, `shape-*.png`
- Stickers: `sticker-1.png` … `sticker-6.png`

### Visual style
- Kiosk: warm off-white background, chunky rounded shapes, 2–3 accent colours, minimum 64 px tap targets, 24 px+ text, one action per screen.
- Staff: clean, neutral, dense; Ralph appears only as a tiny avatar. Colour-blind-safe status colours plus text labels.

---

## 12. Speech pipeline

### Speech-to-text
1. Child holds the big talk button → `MediaRecorder` captures audio (webm/opus). Max 15 s. Release to send.
2. `POST /api/visits/:id/turns/audio` (multipart).
3. API calls **Gemini Transcribe** with: language hint (session language), vocabulary hints (tummy, throw up, poop, pee, ouchie, fever, cough, breathe, dizzy, itchy).
4. Transcript returned to kiosk and shown under Ralph; then sent through the per-turn interpretation call (§7).
5. If confidence is low or audio is empty → Ralph: "Hmm, can you tap the picture instead?" and show tap options.

### Text-to-speech
- **Fixed lines** (greetings, prompts, game instructions) are pre-generated at build time per supported language into `public/audio/cache/` → zero latency during demo.
- **Dynamic lines** (Ralph's short reactions, nurse briefings) generated on demand by `POST /api/tts`, cached by hash of `(voice, language, text)`.
- Ralph voice: warm, playful, slow, simple. Nurse briefing voice: calm, clear, professional.
- If TTS fails → fall back to browser `speechSynthesis` and keep going.
- Always show the text on screen too (accessibility + hearing-impaired kids).

### Multilingual (en, hi, es, fr, zh-CN)
- Supported language codes: `en`, `hi`, `es`, `fr`, `zh-CN`. Language picker shows each in its own script: English, हिन्दी, Español, Français, 中文.
- Static UI strings: i18next JSON files in `apps/web/src/i18n/{lang}.json`.
- Tree questions: English source text in the tree JSON; translations pre-generated with Gemini into `packages/shared/triage/i18n/{lang}.json` and reviewed by a teammate where possible. Never translate at request time during the demo.
- Fixed Ralph lines: TTS pre-generated **per language** at build time.
- Pass the session language as a hint to Gemini Transcribe; accept code-switching (e.g. Hindi + English mixed, very common).
- Ralph asks and reacts in the session language; the dashboard always shows English, with the child's original words alongside.
- Test Hindi (Devanagari) and Mandarin (Simplified) rendering on an actual iPhone and iPad early — font fallback bugs show up late.

---

## 13. Data model (Tiger Data / Postgres + TimescaleDB)

`apps/api/src/db/migrations/001_init.sql` (outline — Claude Code writes the full DDL):

```sql
-- relational
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  age_years NUMERIC(4,1) NOT NULL,
  weight_kg NUMERIC(5,1),
  language TEXT NOT NULL DEFAULT 'en',
  is_synthetic BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  site TEXT NOT NULL,                 -- 'demo-paeds-er'
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chief_complaint TEXT,               -- tree id
  status TEXT NOT NULL DEFAULT 'waiting',  -- waiting | in_room | done
  suggested_level SMALLINT,
  confirmed_level SMALLINT,
  current_score SMALLINT DEFAULT 0,
  score_band TEXT DEFAULT 'stable'
);

CREATE TABLE turns (                 -- conversation
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID REFERENCES visits(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  node_id TEXT,
  speaker TEXT,                      -- ralph | child | parent
  text_original TEXT,
  text_en TEXT,
  slot TEXT,
  slot_value JSONB,
  confidence REAL
);

CREATE TABLE flags (
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID REFERENCES visits(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT,                         -- red_flag | deterioration | safeguarding | unresponsive
  reason TEXT,
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE summaries (
  visit_id UUID PRIMARY KEY REFERENCES visits(id),
  updated_at TIMESTAMPTZ,
  summary JSONB,
  briefing_text TEXT,
  briefing_audio_url TEXT
);

CREATE TABLE nurse_actions (
  id BIGSERIAL PRIMARY KEY,
  visit_id UUID REFERENCES visits(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT, payload JSONB
);

-- time-series (hypertables)
CREATE TABLE checkins (
  visit_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  pain_face SMALLINT,                -- 0..5
  feeling TEXT,                      -- better | same | worse | no_response
  note TEXT
);
SELECT create_hypertable('checkins', by_range('at'));

CREATE TABLE game_events (
  visit_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  game TEXT,                         -- bubble_pop | firefly | ralph_says
  round INT,
  reaction_ms INT,
  hit BOOLEAN,
  tracking_err_px REAL,
  seq_len INT
);
SELECT create_hypertable('game_events', by_range('at'));

-- continuous aggregate for the trend charts + scoring
CREATE MATERIALIZED VIEW game_metrics_2m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT visit_id,
       time_bucket('2 minutes', at) AS bucket,
       game,
       avg(reaction_ms)        AS avg_reaction_ms,
       avg(hit::int)           AS hit_rate,
       avg(tracking_err_px)    AS avg_tracking_err,
       max(seq_len)            AS best_seq
FROM game_events
GROUP BY visit_id, bucket, game;
```
- Use `materialized_only = false` (real-time aggregates) so freshly inserted demo data shows up immediately. Add a refresh policy too.
- Check exact hypertable syntax against current Tiger Data docs; the free plan includes hypertables and continuous aggregates.
- Seed script inserts ~6 synthetic visits and thousands of game/check-in events so charts look alive.

---

## 14. API (Fastify, all JSON unless noted)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/visits` | Create patient + visit (kiosk start) |
| POST | `/api/visits/:id/complaint` | Set chief complaint → returns first node |
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
| POST | `/api/demo/*` | Seed, reset, fast-forward, inject deterioration (demo only) |

Socket.IO events (server → staff): `queue:update`, `visit:update`, `flag:new`.

---

## 15. AI prompts (put in `apps/api/src/ai/prompts.ts`)

**Ralph persona (system):**
You are Ralph, a gentle, playful character helping a child aged {age} in a hospital waiting room. Use very short sentences (≤ 20 words), simple words, warm tone, in {language}. Never mention diagnoses, diseases, needles, or anything scary. Never give medical advice. Only react to the child's answer and stay on the current question. If the child says something suggesting someone is hurting them or they're unsafe, set safeguarding_concern=true and reply only: "Thank you for telling me. A nurse will come talk with you."

**Interpretation (per turn):** map the transcript to the node's options/slot; return the JSON schema in §7 exactly.

**Staff summary:** from structured slots, check-ins, scores, and flags (never from free invention), produce JSON: `chief_complaint_quote`, `chief_complaint_en`, `history_from_parent[]`, `positives[]`, `negatives[]`, `red_flags[]`, `suggested_level`, `level_reasons[]`, `trend_sentence`, `conversation_opener`. Must not include any diagnosis or "likely condition."

**Briefing script:** ≤ 55 words, spoken style, order: name + age → main complaint → red flags → trend → suggested level. Example: "Maya, six. Tummy pain since this morning, now on the lower right. Vomited twice. Pain went from two to four in forty minutes and reaction time dropped by a third. Suggested level two. Please reassess."

Set temperature low for interpretation/summary; slightly higher for Ralph's reactions.

---

## 16. Demo script (~90 s) — build toward this

1. Kiosk: Maya (6) taps "tummy." Ralph asks where; she taps lower belly on body map; says "it hurts really bad and I threw up."
2. Parent confirms, adds "started this morning, no fever."
3. Staff dashboard: Maya appears, suggested level 3, stable.
4. Demo panel → fast-forward 40 min. Check-in: "worse," face 4. Bubble Pop reaction time 35% slower than her baseline.
5. Dashboard: Maya jumps up the queue → **escalate** with reasons listed.
6. Nurse hits ▶ Play briefing (15 s).
7. Doctor view shows opener: "Ralph told me your tummy hurts. Can you show me where?"

Also prepare a 30-second **multilingual** moment: a second child checks in in Hindi or Mandarin, Ralph speaks that language, and the nurse dashboard shows the English summary with the original words alongside.

Run the demo with the **kiosk on a phone or iPad** and the **dashboard on a laptop** side by side so judges see both at once.

---

## 17. Hackathon tracks and how RALPH hits each

| Track | How RALPH qualifies |
|---|---|
| **Healthcare Innovation & Well-being** (theme) | Paediatric triage support and deterioration detection in the waiting room |
| **AI for Social Impact** (theme) | Helps kids who can't explain symptoms; multilingual access for newcomer families; explainable, human-in-the-loop |
| **PointClickCare — Catch It Early** | AI turns small signals (pain trend, slower reactions, missed check-ins) into early, **explained** alerts for the care team. Their bonus: explaining *why* → our reason strings |
| **MLH Best Use of Gemini API** | Transcribe (child speech), interpretation, multilingual Ralph, staff summaries, TTS for Ralph + nurse briefings |
| **MLH Best Use of Tiger Data** | Relational visits + hypertables for check-ins/game telemetry + continuous aggregates powering live trends and scoring |
| **MLH Best Use of Vultr** | Whole app deployed on a Vultr VM with Docker Compose + Caddy |
| **MLH Best Domain Name (GoDaddy Registry)** | Custom domain → Vultr deployment (confirm eligible TLDs at MLH table) |
| **MLH DEV Writing Challenge** (post-event) | Build write-up: architecture, deterministic-safety + LLM design, Tiger caggs |

**Not targeting:** Solana (no real fit; blockchain for kids' health data is a privacy negative).

---

## 18. Privacy, safety, ethics (put a slide + README section on this)

- Synthetic data only; `is_synthetic` flag on every patient.
- Real deployment would fall under Ontario's PHIPA: consent from guardian, data stored in Canada, retention limits, audit log (nurse_actions is the start of this).
- Human in the loop: nurse confirms every level; overrides logged.
- No diagnosis, no medical advice to families.
- Child-safe AI: on-topic only, no open chat, safeguarding handled privately.
- Accessibility: tap fallback for every question, on-screen text with all audio, high-contrast mode, large targets.
- Bias: kids' speech + accents → low-confidence path falls back to taps and parent; we don't penalise a child for being hard to transcribe.

---

## 19. Build order (priority tiers)

**Tier 1 — must ship (demo works end-to-end)**
1. Monorepo scaffold, env, Tiger connection, migrations, seed
2. Kiosk: welcome → complaint → tummy tree with tap answers → parent confirm
3. Push-to-talk → Gemini Transcribe → interpretation → next node
4. TTS for Ralph (pre-generated fixed lines + dynamic fallback)
5. Rules engine + suggested level
6. Staff queue + patient view with summary, real-time updates
7. Bubble Pop + check-ins + deterioration score with reasons
8. Demo panel + scripted Maya scenario
9. Deploy to Vultr behind Caddy on the custom domain

**Tier 2 — should ship**
- Fever + breathing trees, Firefly + Ralph Says games, briefing audio, trend charts from caggs, multilingual

**Tier 3 — stretch**
- Gemini Live API voice mode, lip flap driven by audio volume, parent SMS update ("you're next"), nurse mobile view

Use placeholder art until hand-drawn assets arrive (same filenames).

### Hour-by-hour plan (T = start, ~1:00 AM Sat; draft due ~T+20, presentation ~T+30)

| Hours | Mouiz (lead dev + Claude Code) | Teammates |
|---|---|---|
| T+0–2 | Gemini key, Tiger service, Vultr VM, domain; scaffold monorepo; migrations + seed | Art: Ralph idle/talk/listen frames. Pitch: problem slide + stats. Data: write Maya + 5 other synthetic scenarios |
| T+2–6 | Kiosk flow with tap answers + tummy tree + rules engine | Art: body map, faces 0–5, complaint icons. Translations of tree + UI strings reviewed by speakers |
| T+6–10 | Push-to-talk → Transcribe → interpretation; TTS + pre-generated lines | Art: remaining Ralph frames + game sprites. Pitch: script draft |
| T+10–14 | Staff queue + patient view + Socket.IO; summary generation | Testing on phone + iPad; log bugs |
| T+14–18 | Bubble Pop, check-ins, deterioration score, demo panel; deploy to Vultr | Record backup demo video once deploy is live |
| T+18–20 | **Draft submission**: Devpost text, screenshots, repo link, live URL | Devpost write-up, track selections |
| T+20–24 | **Sleep in shifts** (at least 3–4 h each) | Same |
| T+24–28 | Tier 2: fever + breathing trees, briefing audio, trend charts, 2nd game, multilingual polish | Final slides, rehearse demo twice |
| T+28–30 | Freeze code, fix only demo-blocking bugs | Rehearse, backup video ready |

**Rule:** if a Tier 1 item slips by more than 2 hours, cut a Tier 2 item, not sleep.

---

## 20. Environment variables (`.env.example`)

```
GEMINI_API_KEY=
GEMINI_MODEL=            # current fast Flash model — verify on models page
GEMINI_STT_MODEL=gemini-3.5-transcribe
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
RALPH_VOICE=             # pick from Gemini TTS voice list
NURSE_VOICE=
DATABASE_URL=            # Tiger Cloud connection string (sslmode=require)
PUBLIC_BASE_URL=https://<domain>
CHECKIN_INTERVAL_SEC=120 # demo; 900 real
DEMO_MODE=true
SUPPORTED_LANGS=en,hi,es,fr,zh-CN
```

---

## 21. Coding conventions for Claude Code

- TypeScript strict mode everywhere. Shared types live in `packages/shared`.
- Validate every external input and every Gemini response with Zod. Never trust LLM JSON without parsing.
- All triage and scoring logic is pure and unit-tested (Vitest), with fixture cases for Maya's scenario.
- No model IDs, keys, or URLs hard-coded; read from env.
- Fail soft in the kiosk: any API error → Ralph says "Oops, let's try tapping!" and the flow continues.
- Keep kiosk components dumb; flow state in a single reducer (`useReducer`) per session.
- Commit small and often; the team works in parallel.

---

## 22. Decisions log + open questions

**Decided**
- 4-person team; Mouiz is lead developer.
- Draft due ~20 h after start, presentation ~30 h.
- Ralph is a raccoon.
- Responsive website for phone, iPad, and laptop (PWA for fullscreen kiosk).
- Languages: English, Hindi, Spanish, French, Mandarin (Simplified).

**Still open**
- Gemini API key (not claimed yet) and Vultr credits
- Domain name
- Which teammate speaks/reviews each non-English language
