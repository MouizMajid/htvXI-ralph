import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COMPANION_QUIET_AFTER_MS, FALLBACK_TOPICS, fallbackReply, soundsWorse, type Lang } from '@ralph/shared';
import { Ralph } from '../components/Ralph';
import type { RalphPose } from '../art';
import { companionTurn } from '../../lib/kioskApi';
import { kioskApi } from '../../lib/api';
import { speak } from '../../lib/speech';
import { TalkButton } from '../components/TalkButton';

/**
 * Chat with Ralph while waiting — company, not assessment.
 * - Back-and-forth about the child's favourite things (Gemini writes Ralph's words; offline
 *   fallbacks if it's unavailable).
 * - Every message reaches the nurse as the child's own words (translated to English).
 * - If the child goes quiet, Ralph rests until they talk again.
 * - Check-ins are NOT asked here: the hub shows them between messages (`onIdleChange`), and if a
 *   message sounds like "I feel worse", Ralph offers the tap check-in (`onRequestCheckin`).
 */

interface CompanionProps {
  visitId?: string;
  firstName?: string;
  ageYears?: number;
  language?: Lang;
  /** true while Ralph is neither thinking nor talking — a natural break for a check-in. */
  onIdleChange?: (idle: boolean) => void;
  /** The child said something like "I feel worse" — show the tap check-in now. */
  onRequestCheckin?: () => void;
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
  onIdleChange,
  onRequestCheckin,
  onSwitchToGames,
}: CompanionProps) {
  const { t } = useTranslation();
  const openingLine = t('companion.opening', { name: firstName });

  const [turns, setTurns] = useState<ChatTurn[]>([{ speaker: 'ralph', text: openingLine }]);
  const [mode, setMode] = useState<Mode>('ralph_speaking');
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState('');

  const turnIdxRef = useRef(0);
  const cancelTtsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onIdleChange?.(mode === 'awaiting_child' || mode === 'quiet');
  }, [mode, onIdleChange]);

  const ralphSay = useCallback(
    (line: string, goQuietAfter = false) => {
      cancelTtsRef.current?.();
      setMode('ralph_speaking');
      cancelTtsRef.current = speak(line, language, () => setMode(goQuietAfter ? 'quiet' : 'awaiting_child'));
    },
    [language],
  );

  // Say hello on open; stop talking/listening on close.
  useEffect(() => {
    ralphSay(openingLine);
    return () => {
      cancelTtsRef.current?.();
      onIdleChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No reply for a while → Ralph rests quietly (the child can wake him anytime).
  useEffect(() => {
    if (mode !== 'awaiting_child' || listening) return;
    const id = setTimeout(() => setMode('quiet'), COMPANION_QUIET_AFTER_MS);
    return () => clearTimeout(id);
  }, [listening, mode]);

  const sendChildMessage = useCallback(
    async (rawText: string, input: 'text' | 'voice' = 'text') => {
      const text = rawText.trim();
      if (!text) return;
      cancelTtsRef.current?.();

      const history = turns;
      setTurns((prev) => [...prev, { speaker: 'child', text }]);
      setDraft('');
      setMode('thinking');

      const res = await companionTurn(visitId, {
        message: text,
        input,
        history,
        first_name: firstName,
        age_years: ageYears,
        language,
      });

      const fb = fallbackReply(text, turnIdxRef.current++);
      const reply = res?.reply ?? fb.reply;
      setTurns((prev) => [...prev, { speaker: 'ralph', text: reply }]);
      ralphSay(reply, res?.wants_quiet ?? fb.wantsQuiet);
      if (res?.offer_checkin ?? soundsWorse(text)) onRequestCheckin?.();
    },
    [ageYears, firstName, language, onRequestCheckin, ralphSay, turns, visitId],
  );

  /** Chat microphone: Gemini transcribes the clip, then it's sent like a typed message. */
  const handleAudio = async (audio: Blob) => {
    try {
      const { text } = await kioskApi.transcribe(visitId, audio);
      if (text) return void (await sendChildMessage(text, 'voice'));
    } catch {
      /* fall through */
    }
    const line = t('companion.didntCatch');
    setTurns((prev) => [...prev, { speaker: 'ralph', text: line }]);
    ralphSay(line);
  };

  const pose: RalphPose = listening
    ? 'listen'
    : mode === 'ralph_speaking'
      ? 'talk'
      : mode === 'thinking'
        ? 'think'
        : mode === 'quiet'
          ? 'sleep'
          : 'happy';

  const latestRalph = [...turns].reverse().find((x) => x.speaker === 'ralph')?.text ?? openingLine;
  const suggestedTopic = FALLBACK_TOPICS[turnIdxRef.current % FALLBACK_TOPICS.length]!;

  return (
    <section className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-between gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface px-5 py-3 shadow-soft">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{t('companion.title')}</h1>
          <p className="text-xs font-semibold text-ink-muted sm:text-sm">
            {mode === 'quiet' ? t('companion.quietSub') : t('companion.activeSub')}
          </p>
        </div>
        {onSwitchToGames && (
          <button
            type="button"
            onClick={onSwitchToGames}
            className="min-h-11 rounded-pill bg-secondary px-4 text-sm font-bold text-on-secondary shadow-soft active:scale-95"
          >
            {t('companion.switchGames')}
          </button>
        )}
      </header>

      <div className="flex flex-col items-center gap-3">
        <Ralph pose={pose} className="size-48 sm:size-56" />
        <div className="w-full rounded-card bg-surface p-5 text-center shadow-soft">
          {mode === 'quiet' ? (
            <p className="text-xl font-bold text-ink-muted">💤 {t('companion.sleepingMsg')}</p>
          ) : (
            <p className="text-2xl font-extrabold text-ink">{latestRalph}</p>
          )}
        </div>
      </div>

      {turns.length > 1 && (
        <div className="max-h-36 space-y-2 overflow-y-auto rounded-card bg-surface/70 p-3 text-sm">
          {turns.slice(-5).map((turn, i) => (
            <div key={i} className={`flex ${turn.speaker === 'child' ? 'justify-end' : 'justify-start'}`}>
              <span
                className={`max-w-xs rounded-card px-4 py-2 font-semibold ${
                  turn.speaker === 'child' ? 'bg-primary text-on-primary' : 'bg-surface text-ink shadow-soft'
                }`}
              >
                {turn.speaker === 'ralph' ? '🦝 ' : ''}
                {turn.text}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => void sendChildMessage(`${t('companion.funPrefix')} ${suggestedTopic}`)}
          className="min-h-14 rounded-pill bg-accent px-5 text-lg font-extrabold text-ink shadow-soft active:scale-95"
        >
          🎨 {t('companion.talkHobbies')}
        </button>
        {mode !== 'quiet' && (
          <button
            type="button"
            onClick={() => void sendChildMessage(t('companion.restMessage'))}
            className="min-h-14 rounded-pill bg-unsure px-5 text-base font-bold text-ink shadow-soft active:scale-95"
          >
            😴 {t('companion.wantRest')}
          </button>
        )}
      </div>

      <TalkButton onAudio={handleAudio} onListeningChange={setListening} disabled={mode === 'thinking'} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendChildMessage(draft);
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('companion.inputPlaceholder')}
          className="min-h-16 min-w-0 flex-1 rounded-pill bg-surface px-5 text-lg font-semibold text-ink shadow-soft outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="min-h-16 rounded-pill bg-primary px-6 text-lg font-extrabold text-on-primary shadow-soft disabled:opacity-40 active:scale-95"
        >
          {t('companion.send')}
        </button>
      </form>
    </section>
  );
}

export default Companion;
