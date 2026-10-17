import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AUTO_CHECKIN_MINUTES,
  DEFAULT_COMPANION_TIMINGS,
  FALLBACK_TOPICS,
  fallbackReply,
  fastCompanionTimings,
  type CompanionTimings,
  type Feeling,
  type Lang,
} from '@ralph/shared';
import { Ralph } from '../components/Ralph';
import { MuteCheckinButton } from '../components/MuteCheckinButton';
import type { RalphPose } from '../art';
import { companionTurn, postCheckin } from '../../lib/kioskApi';
import { listenOnce, speak, sttSupported, useRalphMuted } from '../../lib/speech';

/**
 * Ralph Waiting-Room Companion & 12-Minute Automatic Check-In
 *
 * - Warm back-and-forth conversation about how the child is feeling + hobbies,
 *   favourite animals, games, foods, superpowers.
 * - If the child stops responding (or taps "I want to rest"), Ralph goes quiet
 *   so they aren't overwhelmed.
 * - While quiet, if the child speaks/taps at any time, Ralph wakes right back up.
 * - Automatically checks in every 12 minutes (`DEFAULT_COMPANION_TIMINGS.quietCheckinMs`)
 *   asking "Hey, how are you feeling now?" UNLESS muted via the Mute button.
 * - If a check-in goes unanswered, logs `feeling: 'no_response'` (two in a row
 *   triggers the staff `unresponsive` alert on the API).
 */

interface CompanionProps {
  visitId?: string;
  firstName?: string;
  ageYears?: number;
  language?: Lang;
  onSwitchToGames?: () => void;
}

interface ChatTurn {
  speaker: 'ralph' | 'child';
  text: string;
}

type Mode = 'ralph_speaking' | 'awaiting_child' | 'thinking' | 'quiet';

