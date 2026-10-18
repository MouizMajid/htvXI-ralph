---
name: triage-engine
description: RALPH conversation + alert logic — question tree JSON format, per-turn Gemini interpretation contract, red-flag alerts, check-in "getting worse" alerts, and safeguarding detection. Use when working in packages/shared/triage, apps/api/src/triage, or anything that raises a staff alert.
---

# Triage engine

## Code map (`packages/shared`, all exported from `@ralph/shared`)
- `triage/trees.ts` — `TREES` (`tummy`, `general`), `treeForComplaint()` (Tier 1: fever/breathing/other → `general`), `getNode()`, `nextNodeId()`, `normalizeAnswer(node, value)` (validates taps + interpreted voice; returns null if invalid; clamps "N or more").
- `triage/rules.ts` — `evaluateAlerts(AlertInput)` → `Alert[]` (red flags, getting worse, not responding); thresholds in `RULES`; `BREATHING_PHRASES`, `SAID_RED_FLAGS` (chest, blood, fainted, swelling, head injury, swallowed…); `worryingWords(textEn)` checks one chat message; `RED_FLAG_REPLY` (fixed, pre-translated chat reply).
- `triage/quick.ts` — `quickAnswer(node, transcript, lang)`: plain English answers ("belly button", "yeah", "a lot", "twice") mapped by code before Gemini is asked. Conservative: vague ("my tummy"), mixed, or negated → null.
- `triage/safeguarding.ts` — `detectSafeguarding()` (phrase lists OR LLM), `safeguardingAlert()`.
- `triage/text.ts` — `normalizeText()`, `findPhrase()` (whole words; substrings for zh-CN), `findLoosePhrase()` (allows up to 2 filler words — "chest *really* hurts" — but a negation nearby blocks it). Red-flag lists use the loose match.
- `schemas.ts` — `ParentAnswersSchema`, `CheckinSchema`, `InterpretationSchema` (with `text_en`), `CreateVisitBodySchema`; `types.ts` — `COMPLAINTS`, `BODY_REGIONS`, `YES_NO`, `Alert`.
- `triage/fixtures/maya.ts` — the demo scenario; reuse it in API tests and the seed.
- **Alert `key`s are stable** (`red:no_pee`, `det:pain_up:4`, `unresp:2`, `safeguarding:<phrase>`): the API re-runs `evaluateAlerts` after every change and inserts only keys the visit doesn't already have.

RALPH does **not** triage. It gathers the child's story in a structured way and raises a few plain-language alerts. **The nurse triages, in person.**
Golden rule: **code decides alerts, the LLM only interprets and translates.** Everything here is pure, deterministic, and unit-tested with Vitest.

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
Spoken answers try `quickAnswer` first (English only); only what it can't read goes to Gemini. Free-speech answers always go to Gemini (translation + its safeguarding signal).
Input to Gemini: node definition, child age, language, last few turns, raw transcript.
Output JSON (Zod-validated; retried once on bad JSON, all within an 8 s budget; API errors fall back at once to tap options):
```ts
{
  slot_value: string | number | null,   // mapped to node's options when applicable
  confidence: number,                    // 0–1
  needs_clarification: boolean,          // true → show tap options / ask parent
  ralph_reply: string,                   // ≤ 20 words, kind, simple, session language
  text_en: string,                       // English translation of the child's words (= original if en)
  extra_symptoms: string[],              // anything else the child mentioned, normalized, English
  safeguarding_concern: boolean,         // one of two safeguarding signals — see below
  off_topic: boolean
}
```
Then **code** writes the slot, runs the safeguarding check, evaluates alert rules, and picks the next node.

## Alerts (team-defined demo rules, `packages/shared/triage/rules.ts`)
No suggested level, no numeric score. Each alert is `{ kind, reason }` with a plain-English reason a nurse reads in two seconds. Pure functions over the slot map + check-ins.

**Red flags** (`kind: 'red_flag'`) — from answers:
- Trouble breathing / "can't breathe" / working hard to breathe
- Very sleepy or hard to wake (parent-reported)
- Vomiting many times (team threshold) + can't keep fluids down / no pee for a long time
- Worst pain face (5)
- Fever in a very young child (age threshold set by team)
- Rash + fever together
- Worrying words anywhere the child speaks or types (tree answers, chat, check-in notes): chest pain, blood, fainting, throat/lips swelling, hit their head, swallowed something, etc. In chat, Ralph answers these with the fixed `red_flag_reply` ("I'm letting the nurse know right now") and offers the tap check-in — never chit-chat.

**Getting worse** (`kind: 'deterioration'`) — from check-ins:
- Pain face up ≥ 2 from first report → "Pain went from 2 → 4"
- Said "worse" at two check-ins in a row → "Said tummy feels worse twice"
- New red-flag symptom mentioned at a check-in → "New: says it's hard to breathe"

**Not responding** (`kind: 'unresponsive'`): no answer to 2 check-ins in a row → "Didn't answer Ralph's last 2 check-ins".

**Games produce no alerts.** They are entertainment only.

Queue order on the dashboard: children with unacknowledged alerts first, then by arrival time.

## Safeguarding (`packages/shared/triage/safeguarding.ts`)
Two independent signals; **flag if either fires** (OR, never AND):
1. **Deterministic phrase check (code):** normalized transcript (lowercase, strip punctuation; for `zh-CN` match on characters, no word boundaries) matched against a curated phrase list per language in `packages/shared/triage/i18n/safeguarding/{lang}.json` — e.g. "hits me", "hurts me", "scared to go home", "touched me", "not safe". Lists reviewed by a speaker of each language where possible. Runs on every free-speech transcript and on parent free text.
2. **LLM signal:** `safeguarding_concern: true` from the interpretation call.

If the interpretation call fails validation twice on a transcript the phrase check already found borderline, treat it as fired (fail toward flagging).

When it fires:
- Ralph says one **fixed, pre-translated** line — never LLM-written: "Thank you for telling me. A nurse will come talk with you." (`safeguarding_reply` in `packages/shared/triage/i18n/{lang}.json`, TTS pre-generated per language.)
- Insert a `flags` row with `kind = 'safeguarding'`, reason = which signal(s) fired + the triggering phrase.
- No follow-up questions. The tree continues normally after the line.
- Never shown on kiosk or parent screens, never in the parent-confirm view. Visible only on the staff patient view in a distinct style.
- False positives are acceptable; false negatives are not. Tests cover each language with a positive and a benign phrase (e.g. "my brother hit the ball").
