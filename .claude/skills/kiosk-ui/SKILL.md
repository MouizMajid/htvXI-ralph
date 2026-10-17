---
name: kiosk-ui
description: RALPH frontend — child/parent kiosk flow, the three alertness games, hand-drawn art filenames and animation, visual style, and the staff dashboard (queue, patient view, demo panel). Use when working in apps/web.
---

# Kiosk + dashboard UI

## Child flow (`apps/web/src/kiosk`)
1. **Welcome:** Ralph waves. "Hi! I'm Ralph. Can you help me learn how you're feeling?" Big "Let's go!" button.
2. **Language (parent):** names in their own script, no flags: English, हिन्दी, Español, Français, 中文. Default English.
3. **Who's here:** parent enters first name, age, optional weight. Age < 4 → **parent mode** (parent answers, games skipped).
4. **Chief complaint:** voice or tap: tummy / hot or sick / hard to breathe or coughing / something else.
5. **Adaptive questions:** tree runs (see `triage-engine`). Ralph asks → child holds talk button (or taps) → transcript shown → interpret → next node.
6. **Body map + faces scale:** front/back drawing with SVG hotspots; team-drawn faces 0–5.
7. **Parent confirm:** child's answers in plain text, editable; parent-only questions: onset, highest temperature, meds + when, fluids in/out, known conditions, free text. Safeguarding info never appears here.
8. **Waiting mode:** games. Every `CHECKIN_INTERVAL_SEC` (demo 120, real 900) Ralph checks in: "How's your tummy now? Better, same, or worse?" + faces.
9. **Called in:** "Ralph says bye" + sticker reward.

Flow state: one `useReducer` per session; components stay dumb. Any API error → "Oops, let's try tapping!" and continue.

## Games (`kiosk/games`, ~45–60 s each)
Frame as **"engagement and alertness trends,"** never a neurological test. Easier (bigger/slower) for younger kids.
1. **Bubble Pop** — tap bubbles at random spots. Log reaction ms per target, hits, misses. (Tier 1)
2. **Firefly Follow** — drag to follow a slow firefly. Log avg distance (tracking error px), time on target.
3. **Ralph Says** — repeat a 3–5 coloured-shape sequence. Log longest correct sequence, response time.
Each round: one `game_events` row per target/attempt + a summary.

## Staff dashboard (`apps/web/src/staff`)
**Queue `/staff`:** sort by active alerts → suggested level → score → wait time. Row: name, age, complaint in child's words, level badge, band chip (stable/watch/escalate), wait time, pain sparkline. Live via Socket.IO; new alerts pulse + optional chime.

**Patient view `/staff/visit/:id`:**
- Summary card (Gemini, from structured data only): child quote + English, parent history, positives/negatives, red flags, suggested level + reasons
- "Why flagged" reason strings
- Trends: pain over time, reaction time vs baseline (from caggs)
- Transcript: turn by turn, child words vs parent edits marked
- Conversation opener: "Ralph told me your tummy hurts near your belly button. Can you show me where?"
- ▶ Play briefing (nurse voice, 15–20 s)
- Actions: confirm/override level, mark seen, note (all logged)
- Safeguarding flag — only here, distinct style
- "Limited signals — parent mode" note for under-4 visits

**Demo panel `?demo=1`:** fast-forward time, trigger check-ins, inject scripted deterioration, reset seed.

## Art pipeline
- **Never reference Ralph image paths directly.** Use `<Ralph pose="…" />` (`kiosk/components/Ralph.tsx`); it handles idle bob, blink, talk-frame cycling, and the tail layer. Poses: `idle | talk | listen | think | happy | gentle | wave | celebrate | sleep`.
- `kiosk/art.ts` is the single manifest: frame list, pose → frame map, tail motion per pose, `SEPARATE_TAIL` toggle.
- Each frame resolves to `public/ralph/<name>.png` if it exists, else the `<name>.svg` placeholder. Artists add PNGs; no code change. `/art` shows every frame + animated pose with placeholder/✓ status.
- Placeholders in `public/ralph/*.svg` were generated to the same 1024 canvas layout real art should follow (tail base ≈ (690, 820)).

Code ships with **placeholders using exact final filenames**; hand-drawn art drops in. Character: transparent PNG 1024×1024, icons 512×512, consistent canvas/position across frames.

Ralph the raccoon: round, chunky, big soft eyes in a **soft, cute (not bandit-like)** mask, small round ears, striped fluffy tail; optional tiny stethoscope or tail bandage. Tail is a separate layer (`ralph-tail.png`) animated with Framer Motion: slow sway idle, quick wag happy, curled for gentle.

`public/ralph/`: `ralph-idle`, `ralph-blink` (~120 ms every 3–5 s), `ralph-talk-1/2/3` (closed/half/open, cycle during TTS), `ralph-listen`, `ralph-think`, `ralph-happy`, `ralph-gentle` (calm concern, never scary), `ralph-wave`, `ralph-celebrate`, `ralph-sleep`, `ralph-tail` — all `.png`.

`public/icons/`: `body-front`, `body-back`, `face-0`…`face-5` (own design, not Wong-Baker), `yes`, `no`, `not-sure`, `complaint-tummy/fever/breathing/other`, `mic`, `play`, `game-bubbles`, `game-firefly`, `game-ralph-says`, `bubble`, `firefly`, `shape-*`, `sticker-1`…`sticker-6` — all `.png`.

## Visual style
**Theming rule:** all colours, fonts, radii, and shadows are tokens in the `@theme` block of `apps/web/src/index.css`. Components use only semantic utilities (`bg-bg`, `bg-surface`, `bg-primary text-on-primary`, `text-ink`, `text-ink-muted`, `bg-yes/no/unsure`, `text-success/warning/danger`, `bg-staff-bg`, `rounded-card`, `rounded-pill`, `shadow-soft`) — never raw palette classes like `bg-pink-500` or hex values. Need a new colour role? Add a token, don't inline it.

- **Kiosk:** warm off-white bg, chunky rounded shapes, 2–3 accents, ≥64 px tap targets, ≥24 px text, one action per screen. Always show text alongside audio. High-contrast mode.
- **Staff:** clean, neutral, dense; Ralph only as tiny avatar. Colour-blind-safe status colours **plus** text labels.
- Test Hindi + Mandarin rendering on a real iPhone and iPad early.
