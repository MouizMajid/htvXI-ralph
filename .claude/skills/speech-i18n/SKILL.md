---
name: speech-i18n
description: RALPH voice and language pipeline — push-to-talk recording, Gemini Transcribe STT, Gemini TTS with caching and browser fallback, and multilingual rules for en/hi/es/fr/zh-CN. Use when working on audio recording, transcription, TTS, i18n strings, or translations.
---

# Speech + multilingual

## Why push-to-talk (not Live API)
Noisy waiting rooms + a controlled question tree → record clip → transcribe → interpret. Predictable, debuggable, and gives a transcript for parent confirmation. Gemini Live API is Tier 3 only.

## Speech-to-text
1. Child holds talk button → `MediaRecorder` (webm/opus), max 15 s, release to send.
2. `POST /api/visits/:id/turns/audio` (multipart).
3. API calls Gemini Transcribe (`GEMINI_STT_MODEL`) with session-language hint + vocab hints: tummy, throw up, poop, pee, ouchie, fever, cough, breathe, dizzy, itchy.
4. Transcript returned and shown under Ralph, then run through safeguarding phrase check + interpretation (see `triage-engine`).
5. Low confidence / empty audio → "Hmm, can you tap the picture instead?" + tap options. Never penalise a child for being hard to transcribe.

Mic requires HTTPS (Caddy in prod; Vite dev on localhost is fine).

## Text-to-speech
- **Fixed lines** (greetings, prompts, game instructions, `safeguarding_reply`) pre-generated **per language** at build time into `apps/web/public/audio/cache/` → zero demo latency.
- **Dynamic lines** (Ralph reactions, nurse briefings) via `POST /api/tts`, cached by hash of `(voice, lang, text)`.
- Voices from env: `RALPH_VOICE` (warm, playful, slow) and `NURSE_VOICE` (calm, clear, professional).
- TTS failure → browser `speechSynthesis`, keep going. Always show text on screen too.

## Multilingual
- Codes: `en`, `hi`, `es`, `fr`, `zh-CN` (`SUPPORTED_LANGS`). Picker shows: English, हिन्दी, Español, Français, 中文.
- Static UI strings: `apps/web/src/i18n/{lang}.json` (i18next).
- Tree questions: English in tree JSON; translations pre-generated with Gemini into `packages/shared/triage/i18n/{lang}.json`, reviewed by a teammate where possible. **Never translate at request time during the demo.**
- Accept code-switching (Hindi + English mixed is common).
- Ralph asks/reacts in session language; dashboard always English with the child's original words alongside.
- Fonts: Nunito (Latin), Noto Sans Devanagari, Noto Sans SC.
