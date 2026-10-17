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

Plus a 30 s **multilingual** moment: a second child checks in in Hindi or Mandarin; Ralph speaks that language; the dashboard shows the English translation next to the child's original words.

Run the kiosk on a phone/iPad and the dashboard on a laptop side by side.

## Tracks
| Track | How RALPH qualifies |
|---|---|
| Healthcare Innovation & Well-being | Gives kids a voice in the waiting room and gets their story to the nurse first |
| AI for Social Impact | Kids who can't explain symptoms to strangers; multilingual access for newcomer families; AI used only for understanding and translating — humans make every clinical call |
| PointClickCare — Catch It Early | Regular check-ins turn "I feel worse" into an early, **explained** alert ("pain went from 2 → 4") instead of something nobody hears |
| MLH Best Use of Gemini API | Transcribe (child speech), answer interpretation, translation to English, Ralph's voice (TTS) in 5 languages |
| MLH Best Use of Tiger Data | Relational visits/conversations + a check-ins hypertable; continuous aggregate for each child's check-in timeline |
| MLH Best Domain Name (GoDaddy Registry) | Custom domain → Vercel deployment (confirm eligible TLDs) |
| MLH DEV Writing Challenge (post-event) | Write-up: AI on the child side only, deterministic alerts, serverless on Vercel + Tiger |

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
