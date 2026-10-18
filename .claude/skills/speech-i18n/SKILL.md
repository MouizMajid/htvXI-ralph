---
name: speech-i18n
description: RALPH voice and language pipeline — push-to-talk recording, Gemini Transcribe STT, Gemini TTS with caching and browser fallback, and multilingual rules for en/hi/es/fr/zh-CN. Use when working on audio recording, transcription, TTS, i18n strings, or translations.
---

# Speech + multilingual

## Why tap-to-talk clips (not Live API)
Noisy waiting rooms + a controlled question tree → record clip → transcribe → interpret. Predictable, debuggable, and gives a transcript for parent confirmation. Gemini Live API is Tier 3 only.

## Speech-to-text
1. Child taps "Tap and tell Ralph" (`kiosk/components/TalkButton.tsx`), taps again to stop (auto-stop at 15 s). `lib/recorder.ts` records **16 kHz mono WAV** (`lib/wav.ts`) — the transcription model rejects `audio/mp4`, which is what Safari's `MediaRecorder` makes. No mic / permission denied → the button hides; taps always work.
2. Question screen: `POST /api/visits/:id/turns/audio` (multipart, `node_id` field first, then `audio`) → `SpokenAnswerResponse {heard, accepted, value, next, reply, line}`. Companion chat: `POST /api/visits/:id/transcribe` → `{text}`, then sent as a normal chat message.
3. API (`apps/api/src/ai/voice.ts`) calls Gemini Transcribe (`GEMINI_STT_MODEL`, Interactions API) with a language hint (Hindi left to auto-detect for code-switching) + kid vocabulary (tummy, throw up, poop, pee, ouchie, fever, cough, breathe, dizzy, itchy, belly button, Ralph).
4. `engine.answerSpoken`: plain English answers are read by code first (`quickAnswer`, instant, no Gemini); otherwise interpretation (`ai/interpret.ts`, 8 s budget). `normalizeAnswer` validates the value either way. A Gemini answer is accepted only if valid AND confidence ≥ 0.6 AND no clarification needed (free-speech nodes take the words as-is). Accepted → saved like a tap with `input: 'voice'` + original words + `text_en`. Ralph says the fixed "Thank you!" — the model's own `line` only when `TTS_ON_DEMAND` (so his voice never switches mid-flow).
5. Not accepted → the words are still saved for the nurse (`saveHeardTurn`), safeguarding runs (phrase list OR LLM flag), and Ralph asks for a tap with a line that fits the question (`talk.tryTapping.body_map | faces | other`); nothing heard → `talk.notHeard`. Never penalise a child for being hard to transcribe. "I heard: …" shows under Ralph (except after a safeguarding reply).
6. Latency: transcription ~2 s + interpretation; a spoken answer takes ~5–11 s end to end, shown as "Thinking…".

Mic requires HTTPS: automatic on Vercel (production + preview URLs); `localhost` also counts as secure. Phones hitting the laptop's LAN IP over http have no mic — test voice there via a Vercel preview URL.

## Text-to-speech
- Gemini TTS (`GEMINI_TTS_MODEL`, Interactions API) → 24 kHz WAV, voice `RALPH_VOICE` (default Achird), style `RALPH_STYLE` in `ai/voice.ts`. Ralph is the only voice — the staff side has no audio.
- Cache: Postgres `tts_cache` (Vercel has no disk), key = sha256 of `(model, voice, style, text)` — no language; the model detects it. `POST /api/tts {text}` → `{url: "/api/tts/<hash>"}`; `GET /api/tts/:hash` serves bytes with an immutable `Cache-Control`.
- **Fixed lines are pre-generated with `pnpm tts:warm`** (`apps/api/src/scripts/warm-tts.ts`), in demo order: greeting, complaint prompt, thanks, tummy questions, try-tapping lines, check-in, then the general tree, safeguarding + red-flag replies in every language. It skips cached lines and paces itself (free tier: 3 TTS/min, ~10/day), so rerun it any time. **Any new fixed line Ralph says must be added there.**
- **One voice:** the question flow uses only fixed lines, so once warmed it's all Gemini. Chat lines are live (`speak(…, { live: true })`): if the server says it can't generate on demand (`404 {on_demand: false}`), the whole chat uses the browser voice rather than flipping between voices. The kiosk waits up to 4 s for a cached clip, 9 s for a live one.
- Greeting: the welcome screen speaks on mount; on a freshly loaded page (no user gesture yet) it speaks on the first touch instead, unless that touch is "Let's go". Tapping Ralph replays it.
- `TTS_ON_DEMAND=false` (default): uncached lines → instant `404` and the kiosk uses the browser voice. That also stops strangers spending our quota. Set `true` only on a paid Gemini tier (free tier ≈ 10 TTS requests/day).
- Kiosk (`lib/speech.ts`): `speak(text, lang, onEnd, {live?})` / `useSay` play the cached clip through one shared `<audio>` (unlocked on the first tap — browsers block audio before a user gesture); if it fails or isn't ready in time → browser `speechSynthesis`. Ralph's pose is `talk` while speaking (`useSpeaking`). 🔊 "Hear it again" replays. Always show the text on screen too.
- Gemini clients have retries off (`attempts: 1`): a 429 must fail fast, not hang the kiosk for a minute.

## Multilingual
- Codes: `en`, `hi`, `es`, `fr`, `zh-CN` (`SUPPORTED_LANGS`). Picker shows: English, हिन्दी, Español, Français, 中文.
- Static UI strings: `apps/web/src/i18n/{lang}.json` (i18next).
- Tree questions: English in tree JSON; translations pre-generated with Gemini into `packages/shared/triage/i18n/{lang}.json`, reviewed by a teammate where possible. **Never translate at request time during the demo.**
- Accept code-switching (Hindi + English mixed is common).
- Ralph asks/reacts in session language. Each child answer is translated to English (`text_en` from the per-turn interpretation call) and the dashboard shows English with the child's original words alongside. Translation keeps the child's phrasing, never clinical rewording.
- Fonts: Nunito (Latin), Noto Sans Devanagari, Noto Sans SC.