export function Companion({
  visitId = 'demo',
  firstName = 'friend',
  ageYears = 7,
  language = 'en',
  onSwitchToGames,
}: CompanionProps) {
  const { t } = useTranslation();
  const [muted] = useRalphMuted();

  const [demoFast, setDemoFast] = useState(false);
  const timings: CompanionTimings = demoFast ? fastCompanionTimings : DEFAULT_COMPANION_TIMINGS;

  const openingLine = t(
    'companion.opening',
    "Hi {{name}}! We don't have to play any games. How are you feeling right now? Or we can chat about your favourite things!",
    { name: firstName },
  );

  const [turns, setTurns] = useState<ChatTurn[]>([{ speaker: 'ralph', text: openingLine }]);
  const [mode, setMode] = useState<Mode>('ralph_speaking');
  const [isCheckinPrompt, setIsCheckinPrompt] = useState(true);
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState('');
  const [painFace, setPainFace] = useState<number | null>(null);
  const [checkinRemainingSec, setCheckinRemainingSec] = useState<number>(
    Math.round(timings.quietCheckinMs / 1000),
  );

  const turnIdxRef = useRef(0);
  const cancelTtsRef = useRef<(() => void) | null>(null);
  const stopSttRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkinDeadlineRef = useRef<number>(Date.now() + timings.quietCheckinMs);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const clearCheckinTimer = useCallback(() => {
    if (checkinTimerRef.current) clearTimeout(checkinTimerRef.current);
    checkinTimerRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    clearSilenceTimer();
    clearCheckinTimer();
  }, [clearCheckinTimer, clearSilenceTimer]);

  const ralphSay = useCallback(
    (line: string, checkin: boolean, goQuietAfter = false) => {
      clearSilenceTimer();
      cancelTtsRef.current?.();
      setIsCheckinPrompt(checkin);
      setMode('ralph_speaking');
      cancelTtsRef.current = speak(line, language, () => {
        if (goQuietAfter) {
          setMode('quiet');
        } else {
          setMode('awaiting_child');
        }
      });
    },
    [clearSilenceTimer, language],
  );

  // Speak the opening line on mount
  useEffect(() => {
    ralphSay(openingLine, true, false);
    return () => {
      clearTimers();
      cancelTtsRef.current?.();
      stopSttRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When awaiting the child's response, start the silence timer: if the child
  // stops responding, Ralph goes silent until they talk again or the 12-min check-in fires.
  useEffect(() => {
    if (mode !== 'awaiting_child' || listening) return;
    silenceTimerRef.current = setTimeout(() => {
      if (isCheckinPrompt) {
        // Unanswered check-in → record no_response so staff knows if 2 in a row happen
        void postCheckin(visitId, {
          feeling: 'no_response',
          pain_face: painFace,
          source: 'timer',
        });
      }
      setMode('quiet');
    }, timings.replyWaitMs);

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [isCheckinPrompt, listening, mode, painFace, timings.replyWaitMs, visitId]);

  const triggerCheckinNow = useCallback(() => {
    clearTimers();
    checkinDeadlineRef.current = Date.now() + timings.quietCheckinMs;
    setCheckinRemainingSec(Math.round(timings.quietCheckinMs / 1000));
    const line = t('companion.checkinLine', 'Hey, how are you feeling now?');
    setTurns((prev) => [...prev, { speaker: 'ralph', text: line }]);
    ralphSay(line, true, false);
  }, [clearTimers, ralphSay, t, timings.quietCheckinMs]);

  // Automatic 12-minute check-in timer — runs continuously UNLESS muted!
  useEffect(() => {
    clearCheckinTimer();
    if (muted) {
      return;
    }

    checkinDeadlineRef.current = Date.now() + timings.quietCheckinMs;
    setCheckinRemainingSec(Math.round(timings.quietCheckinMs / 1000));

    const tick = setInterval(() => {
      const rem = Math.max(0, Math.ceil((checkinDeadlineRef.current - Date.now()) / 1000));
      setCheckinRemainingSec(rem);
    }, 500);

    checkinTimerRef.current = setTimeout(() => {
      clearInterval(tick);
      triggerCheckinNow();
    }, timings.quietCheckinMs);

    return () => {
      clearInterval(tick);
      clearCheckinTimer();
    };
  }, [clearCheckinTimer, muted, timings.quietCheckinMs, triggerCheckinNow, mode]);

  const sendChildMessage = useCallback(
    async (rawText: string, explicitFeeling?: Exclude<Feeling, 'no_response'>) => {
      const text = rawText.trim();
      if (!text) return;
      clearSilenceTimer();
      cancelTtsRef.current?.();

      const historySnapshot = turns;
      setTurns((prev) => [...prev, { speaker: 'child', text }]);
      setDraft('');
      setMode('thinking');

      const res = await companionTurn(visitId, {
        message: text,
        history: historySnapshot,
        first_name: firstName,
        age_years: ageYears,
        language,
        is_checkin_reply: isCheckinPrompt,
      });

      const idx = turnIdxRef.current++;
      const fb = fallbackReply(text, idx, isCheckinPrompt);
      const replyLine = res?.reply ?? fb.reply;
      const detectedFeeling = explicitFeeling ?? res?.feeling ?? fb.feeling;
      const shouldGoQuiet = res?.wants_quiet ?? fb.wantsQuiet;

      if (detectedFeeling || isCheckinPrompt) {
        void postCheckin(visitId, {
          feeling: detectedFeeling ?? 'same',
          pain_face: painFace,
          note: text,
          source: 'companion',
        });
      }

      setTurns((prev) => [...prev, { speaker: 'ralph', text: replyLine }]);
      ralphSay(replyLine, false, shouldGoQuiet);
    },
    [
      ageYears,
      clearSilenceTimer,
      firstName,
      isCheckinPrompt,
      language,
      painFace,
      ralphSay,
      turns,
      visitId,
    ],
  );

  const handleMicToggle = () => {
    if (listening) {
      stopSttRef.current?.();
      setListening(false);
      return;
    }
    cancelTtsRef.current?.();
    setListening(true);
    stopSttRef.current = listenOnce(
      language,
      (transcript) => {
        setListening(false);
        void sendChildMessage(transcript);
      },
      () => setListening(false),
    );
  };

  const pose: RalphPose = listening
    ? 'listen'
    : mode === 'ralph_speaking' && !muted
      ? 'talk'
      : mode === 'thinking'
        ? 'think'
        : mode === 'quiet' || muted
          ? 'sleep'
          : isCheckinPrompt
            ? 'gentle'
            : 'happy';

  const latestRalph = [...turns].reverse().find((x) => x.speaker === 'ralph')?.text ?? openingLine;
  const suggestedTopic = FALLBACK_TOPICS[turnIdxRef.current % FALLBACK_TOPICS.length]!;

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  };

  return (
    <section className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-between gap-4 p-4 sm:p-6">
      {/* Header with Mute Button */}
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface px-5 py-3 shadow-soft">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">
            {t('companion.title', 'Chat with Ralph')}
          </h1>
          <p className="text-xs font-semibold text-ink-muted sm:text-sm">
            {muted
              ? t(
                  'companion.mutedSub',
                  'Ralph is muted — automatic 12-minute check-ins are paused until you unmute.',
                )
              : mode === 'quiet'
                ? t(
                    'companion.quietSub',
                    'Ralph is resting quietly next to you. Say anything to wake him, or he will check in every 12 minutes.',
                  )
                : t('companion.activeSub', 'Tell Ralph how you feel or chat about things you like!')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Mute / Unmute Button */}
          <MuteCheckinButton />

          <button
            type="button"
            onClick={() => setDemoFast((v) => !v)}
            className="min-h-11 rounded-pill bg-bg px-3 text-xs font-bold text-ink-muted shadow-soft"
            title="Toggle fast timers (15s silence / 30s check-in) for live demo"
          >
            {demoFast ? '⚡ Demo (30s)' : `⏱ ${AUTO_CHECKIN_MINUTES}m Timer`}
          </button>

          {onSwitchToGames && (
            <button
              type="button"
              onClick={onSwitchToGames}
              className="min-h-11 rounded-pill bg-secondary px-4 text-sm font-bold text-on-secondary shadow-soft active:scale-95"
            >
              {t('companion.switchGames', 'Play a Game')}
            </button>
          )}
        </div>
      </header>

      {/* Ralph + Speech Bubble + Live 6-Min Check-In Status Bar */}
      <div className="flex flex-col items-center gap-3">
        <Ralph pose={pose} className="size-48 sm:size-56" />

        {/* Automatic 6-minute check-in status pill */}
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-pill bg-surface px-5 py-1.5 text-xs font-extrabold shadow-soft sm:text-sm">
          {muted ? (
            <span className="text-no">
              🔇 Automatic {AUTO_CHECKIN_MINUTES}-minute check-in is MUTED
            </span>
          ) : (
            <>
              <span className="text-ink-muted">
                🔔 Next automatic check-in in{' '}
                <strong className="text-ink">{formatCountdown(checkinRemainingSec)}</strong>
              </span>
              <button
                type="button"
                onClick={triggerCheckinNow}
                className="rounded-pill bg-accent px-3 py-1 text-xs font-extrabold text-ink active:scale-95"
              >
                Check in now
              </button>
            </>
          )}
        </div>

        <div className="w-full rounded-card bg-surface p-5 text-center shadow-soft">
          {mode === 'quiet' ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xl font-bold text-ink-muted">
                💤 {t('companion.sleepingMsg', "I'm resting right here with you. Tap or talk anytime!")}
              </p>
              <p className="text-sm font-semibold text-ink-muted">
                {muted
                  ? 'Check-ins are muted so Ralph will stay quiet until you unmute or talk to him.'
                  : `Ralph will gently check in on you in ${formatCountdown(checkinRemainingSec)}.`}
              </p>
            </div>
          ) : (
            <p className="text-2xl font-extrabold text-ink">{latestRalph}</p>
          )}
        </div>
      </div>

      {/* Recent back-and-forth transcript */}
      {turns.length > 1 && (
        <div className="max-h-36 space-y-2 overflow-y-auto rounded-card bg-surface/70 p-3 text-sm">
          {turns.slice(-5).map((turn, i) => (
            <div
              key={i}
              className={`flex ${turn.speaker === 'child' ? 'justify-end' : 'justify-start'}`}
            >
              <span
                className={`max-w-xs rounded-card px-4 py-2 font-semibold ${
                  turn.speaker === 'child'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-ink shadow-soft'
                }`}
              >
                {turn.speaker === 'ralph' ? '🦝 ' : ''}
                {turn.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Optional Pain Faces (0–5, team-designed emoji faces, never Wong-Baker) */}
      <div className="rounded-card bg-surface p-3 shadow-soft">
        <p className="mb-2 text-center text-xs font-bold tracking-wide text-ink-muted uppercase">
          {t('companion.painScaleLabel', 'How much does it hurt right now? (optional)')}
        </p>
        <div className="grid grid-cols-6 gap-2">
          {PAIN_FACES.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setPainFace(f.value);
                if (f.value >= 4) {
                  void sendChildMessage(`It hurts a lot (${f.label})`, 'worse');
                }
              }}
              className={`flex min-h-14 flex-col items-center justify-center rounded-card border-2 p-1 text-xs font-bold transition-transform active:scale-95 ${
                painFace === f.value
                  ? 'border-primary bg-primary/10 text-ink scale-105'
                  : 'border-transparent bg-bg text-ink-muted'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {f.emoji}
              </span>
              <span>{f.value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick-tap feeling & hobby chips (every question has a tap fallback) */}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => void sendChildMessage('I feel better now!', 'better')}
          className="min-h-14 rounded-pill bg-yes px-5 text-lg font-extrabold text-on-primary shadow-soft active:scale-95"
        >
          😊 {t('companion.feelBetter', 'Feeling better')}
        </button>
        <button
          type="button"
          onClick={() => void sendChildMessage('I feel about the same.', 'same')}
          className="min-h-14 rounded-pill bg-secondary px-5 text-lg font-extrabold text-on-secondary shadow-soft active:scale-95"
        >
          😐 {t('companion.feelSame', 'About the same')}
        </button>
        <button
          type="button"
          onClick={() => void sendChildMessage('I feel worse right now.', 'worse')}
          className="min-h-14 rounded-pill bg-no px-5 text-lg font-extrabold text-on-primary shadow-soft active:scale-95"
        >
          😣 {t('companion.feelWorse', 'Feeling worse')}
        </button>
        <button
          type="button"
          onClick={() =>
            void sendChildMessage(`Let's talk about something fun! ${suggestedTopic}`)
          }
          className="min-h-14 rounded-pill bg-accent px-5 text-lg font-extrabold text-ink shadow-soft active:scale-95"
        >
          🎨 {t('companion.talkHobbies', 'Talk about fun stuff')}
        </button>
        {mode !== 'quiet' && (
          <button
            type="button"
            onClick={() => void sendChildMessage("I'm tired, I want to rest for a bit.")}
            className="min-h-14 rounded-pill bg-unsure px-5 text-base font-bold text-ink shadow-soft active:scale-95"
          >
            😴 {t('companion.wantRest', 'I want to rest')}
          </button>
        )}
      </div>

      {/* Voice + text input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendChildMessage(draft);
        }}
        className="flex items-center gap-2"
      >
        {sttSupported() && (
          <button
            type="button"
            onClick={handleMicToggle}
            className={`min-h-16 rounded-pill px-6 text-lg font-extrabold shadow-soft active:scale-95 ${
              listening ? 'bg-no text-on-primary' : 'bg-primary text-on-primary'
            }`}
          >
            {listening ? '🛑 Stop' : '🎤 Talk'}
          </button>
        )}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('companion.inputPlaceholder', 'Type or tap to talk to Ralph…')}
          className="min-h-16 flex-1 rounded-pill bg-surface px-5 text-lg font-semibold text-ink shadow-soft outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="min-h-16 rounded-pill bg-primary px-6 text-lg font-extrabold text-on-primary shadow-soft disabled:opacity-40 active:scale-95"
        >
          {t('companion.send', 'Send')}
        </button>
      </form>
    </section>
  );
}

const PAIN_FACES = [
  { value: 0, emoji: '😄', label: 'No hurt' },
  { value: 1, emoji: '🙂', label: 'A little' },
  { value: 2, emoji: '😐', label: 'Mild' },
  { value: 3, emoji: '😟', label: 'Medium' },
  { value: 4, emoji: '😣', label: 'A lot' },
  { value: 5, emoji: '😭', label: 'Worst' },
];

export default Companion;
