# RALPH — Pitch, demo, tracks, ethics

## One-paragraph pitch
Kids in paediatric ERs and walk-in clinics wait a long time, can't always explain what's wrong, and can quietly get worse while they wait. **RALPH** is a friendly hand-drawn raccoon on a waiting-room tablet who talks with the child (speech-to-text + text-to-speech), asks simple questions that get more specific as the child answers, and plays short games that double as alertness checks. Nurses get a live dashboard: a queue sorted by suggested urgency, a summary in the child's own words, trends over time, red-flag alerts that explain **why**, and a 15-second audio briefing they can listen to while walking the floor. When the doctor walks in, they can say: *"Ralph told me your tummy hurts. Can you show me where?"*

**Core claim:** RALPH helps the care team catch a child getting worse sooner and turns waiting time into useful clinical information.

**Who it's for:** children aged **4–12**. Families with younger children can still use RALPH in *parent mode* (the parent answers; no games), with fewer signals.

## Users
| User | Device | Needs |
|---|---|---|
| Child (4–12) | Phone or iPad (waiting-room tablet or parent's phone via QR at check-in) | Friendly, simple, big buttons, short sentences, voice, games |
| Parent/guardian | Same device | Confirm transcript, add details, pick language |
| Triage nurse | Laptop or iPad | Prioritized queue, why a kid is flagged, quick audio briefing |
| Doctor | Dashboard patient view | Child's own words, trend, a conversation opener |

## Demo script (~90 s)
1. Kiosk: Maya (6) taps "tummy." Ralph asks where; she taps lower belly; says "it hurts really bad and I threw up."
2. Parent confirms, adds "started this morning, no fever."
3. Dashboard: Maya appears, suggested level 3, stable.
4. Demo panel → fast-forward 40 min. Check-in: "worse," face 4. Bubble Pop reaction time 35% slower than her baseline.
5. Dashboard: Maya jumps up the queue → **escalate**, reasons listed.
6. Nurse hits ▶ Play briefing (15 s).
7. Doctor view shows opener: "Ralph told me your tummy hurts. Can you show me where?"

Plus a 30 s **multilingual** moment: a second child checks in in Hindi or Mandarin; Ralph speaks that language; dashboard shows English summary with the original words.

Run the kiosk on a phone/iPad and the dashboard on a laptop side by side.

## Tracks
| Track | How RALPH qualifies |
|---|---|
| Healthcare Innovation & Well-being | Paediatric triage support + deterioration detection in the waiting room |
| AI for Social Impact | Helps kids who can't explain symptoms; multilingual access for newcomer families; explainable, human-in-the-loop |
| PointClickCare — Catch It Early | Small signals (pain trend, slower reactions, missed check-ins) → early, **explained** alerts. Bonus for explaining *why* → our reason strings |
| MLH Best Use of Gemini API | Transcribe, interpretation, multilingual Ralph, staff summaries, TTS for Ralph + briefings |
| MLH Best Use of Tiger Data | Relational visits + hypertables for telemetry + continuous aggregates powering live trends and scoring |
| MLH Best Use of Vultr | Whole app on a Vultr VM with Docker Compose + Caddy |
| MLH Best Domain Name (GoDaddy Registry) | Custom domain → Vultr deployment (confirm eligible TLDs) |
| MLH DEV Writing Challenge (post-event) | Write-up: architecture, deterministic safety + LLM design, Tiger caggs |

Not targeting: Solana (blockchain for kids' health data is a privacy negative).

## Privacy, safety, ethics (slide + README section)
- Synthetic data only; `is_synthetic` on every patient.
- Real deployment would fall under Ontario's PHIPA: guardian consent, data stored in Canada, retention limits, audit log (`nurse_actions` is the start).
- Human in the loop: nurse confirms every level; overrides logged.
- No diagnosis, no medical advice to families.
- Child-safe AI: on-topic only, no open chat.
- **Safeguarding:** two independent detectors (deterministic phrase list in 5 languages + LLM signal), flag if either fires. Ralph gives one fixed calm line and never probes. The flag is visible only to staff — never on the kiosk, parent view, or audio briefing. We bias toward false positives.
- Accessibility: tap fallback for every question, on-screen text with all audio, high-contrast mode, large targets.
- Bias: kids' speech + accents → low-confidence path falls back to taps and parent; no penalty for being hard to transcribe.
- Triage rules are team-defined demo rules; real use needs clinician-validated criteria.
