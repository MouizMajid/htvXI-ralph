/**
 * Browser speech for Ralph's voice (and the child's, via speech recognition). No mute: the
 * tablet's volume handles sound, and check-ins can't be switched off.
 * TODO(Tier 1 #3/#4): swap to Gemini TTS (/api/tts) + Transcribe (/turns/audio)
 * per the speech-i18n skill; keep these as the documented fallback.
 */

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Speak `text`; calls `onEnd` exactly once. Returns a cancel function. */
export function speak(text: string, lang: string, onEnd: () => void): () => void {
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onEnd();
  };
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
  // Some browsers never fire onend — safety net.
  const safety = setTimeout(done, readingTimeMs(text) + 4000);
  return () => {
    clearTimeout(safety);
    finished = true;
    window.speechSynthesis.cancel();
  };
}

export function readingTimeMs(text: string): number {
  return 1200 + text.split(/\s+/).length * 350;
}

// ---- speech recognition (Web Speech API; Chrome/Edge/Safari) ----

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Listen for one utterance. Returns a stop function. */
export function listenOnce(
  lang: string,
  onText: (text: string) => void,
  onEnd: () => void,
): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onEnd();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript?.trim();
    if (text) onText(text);
  };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  try {
    rec.start();
  } catch {
    onEnd();
  }
  return () => rec.stop();
}
