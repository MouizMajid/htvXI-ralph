---
name: kiosk-ui
description: RALPH frontend — child/parent kiosk flow, the waiting-room games and check-ins, hand-drawn art filenames and animation, theming, and the staff dashboard (queue, conversation view, demo panel). Use when working in apps/web.
---

# Kiosk + dashboard UI

## Kiosk code map (`apps/web/src/kiosk`, built in slice 3)
- `session.ts` — the pure flow reducer (`Step`, `Action`, `initialSession`); tested in `session.test.ts`. Add new steps here first.
- `KioskApp.tsx` — the **only** place that calls the API (`kioskApi` in `lib/api.ts`); dispatches results; fail-soft via `REQUEST`/`FAILED`; saves `{visitId, lang, childName, parentMode}` to sessionStorage once waiting so a refresh resumes.
- `screens/` — Welcome, Language, WhoIsHere, Complaint, Question (shows Ralph's reaction: "Thank you!" 0.9 s, or the fixed `SAFEGUARDING_REPLY[lang]` 4.5 s), ParentConfirm (edits + parent-only answers), Waiting (polls `/status`), Goodbye.
- `components/` — `Shell` (Ralph + speech bubble + one action area), `BigButton`, `Icon` (PNG from `public/icons/` else emoji placeholder), `AnswerInput` (switch over `answer_type`), `BodyMap`, `FacesScale`.
- `format.ts` — `questionText()` (`t('q.<tree>.<node>')`, English `ask` fallback) and `answerText()`.
- Body map: front view faces the viewer, so **child's right = viewer's left** (`lower_right_tummy` is drawn on the left). Hotspots sit over `icons/body-front.png` / `body-back.png` (300×560 canvas) when present.
- i18n: all strings in `src/i18n/en.json`; other languages fall back to English until translated.

## Child flow (`apps/web/src/kiosk`)
1. **Welcome:** Ralph waves. "Hi! I'm Ralph. Can you help me learn how you're feeling?" Big "Let's go!" button.
2. **Language (parent):** names in their own script, no flags: English, हिन्दी, Español, Français, 中文. Default English.
3. **Who's here:** parent enters first name, age, optional weight. Age < 4 → **parent mode** (parent answers, games skipped).
4. **Chief complaint:** voice or tap: tummy / hot or sick / hard to breathe or coughing / something else.
5. **Adaptive questions:** tree runs (see `triage-engine`). Ralph asks → child holds talk button (or taps) → transcript shown → interpret → next node.
6. **Body map + faces scale:** front/back drawing with SVG hotspots; team-drawn faces 0–5.
7. **Parent confirm:** child's answers in plain text, editable; parent-only questions: onset, highest temperature, meds + when, fluids in/out, known conditions, free text. Safeguarding info never appears here.
8. **Waiting mode:** game menu. Every `CHECKIN_INTERVAL_SEC` (demo 120, real 900) a check-in is **due**; Ralph pops in **at the end of the current game round** (never mid-round): "How's your tummy now? Better, same, or worse?" + faces. No answer within ~30 s → logged `no_response`, back to games.
9. **Called in:** when the nurse presses "Call in" on the dashboard, the kiosk (polling its own visit status) shows "Ralph says bye" + sticker reward. RALPH's job ends here; the rest happens in person.

Flow state: one `useReducer` per session; components stay dumb. Any API error → "Oops, let's try tapping!" and continue.

## Games (`kiosk/games`) — entertainment only
Games exist to keep the child happily occupied between check-ins. **They are not tests, record no performance metrics, and never feed alerts.** No clinical wording anywhere in game UI, code comments, or pitch.
- **Firefly Tap** (Tier 1, all ages): dark night scene; a glowing firefly appears at a random spot (10–90% of width/height) after a random 1–3 s delay; tap it to catch it into Ralph's jar. ~8 fireflies per round, then a cheerful "Round done!" Bigger, slower fireflies for younger kids. Use pointer events.
- **Firewall Hacker** (Tier 2, ages ~8+): connect-the-dots. Round 1: drag through numbered nodes 1→N in order. Round 2: nodes are numbers in **two colours**; alternate colours while counting up (1 blue → 2 orange → 3 blue …) — no letters, so it works in every language. Layout shuffled every round. Mistake = gentle wobble, not a harsh fail. Optional visual-only timer.
- A round lasts ~30–60 s so check-ins land often.

## Staff dashboard (`apps/web/src/staff`) — no AI here
Purpose: hand the nurse the child's conversation in a fast, readable form. **The nurse triages and talks to the child in person.** No AI-generated summaries, scores, suggested levels, or audio.

**Queue `/staff`:** children with unacknowledged alerts first, then by arrival. Row: name, age, language, chief complaint in the child's words (English), alert chips with short reasons, wait time. Polls every `LIVE_POLL_MS` (`staff/live.ts`); new alerts (diff flag ids between polls) pulse + optional chime.

**Patient view `/staff/visit/:id`:**
- Header: name, age, language, complaint, arrived/wait time, "parent mode" badge if under 4
- **Alerts** with reasons (acknowledge button); **safeguarding** flag only here, distinct style
- **Answers at a glance:** table of structured slots (pain location, vomiting, count, pain face, …) + parent-only answers
- **Conversation:** turn by turn — Ralph's question, child's answer in English with the original-language words alongside, timestamps; parent edits marked
- **Check-ins:** time, better/same/worse, face
- **Call in** button → visit status `in_room`, kiosk says goodbye

**Demo panel `?demo=1`:** fast-forward time, trigger a check-in, inject a scripted "getting worse" check-in, reset seed.

## Art pipeline
- **Never reference Ralph image paths directly.** Use `<Ralph pose="…" />` (`kiosk/components/Ralph.tsx`); it handles idle bob, blink, talk-frame cycling, and the tail layer. Poses: `idle | talk | listen | think | happy | gentle | wave | celebrate | sleep`.
- `kiosk/art.ts` is the single manifest: frame list, pose → frame map, tail motion per pose, `SEPARATE_TAIL` toggle.
- Each frame resolves to `public/ralph/<name>.png` if it exists, else the `<name>.svg` placeholder. Artists add PNGs; no code change. `/art` shows every frame + animated pose with placeholder/✓ status.
- Character: transparent PNG 1024×1024, same canvas/position across frames (tail base ≈ (690, 820)). Round, chunky raccoon, big soft eyes in a **soft, cute (not bandit-like)** mask, striped fluffy tail; optional tiny stethoscope or tail bandage.

`public/ralph/`: `ralph-idle`, `ralph-blink`, `ralph-talk-1/2/3`, `ralph-listen`, `ralph-think`, `ralph-happy`, `ralph-gentle`, `ralph-wave`, `ralph-celebrate`, `ralph-sleep`, `ralph-tail`.

`public/icons/`: `body-front`, `body-back`, `face-0`…`face-5` (own design, not Wong-Baker), `yes`, `no`, `not-sure`, `complaint-tummy/fever/breathing/other`, `mic`, `play`, `game-firefly`, `game-hacker`, `firefly`, `jar`, `sticker-1`…`sticker-6` — all `.png`.

## Visual style
**Theming rule:** all colours, fonts, radii, and shadows are tokens in the `@theme` block of `apps/web/src/index.css`. Components use only semantic utilities (`bg-bg`, `bg-surface`, `bg-primary text-on-primary`, `text-ink`, `text-ink-muted`, `bg-yes/no/unsure`, `text-success/warning/danger`, `bg-staff-bg`, `rounded-card`, `rounded-pill`, `shadow-soft`) — never raw palette classes like `bg-pink-500` or hex values. Need a new colour role? Add a token.

- **Kiosk:** warm off-white bg, chunky rounded shapes, 2–3 accents, ≥64 px tap targets, ≥24 px text, one action per screen. Always show text alongside audio. High-contrast mode.
- **Staff:** clean, neutral, dense, readable at a glance; Ralph only as tiny avatar. Colour-blind-safe status colours **plus** text labels.
- Test Hindi + Mandarin rendering on a real iPhone and iPad early.
