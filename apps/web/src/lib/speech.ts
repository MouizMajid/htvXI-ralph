import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, api } from './api';

/**
 * Ralph's voice. Plays Gemini TTS (pre-generated with `pnpm tts:warm`, cached on the server).
 * A line the server doesn't have comes back 404 at once and Ralph uses the browser's built-in
 * voice; so does a clip that fails or takes too long.
 *
 * One voice at a time: fixed lines (questions, "Thank you!") are all pre-generated, so the
 * question flow stays in Ralph's Gemini voice. Live lines (chat replies) can only be Gemini when
 * the server generates on demand (TTS_ON_DEMAND); once it says it doesn't, every live line uses
 * the browser voice, so a chat doesn't flip between the two.
 * No mute: the tablet's volume handles sound, and check-ins can't be switched off.
 */

/** Wait this long for a pre-generated clip before using the browser voice instead. */
const CACHED_MS = 4000;
/** Live generation takes ~4 s (more on a busy day); wait this long for it. */
const LIVE_MS = 9000;

/** Can the server make new clips on demand? null until it tells us. */
let liveVoice: boolean | null = null;

// ---- "is Ralph talking?" (drives his mouth animation) ----
let speaking = false;
const listeners = new Set<() => void>();
function setSpeaking(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  listeners.forEach((l) => l());
}
export function useSpeaking(): boolean {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => speaking,
    () => false,
  );
}

// ---- one shared <audio> element, unlocked by the first tap (iOS/Chrome autoplay rules) ----
let audioEl: HTMLAudioElement | null = null;
const audio = () => (audioEl ??= new Audio());
// 0.1 s of silence, played inside a user gesture to unlock later playback.
const SILENCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAAAAAAA';

/** Call from a tap handler (KioskApp does it on the first tap) so later audio may autoplay. */
export function unlockAudio() {
  const a = audio();
  if (a.dataset.unlocked) return;
  a.dataset.unlocked = '1';
  a.src = SILENCE;
  void a.play().catch(() => delete a.dataset.unlocked);
}

// ---- Gemini TTS URLs, memoised per text (the server caches the audio itself) ----
const urls = new Map<string, Promise<string>>();
function ttsUrl(text: string): Promise<string> {
  let p = urls.get(text);
  if (!p) {
    p = api<{ url: string; cached: boolean }>('/tts', { method: 'POST', body: JSON.stringify({ text }) }).then((r) => {
      if (!r.cached) liveVoice = true;
      return r.url;
    });
    p.catch((err) => {
      urls.delete(text); // let a later attempt retry
      if (err instanceof ApiError && err.status === 404 && err.message.includes('"on_demand":false')) liveVoice = false;
    });
    urls.set(text, p);
  }
  return p;
}

/** Ask the server to have this line ready. Fire-and-forget. */
export function prefetchSpeech(text: string) {
  void ttsUrl(text).catch(() => {});
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function browserSpeak(text: string, lang: string, done: () => void): () => void {
  if (!ttsSupported()) {
    const t = setTimeout(done, readingTimeMs(text));
    return () => clearTimeout(t);
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 1;
  u.pitch = 1.25; // a little higher = friendlier raccoon
  u.onend = done;
  u.onerror = done;
  window.speechSynthesis.speak(u);
  const safety = setTimeout(done, readingTimeMs(text) + 4000); // some browsers never fire onend
  return () => {
    clearTimeout(safety);
    window.speechSynthesis.cancel();
  };
}

let cancelCurrent: (() => void) | null = null;

/**
 * Ralph says `text`. Calls `onEnd` once when he's finished. Returns a cancel function (no onEnd).
 * `live`: a line made up on the spot (chat reply) rather than a fixed, pre-generated one.
 */
export function speak(text: string, lang: string, onEnd: () => void, opts: { live?: boolean } = {}): () => void {
  cancelCurrent?.();
  let finished = false;
  let usingBrowser = false;
  let stop = () => {};

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(slow);
    setSpeaking(false);
    if (cancelCurrent === cancel) cancelCurrent = null;
    onEnd();
  };
  const useBrowser = () => {
    if (finished || usingBrowser) return;
    usingBrowser = true;
    clearTimeout(slow);
    stop = browserSpeak(text, lang, finish);
  };
  const slow = setTimeout(useBrowser, opts.live ? LIVE_MS : CACHED_MS);
  setSpeaking(true);

  if (opts.live && liveVoice === false) {
    useBrowser(); // the server can't make this line; keep the whole chat in one voice
  } else {
    ttsUrl(text)
      .then((url) => {
        if (finished || usingBrowser) return;
        clearTimeout(slow);
        const a = audio();
        a.onended = finish;
        a.onerror = useBrowser;
        a.src = url;
        stop = () => a.pause();
        return a.play();
      })
      .catch(useBrowser);
  }

  const cancel = () => {
    if (finished) return;
    finished = true;
    clearTimeout(slow);
    stop();
    setSpeaking(false);
    if (cancelCurrent === cancel) cancelCurrent = null;
  };
  cancelCurrent = cancel;
  return cancel;
}

export function readingTimeMs(text: string): number {
  return 1200 + text.split(/\s+/).length * 350;
}

/** Ralph says `text` once when it appears (or changes); stops if the screen goes away. */
export function useSay(text: string | null, lang: string) {
  useEffect(() => (text ? speak(text, lang, () => {}) : undefined), [text, lang]);
}
