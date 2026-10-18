import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * Ralph's voice. Plays Gemini TTS (generated once, cached on the server); if it isn't ready
 * within FAST_MS — or fails — Ralph uses the browser's built-in voice so the child never waits.
 * The slow clip still finishes on the server and is instant next time.
 * No mute: the tablet's volume handles sound, and check-ins can't be switched off.
 */

/** Wait this long for Gemini audio before using the browser voice instead. */
const FAST_MS = 1500;

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
    p = api<{ url: string }>('/tts', { method: 'POST', body: JSON.stringify({ text }) }).then((r) => r.url);
    p.catch(() => urls.delete(text)); // let a later attempt retry
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

/** Ralph says `text`. Calls `onEnd` once when he's finished. Returns a cancel function (no onEnd). */
export function speak(text: string, lang: string, onEnd: () => void): () => void {
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
    stop = browserSpeak(text, lang, finish);
  };
  const slow = setTimeout(useBrowser, FAST_MS);

  setSpeaking(true);
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
    .catch(() => {
      clearTimeout(slow);
      useBrowser();
    });

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
