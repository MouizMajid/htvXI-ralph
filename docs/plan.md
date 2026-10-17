# RALPH — Schedule, decisions, open questions

## Hour-by-hour (T = ~1:00 AM Sat; draft due ~T+20, presentation ~T+30)
| Hours | Mouiz (lead dev + Claude Code) | Teammates |
|---|---|---|
| T+0–2 | Gemini key, Tiger service, Vultr VM, domain; scaffold monorepo; migrations + seed | Art: Ralph idle/talk/listen frames. Pitch: problem slide + stats. Data: Maya + 5 other synthetic scenarios |
| T+2–6 | Kiosk flow with tap answers + tummy tree + rules engine | Art: body map, faces 0–5, complaint icons. Translations of tree + UI strings reviewed by speakers |
| T+6–10 | Push-to-talk → Transcribe → interpretation; TTS + pre-generated lines | Art: remaining Ralph frames + game sprites. Pitch: script draft |
| T+10–14 | Staff queue + patient view + Socket.IO; summary generation | Testing on phone + iPad; log bugs |
| T+14–18 | Bubble Pop, check-ins, deterioration score, demo panel; deploy to Vultr | Record backup demo video once deploy is live |
| T+18–20 | **Draft submission**: Devpost text, screenshots, repo link, live URL | Devpost write-up, track selections |
| T+20–24 | **Sleep in shifts** (3–4 h each) | Same |
| T+24–28 | Tier 2: fever + breathing trees, briefing audio, trend charts, 2nd game, multilingual polish | Final slides, rehearse demo twice |
| T+28–30 | Freeze code, fix only demo-blocking bugs | Rehearse, backup video ready |

**Rule:** if a Tier 1 item slips by more than 2 hours, cut a Tier 2 item, not sleep.

## Decided
- 4-person team; Mouiz is lead developer.
- Draft ~20 h after start, presentation ~30 h.
- Ralph is a raccoon.
- Responsive website for phone, iPad, laptop (PWA for fullscreen kiosk).
- Languages: English, Hindi, Spanish, French, Mandarin (Simplified).
- Marketed for ages 4–12; under-4 allowed via parent mode with a "limited signals" note on the dashboard.
- Safeguarding uses a deterministic phrase list **and** the LLM signal (OR), with a fixed pre-translated reply.

## Still open
- Gemini API key (not claimed yet) + free-tier limits; Vultr credits
- Domain name
- Which teammate speaks/reviews each non-English language (also reviews that language's safeguarding phrase list)
