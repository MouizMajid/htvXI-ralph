import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Ralph } from '../components/Ralph';
import { RalphCelebration } from '../components/RalphCelebration';
import { playFireflyChime } from '../../lib/sfx';

/**
 * Game 1: "Firefly Tap" (ages ~4–9). Catch glowing fireflies to light Ralph's lantern.
 *
 * Just for fun: nothing is measured or sent anywhere (CLAUDE.md rule 9). The waiting hub
 * uses `onRoundEnd` as a natural moment for Ralph's check-in.
 */

interface FireflyTapProps {
  ageYears?: number;
  /** A round started — not a good moment for a check-in. */
  onRoundStart?: () => void;
  /** A round finished — the hub may show a check-in before the next one. */
  onRoundEnd?: () => void;
  onExit?: () => void;
}

type Stage = 'ready' | 'play' | 'done';

interface ActiveFly {
  id: number;
  /** % of the board */
  x: number;
  y: number;
}

const FIREFLIES_PER_ROUND = 10;

export function FireflyTap({ ageYears = 6, onRoundStart, onRoundEnd, onExit }: FireflyTapProps) {
  const { t, i18n } = useTranslation();
  const [stage, setStage] = useState<Stage>('ready');
  const [round, setRound] = useState(1);
  const [fly, setFly] = useState<ActiveFly | null>(null);
  const [caught, setCaught] = useState(0);
  const [totalCaught, setTotalCaught] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [spawnedCount, setSpawnedCount] = useState(0);
  const [popFx, setPopFx] = useState<{ id: number; x: number; y: number; streak: number } | null>(null);

  // Easier (slower, bigger) for younger kids.
  const young = ageYears <= 6;
  const visibleWindowMs = young ? 2450 : 1900;
  const gapMinMs = young ? 380 : 280;
  const gapMaxMs = young ? 780 : 620;
  const flySizeClass = young ? 'size-28' : 'size-24';

  const flyRef = useRef<ActiveFly | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const streakRef = useRef(0);
  const spawnedRef = useRef(0);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finishRound = useCallback(() => {
    clearTimers();
    flyRef.current = null;
    setFly(null);
    setStage('done');
    onRoundEnd?.();
  }, [clearTimers, onRoundEnd]);

  const spawnNext = useCallback(() => {
    if (spawnedRef.current >= FIREFLIES_PER_ROUND) {
      finishRound();
      return;
    }
    const delay = gapMinMs + Math.random() * (gapMaxMs - gapMinMs);
    const spawnTimer = setTimeout(() => {
      spawnedRef.current += 1;
      const nextFly: ActiveFly = { id: spawnedRef.current, x: 16 + Math.random() * 68, y: 18 + Math.random() * 58 };
      flyRef.current = nextFly;
      setFly(nextFly);
      setSpawnedCount(spawnedRef.current);

      // It flies away if not caught in time — no penalty, the streak just resets.
      const missTimer = setTimeout(() => {
        if (flyRef.current?.id !== nextFly.id) return;
        flyRef.current = null;
        setFly(null);
        streakRef.current = 0;
        setStreak(0);
        spawnNext();
      }, visibleWindowMs);
      timersRef.current.push(missTimer);
    }, delay);
    timersRef.current.push(spawnTimer);
  }, [finishRound, gapMaxMs, gapMinMs, visibleWindowMs]);

  const startRound = () => {
    clearTimers();
    streakRef.current = 0;
    spawnedRef.current = 0;
    setStreak(0);
    setCaught(0);
    setSpawnedCount(0);
    setStage('play');
    onRoundStart?.();
    spawnNext();
  };

  const handleFlyPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const active = flyRef.current;
    if (!active) return;
    clearTimers();
    flyRef.current = null;
    setFly(null);

    const newStreak = streakRef.current + 1;
    streakRef.current = newStreak;
    setStreak(newStreak);
    setBestStreak((b) => Math.max(b, newStreak));
    playFireflyChime(newStreak);
    setCaught((c) => c + 1);
    setTotalCaught((c) => c + 1);
    setPopFx({ id: active.id, x: active.x, y: active.y, streak: newStreak });
    spawnNext();
  };

  const lanternPct = Math.min(100, Math.round((caught / FIREFLIES_PER_ROUND) * 100));

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-between gap-4 p-4 sm:p-6">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 rounded-card bg-surface px-5 py-3 shadow-soft">
        <div className="flex items-center gap-3">
          <Ralph pose={stage === 'done' ? 'celebrate' : 'happy'} className="size-14" />
          <div>
            <h1 className="text-2xl font-extrabold text-ink">✨ {t('games.fireflyTap.title', 'Firefly Tap')}</h1>
            <p className="text-sm font-semibold text-ink-muted">
              {t('games.fireflyTap.subtitle', "Catch the glowing bugs for Ralph's lantern!")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={() => {
                clearTimers();
                onExit();
              }}
              className="min-h-12 rounded-pill bg-bg px-5 text-base font-extrabold text-ink shadow-soft active:scale-95"
            >
              ← {t('games.common.back', 'Back')}
            </button>
          )}
        </div>
      </header>

      {stage === 'ready' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-accent/50 bg-surface p-8 text-center shadow-soft"
        >
          <Ralph pose="wave" className="size-48" />
          <span className="rounded-pill bg-accent/30 px-4 py-1 text-sm font-extrabold text-ink">
            🌟 {t('games.fireflyTap.roundLabel', 'Round {{n}}', { n: round })}
          </span>
          <h2 className="text-3xl font-extrabold text-ink">{t('games.fireflyTap.readyTitle', 'Ready to catch fireflies?')}</h2>
          <p className="max-w-md text-xl font-semibold text-ink-muted">
            {t('games.fireflyTap.instructions', 'Tap each glowing firefly before it flies away!')}
          </p>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={startRound}
            className="min-h-16 rounded-pill bg-primary px-12 text-2xl font-extrabold text-on-primary shadow-soft"
          >
            ✨ {t('games.common.start', "Let's Play!")}
          </motion.button>
        </motion.div>
      )}

      {stage === 'play' && (
        <div className="flex flex-1 flex-col gap-3">
          {/* HUD: lantern meter + streak */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-5 py-3 shadow-soft">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                🏮
              </span>
              <div className="w-36 sm:w-48">
                <div className="flex justify-between text-xs font-extrabold text-ink">
                  <span>{t('games.fireflyTap.lantern', "RALPH'S LANTERN")}</span>
                  <span>{caught} ✨</span>
                </div>
                <div className="mt-1 h-3.5 w-full overflow-hidden rounded-pill bg-bg">
                  <motion.div
                    className="h-full rounded-pill bg-accent"
                    animate={{ width: `${Math.max(8, lanternPct)}%` }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  />
                </div>
              </div>
            </div>

            {streak >= 2 && (
              <motion.span
                key={streak}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                className="rounded-pill bg-accent px-4 py-1 text-base font-extrabold text-ink shadow-soft"
              >
                🔥 {t('games.fireflyTap.streak', '{{n}}x Streak!', { n: streak })}
              </motion.span>
            )}

            <span className="rounded-pill bg-bg px-4 py-1 text-sm font-extrabold text-ink-muted">
              {spawnedCount}/{FIREFLIES_PER_ROUND}
            </span>
          </div>

          {/* Night-forest playfield */}
          <div
            className="relative min-h-104 flex-1 overflow-hidden rounded-card border-4 border-night bg-night-deep shadow-soft select-none"
            style={{
              touchAction: 'manipulation',
              background: 'radial-gradient(circle at 82% 18%, #3b468c 0%, #232a5c 48%, #131736 100%)',
            }}
          >
            {/* Glowing moon */}
            <div
              className="pointer-events-none absolute top-5 right-7 size-16 rounded-pill bg-firefly opacity-90 shadow-soft"
              style={{ boxShadow: '0 0 40px 10px rgba(255, 245, 154, 0.45)' }}
            />

            {/* Twinkling stars */}
            {STARS.map((s, idx) => (
              <motion.span
                key={idx}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
                transition={{ duration: 2 + (idx % 3), repeat: Infinity, ease: 'easeInOut' }}
                className="pointer-events-none absolute size-2.5 rounded-pill bg-star"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              />
            ))}

            {/* Forest hills */}
            <svg viewBox="0 0 800 140" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full">
              <path d="M0 95 Q160 35 340 85 T700 65 L800 90 L800 140 L0 140 Z" fill="#192048" />
              <path d="M0 115 Q240 60 480 105 T800 85 L800 140 L0 140 Z" fill="#0d1129" />
            </svg>

            {/* Firefly */}
            <AnimatePresence>
              {fly && (
                <motion.button
                  key={fly.id}
                  type="button"
                  aria-label={t('games.fireflyTap.fireflyLabel', 'Firefly')}
                  onPointerDown={handleFlyPointerDown}
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: [1, 1.08, 1], y: [0, -7, 0], opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ left: `${fly.x}%`, top: `${fly.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-pill ${flySizeClass} flex items-center justify-center`}
                >
                  <span className="absolute inset-0 rounded-pill bg-firefly-glow/40 blur-md" aria-hidden />
                  <svg viewBox="0 0 120 120" className="relative size-full overflow-visible">
                    <circle cx="60" cy="68" r="34" fill="#fff59a" opacity="0.45" />
                    <ellipse cx="34" cy="46" rx="22" ry="13" transform="rotate(-28 34 46)" fill="#e0f2fe" opacity="0.88" stroke="#2c2d33" strokeWidth="3" />
                    <ellipse cx="86" cy="46" rx="22" ry="13" transform="rotate(28 86 46)" fill="#e0f2fe" opacity="0.88" stroke="#2c2d33" strokeWidth="3" />
                    <ellipse cx="60" cy="72" rx="22" ry="24" fill="#fff59a" stroke="#f2b84b" strokeWidth="4" />
                    <circle cx="60" cy="44" r="16" fill="#2c2d33" />
                    <circle cx="54" cy="42" r="3.5" fill="#ffffff" />
                    <circle cx="66" cy="42" r="3.5" fill="#ffffff" />
                    <path d="M53 30 Q45 18 38 22 M67 30 Q75 18 82 22" fill="none" stroke="#fff59a" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Sparkle burst on catch */}
            <AnimatePresence>
              {popFx && (
                <motion.div
                  key={`pop-${popFx.id}`}
                  initial={{ scale: 0.6, opacity: 1, y: 0 }}
                  animate={{ scale: 1.5, opacity: 0, y: -24 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  style={{ left: `${popFx.x}%`, top: `${popFx.y}%` }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center font-extrabold text-firefly"
                >
                  <div className="text-3xl">✨ +1</div>
                  {popFx.streak >= 3 && <div className="text-xs tracking-wider uppercase">{popFx.streak}x COMBO!</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Round finished: Ralph celebrates. Counts are just for fun and never leave the tablet. */}
      {stage === 'done' && (
        <RalphCelebration
          lang={i18n.language}
          title={t('games.fireflyTap.doneTitle', 'You caught {{count}} fireflies!', { count: caught })}
          speechText={t(
            'games.fireflyTap.doneSpeech',
            'Woohoo! You caught {{count}} fireflies! My lantern is shining so bright. Thank you!',
            { count: caught },
          )}
          stats={[
            { icon: '✨', label: t('games.fireflyTap.statRound', 'This round'), value: `${caught} / ${FIREFLIES_PER_ROUND}` },
            { icon: '🔥', label: t('games.fireflyTap.statStreak', 'Best streak'), value: `${bestStreak}x` },
            { icon: '🏮', label: t('games.fireflyTap.statTotal', 'All fireflies'), value: `${totalCaught}` },
          ]}
          nextLabel={t('games.common.playAgain', 'Play Again')}
          onNext={() => {
            setRound((r) => r + 1);
            setStage('ready');
          }}
          secondaryLabel={onExit ? t('games.common.done', 'Back to Ralph') : undefined}
          onSecondary={onExit}
        />
      )}
    </section>
  );
}

const STARS = [
  { x: 10, y: 15 },
  { x: 24, y: 10 },
  { x: 42, y: 20 },
  { x: 58, y: 12 },
  { x: 72, y: 24 },
  { x: 15, y: 52 },
  { x: 35, y: 66 },
  { x: 64, y: 58 },
  { x: 86, y: 48 },
  { x: 50, y: 38 },
  { x: 28, y: 34 },
  { x: 76, y: 68 },
];

export default FireflyTap;
