# RALPH — Pitch, demo, tracks, ethics

## One-paragraph pitch
Kids in paediatric ERs and walk-in clinics wait a long time, often can't explain what's wrong to a stranger in scrubs, and can quietly get worse while they wait. **RALPH** is a friendly hand-drawn raccoon on a waiting-room tablet. He talks with the child in their own language, asks simple questions that get more specific as they answer, keeps them busy with little games, and checks in every few minutes: "How's your tummy now — better, same, or worse?" The nurse gets the child's whole conversation as clear English text, with the child's own words, plus a heads-up if they say they're getting worse. Then the software steps aside: the nurse walks over and says, *"Ralph told me your tummy hurts. Can you tell me more?"*

**Core claim:** a child's own words reach the care team before the nurse walks over, and a child who says they're getting worse doesn't go unnoticed.

**What RALPH is not:** it doesn't diagnose, triage, or score anyone. Nurses triage; RALPH just makes sure they start with the child's story.

**Who it's for:** children aged **4–12**. Families with younger children can use *parent mode* (the parent answers).

## Users
| User | Device | Needs |
|---|---|---|
| Child (4–12) | Phone or iPad (waiting-room tablet or parent's phone via QR at check-in) | Friendly, simple, big buttons, short sentences, voice, games |
| Parent/guardian | Same device | Confirm what the child said, add details, pick language |
| Triage nurse / doctor | Laptop or iPad | The child's conversation in readable English, at-a-glance answers, check-in history, alerts |

## Demo script (~90 s)
1. Kiosk: Maya (6) taps "tummy." Ralph asks where; she taps lower belly; says "it hurts really bad and I threw up."
2. Parent confirms, adds "started this morning, no fever."
3. Staff dashboard: Maya appears in the queue. Nurse opens her: the conversation in her own words, an answers table, check-ins so far.
4. Maya plays Firefly Tap. Demo panel → fast-forward. Ralph checks in between rounds: "worse," face 4.
5. Dashboard: Maya jumps to the top with **"Getting worse — pain went from 2 → 4; said tummy feels worse."**
6. Nurse presses **Call in**. Ralph says goodbye and gives Maya a sticker. The nurse walks over: "Ralph told me your tummy hurts. Can you show me where?"

Plus a 30 s **multilingual** moment: a second child answers in Hindi or Mandarin (by voice or in the chat); the dashboard shows the English translation next to the child's original words. (Questions are English-only for now, so don't say Ralph asks in Hindi.)

Run the kiosk on a phone/iPad and the dashboard on a laptop side by side.

## Tracks — why we should win each one

