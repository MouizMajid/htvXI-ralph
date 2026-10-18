import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_RECORDING_MS, recordingSupported, startRecording, type Recording } from '../../lib/recorder';

type State = 'idle' | 'starting' | 'listening' | 'sending' | 'unavailable';

interface Props {
  /** The child finished talking: send the WAV. Resolves when the answer has been handled. */
  onAudio: (audio: Blob) => Promise<void>;
  /** Fires true while the mic is open (Ralph leans in to listen). */
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
}

/**
 * Tap to talk, tap again when done (stops by itself after 15 s). Voice is optional (rule 4):
 * if the microphone is missing or blocked this button disappears and the child taps instead.
 */
export function TalkButton({ onAudio, onListeningChange, disabled }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(recordingSupported() ? 'idle' : 'unavailable');
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_MS / 1000);
  const rec = useRef<Recording | null>(null);

  useEffect(() => onListeningChange?.(state === 'listening'), [state, onListeningChange]);
  useEffect(() => () => rec.current?.cancel(), []); // leaving the screen closes the mic

  useEffect(() => {
    if (state !== 'listening') return;
    const started = Date.now();
    const id = setInterval(
      () => setSecondsLeft(Math.max(0, Math.ceil((MAX_RECORDING_MS - (Date.now() - started)) / 1000))),
      250,
    );
    return () => clearInterval(id);
  }, [state]);

  const finish = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setState('sending');
    try {
      await onAudio(await r.stop());
    } finally {
      setState((s) => (s === 'sending' ? 'idle' : s));
    }
  };

  const start = async () => {
    setState('starting');
    try {
      rec.current = await startRecording(() => void finish());
      setSecondsLeft(MAX_RECORDING_MS / 1000);
      setState('listening');
    } catch {
      setState('unavailable'); // permission denied or no mic: taps still work
    }
  };

  if (state === 'unavailable') return null;

  const listening = state === 'listening';
  return (
    <button
      type="button"
      disabled={disabled || state === 'starting' || state === 'sending'}
      onClick={() => void (listening ? finish() : start())}
      aria-pressed={listening}
      className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-card px-6 text-2xl font-extrabold shadow-soft transition active:scale-95 disabled:opacity-60 ${
        listening ? 'animate-pulse bg-no text-on-primary' : 'bg-secondary text-on-secondary'
      }`}
    >
      <span aria-hidden className="text-3xl">
        {listening ? '⏹️' : state === 'sending' ? '⏳' : '🎤'}
      </span>
      {listening
        ? t('talk.listening', { seconds: secondsLeft })
        : state === 'sending'
          ? t('talk.sending')
          : t('talk.start')}
    </button>
  );
}
