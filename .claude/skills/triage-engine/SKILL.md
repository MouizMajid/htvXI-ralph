---
name: triage-engine
description: RALPH triage logic — question tree JSON format, per-turn Gemini interpretation contract, red-flag rules, suggested level, deterioration score, and safeguarding detection. Use when working in packages/shared/triage, apps/api/src/triage, apps/api/src/scoring, or anything deciding urgency or alerts.
---

# Triage engine

Golden rule: **code decides, the LLM interprets.** Everything here is pure, deterministic, and unit-tested with Vitest.

## Tree format (`packages/shared/triage/trees/*.json`)
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
`answer_type`: `yes_no | choice | body_map | faces | number | free_speech`. Max ~8–10 questions per tree. Trees: `tummy` (Tier 1), `fever`, `breathing` (Tier 2).
English source text lives in the tree; translations are pre-generated into `packages/shared/triage/i18n/{lang}.json`.

## Per-turn AI call (interpretation, not decision)
Input to Gemini: node definition, child age, language, last few turns, raw transcript.
Output JSON (Zod-validated; retry once, then fall back to tap options):
```ts
{
  slot_value: string | number | null,   // mapped to node's options when applicable
  confidence: number,                    // 0–1
  needs_clarification: boolean,          // true → show tap options / ask parent
  ralph_reply: string,                   // ≤ 20 words, kind, simple, session language
  extra_symptoms: string[],              // anything else the child mentioned, normalized
  safeguarding_concern: boolean,         // one of two safeguarding signals — see below
  off_topic: boolean
}
```
Then **code** writes the slot, runs the safeguarding check, evaluates red-flag rules, and picks the next node.

## Red flags (team-defined demo rules, `packages/shared/triage/rules.ts`)
Pure functions over slot map + check-ins + game metrics:
- Trouble breathing / "can't breathe" / working hard to breathe
- Very sleepy, hard to wake, or not responding to two check-ins in a row
- Vomiting repeatedly + no fluids kept down / no pee for a long time
- Severe pain (faces 5) or pain moving to lower-right tummy
- Fever in a very young child (age threshold set by team)
- Rash + fever together
- Safeguarding concern (private flag, separate channel)

## Suggested level
Rules map to a 1–5 level modelled loosely on PaedsCTAS. UI label: **"Suggested level 3 — nurse to confirm."** README must note real use requires clinician-validated criteria.

## Deterioration score (`apps/api/src/scoring`)
Recomputed on every check-in and game round. Every point carries a reason string.

| Signal | Points | Reason example |
|---|---|---|
| Faces/pain up ≥ 2 vs first report | +2 | "Pain went from 2 → 4" |
| Check-in "worse" | +1 | "Said tummy feels worse" |
| New red-flag symptom | ALERT | "New: says it's hard to breathe" |
| Reaction time > 30% slower than own baseline | +2 | "Reaction time down 35%" |
| Reaction time > 50% slower | +3 (replaces +2) | |
| Game accuracy drop > 25% | +1 | "Missing more targets" |
| No response to 2 check-ins in a row | +2 + ALERT | "Not responding to Ralph" |
| Waited longer than target for suggested level | +1 | "Waiting 95 min (target 60)" |

Bands: **0–2 stable**, **3–4 watch**, **5+ escalate** (moves up queue, dashboard alert + sound). Baseline = child's first game round.
**Parent mode (under 4):** no games, so score uses check-ins, red flags, and wait time only. Patient view should show "Limited signals — parent mode" so nobody reads a low score as reassurance.

## Safeguarding (`packages/shared/triage/safeguarding.ts`)
Two independent signals; **flag if either fires** (OR, never AND):
1. **Deterministic phrase check (code):** normalized transcript (lowercase, strip punctuation; for `zh-CN` match on characters, no word boundaries) matched against a curated phrase list per language in `packages/shared/triage/i18n/safeguarding/{lang}.json` — e.g. "hits me", "hurts me", "scared to go home", "touched me", "not safe". Phrase lists reviewed by a speaker of each language where possible. Runs on every free-speech transcript and on parent free-text.
2. **LLM signal:** `safeguarding_concern: true` from the interpretation call.

Also treat as a fired signal: the interpretation call failing Zod validation twice on a transcript the phrase check already found borderline (fail toward flagging).

When it fires:
- Ralph says one **fixed, pre-translated** line — never LLM-written: "Thank you for telling me. A nurse will come talk with you." Stored in `packages/shared/triage/i18n/{lang}.json` as `safeguarding_reply`, with **TTS pre-generated per language** at build time.
- Insert `flags` row with `kind = 'safeguarding'` and reason = which signal(s) fired + the triggering phrase. Emit `flag:new` to staff only.
- No follow-up questions about it. The tree continues normally after the line.
- Never shown on kiosk or parent screens, never in the parent-confirm transcript view, never in the audio briefing. Visible only on the staff patient view in a distinct style.
- False positives are acceptable; false negatives are not. Tests must cover each language with at least one positive and one benign phrase (e.g. "my brother hit the ball").