Each track: the one-line claim for the slide, the proof (what's really built, so judges can check it), and what to show live. ⚠️ marks a claim we can't make yet.

### Healthcare Innovation & Well-being
**Slide line:** Kids can't always explain what's wrong to a stranger in scrubs — RALPH gets the child's own story to the nurse *before* the nurse walks over, and keeps listening while they wait.
- **Proof:** full kiosk flow (tap or speak every answer), parent confirms/corrects, nurse dashboard with the child's whole conversation in English next to their original words, check-ins every few minutes, call-in ends RALPH's job.
- **Responsible by design:** no diagnosis, no triage, no scores. The nurse decides; RALPH only gathers and flags. Synthetic data only.
- **Show:** Maya's demo end to end; the nurse's opening line "Ralph told me your tummy hurts…".

### AI for Social Impact
**Slide line:** AI helps a scared child be understood — in their language — and never decides anything about their care.
- **Proof:** a child can answer by voice in English, Hindi, Spanish, French or Mandarin; Gemini transcribes and translates it faithfully into English for the nurse ("my tummy hurts really bad", not "severe abdominal pain").
- **The AI's limits are in code:** alerts and safeguarding are deterministic rules; Gemini's answers are validated before use; if Gemini is down or unsure, the child just taps — nothing breaks, nobody is penalised for being hard to understand.
- **Safeguarding:** a possible-harm disclosure gets one fixed, calm line (pre-translated, never AI-written) and a private staff flag — two independent detectors, either one fires.
- ⚠️ Ralph's *questions* and screen text are English-only for now; say "children can answer in 5 languages", not "Ralph speaks 5 languages".

### PointClickCare — Catch It Early
**Slide line:** A child who says "I feel worse" in a waiting room usually goes unheard. RALPH turns it into an early, explained heads-up.
- **Proof:** Ralph checks in every few minutes at a natural break (between game rounds / in the chat): better, same or worse + a faces scale.
- **Explained alerts, not scores:** "Pain went from 2 → 4", "Said they feel worse at 2 check-ins in a row", "Didn't answer Ralph's last 2 check-ins", plus red flags the child says anywhere ("my chest really hurts", "I threw up blood").
- **Queue:** children with unacknowledged alerts float to the top; the nurse acknowledges each one (logged with who and when).
- **Show:** demo fast-forward → Maya says "worse" → she jumps to the top of the dashboard with the reason.

### MLH Best Use of Gemini API
**Slide line:** Gemini is Ralph's ears, his understanding, his translator and his voice — three Gemini models (Flash, Transcribe, TTS), each with a guard-rail.
- **Ears:** Gemini Transcribe on 15 s push-to-talk clips, with per-language hints and a kid vocabulary (tummy, throw up, ouchie, belly button…).
- **Understanding:** each spoken answer is mapped to the current question's options as strict JSON (Zod-validated, 8 s budget); plain answers are matched by code first so Gemini only handles the hard ones.
- **Translator:** every child message is translated into English for the nurse, keeping the child's own phrasing; the waiting-room chat uses Gemini too, with safety rules in code around it.
- **Voice:** Ralph's lines are Gemini TTS with a fixed voice and style ("a warm, playful raccoon talking slowly to a young child"), generated once and cached in Tiger — instant playback, almost no quota.
- **Second safety signal:** Gemini's `safeguarding_concern` is OR-ed with our phrase lists.

### MLH Best Use of Tiger Data
**Slide line:** Tiger holds the whole waiting room: who's here, what each child said, and how each child is trending over time.
- **Proof (built):** relational core (patients, visits, every conversation turn, alerts, nurse audit trail); check-ins are a **hypertable** (time-series per child); a **real-time continuous aggregate** `checkins_5m` (avg/max pain and "worse" count per child per 5 min, `materialized_only = false` so fresh check-ins count at once).
- **Serverless-friendly:** Vercel has no disk, so Ralph's voice clips live in Tiger (`tts_cache`, keyed by a hash of the line) and stream from Postgres; alerts use a unique `(visit_id, key)` so re-running the rules never duplicates one; timestamps come from the DB clock.
- ⚠️ **Gap:** the app doesn't read `checkins_5m` yet — the dashboard lists check-ins with a plain query. To make this claim real, add the **check-in timeline chart** on the nurse's patient view, powered by the continuous aggregate (Tier 2 item; ~1–2 h).

### MLH Best Domain Name (GoDaddy Registry)
**Slide line:** ralphismyfavtmntturtle.cooking — because Ralph (well, Raph) is everyone's favourite turtle, and something's always cooking in the waiting room.
- **Proof:** live on Vercel with automatic HTTPS (needed for the microphone).
- ⚠️ Confirm `.cooking` is on MLH's list of eligible GoDaddy Registry TLDs and whether registering through Porkbun counts.

### MLH DEV Writing Challenge (post-event)
**Post idea:** "AI on the child's side only": how we kept every clinical decision in deterministic code, made Gemini fail soft (tap fallback, 8 s budget, cached voice), and ran it serverless on Vercel + Tiger.

Not targeting: Solana (blockchain for kids' health data is a privacy negative); Vultr (we deploy on Vercel — free, automatic HTTPS, preview URL per branch).

## Privacy, safety, ethics (slide + README section)
- Synthetic data only; `is_synthetic` on every patient.
- Real deployment would fall under Ontario's PHIPA: guardian consent, data stored in Canada, retention limits, audit log (`nurse_actions` is the start).
- No diagnosis, no triage, no medical advice. The staff side has no AI — nurses read the child's words and decide.
- Alerts come from simple, explainable rules in code, never from the AI.
- Games are just for fun — we make no claims about measuring health from play.
- Child-safe AI: on-topic only, no open chat.
- **Safeguarding:** two independent detectors (phrase list in 5 languages + AI signal), flag if either fires. Ralph gives one fixed calm line and never probes. The flag is visible only to staff — never on the kiosk or parent view. We bias toward false positives.
- Accessibility: tap fallback for every question, on-screen text with all audio, high-contrast mode, large targets.
- Bias: kids' speech + accents → low-confidence path falls back to taps and parent; no penalty for being hard to transcribe. Translations keep the child's phrasing.
- Alert rules are team-defined demo rules; real use needs clinician-validated criteria.
