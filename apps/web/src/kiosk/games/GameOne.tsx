import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  compareHands,
  motorObservations,
  summarizeTapRound,
  type GameEvent,
  type GameResult,
  type Hand,
  type Handedness,
  type TapRoundSummary,
  type TapTarget,
} from '@ralph/shared';
import { Ralph } from '../components/Ralph';
import { RalphCelebration } from '../components/RalphCelebration';
import { MuteCheckinButton } from '../components/MuteCheckinButton';
import { postGameResult } from '../../lib/kioskApi';
import { playFireflyChime } from '../../lib/sfx';
import { HandPicker, handLabel } from './HandPicker';

/**
 * Game 1: "Firefly Tap" (Younger ages, 4–9)
 *
 * Clinical objective (never shown on kiosk — framed to child as catching sleepy
 * fireflies for Ralph's lantern):
 *  - Alertness & reaction time (lethargy from high fever / mild concussion)
 *  - Motor speed & bradykinesia (median RT, within-round fatigue slowing)
 *  - Unilateral weakness check (Round 1 writing hand vs Round 2 other hand)
 */

interface FireflyTapProps {
  visitId?: string;
  ageYears?: number;
  initialHandedness?: Handedness;
  onHandednessChange?: (h: Handedness) => void;
  onFinish: (result: GameResult) => void;
  onExit?: () => void;
}

type Stage =
  | 'hand'
  | 'ready_dom'
  | 'play_dom'
  | 'congrats_dom'
  | 'ready_non'
  | 'play_non'
  | 'done';

interface ActiveFly {
  id: number;
  /** % 14..86 */
  x: number;
  y: number;
  shownAtMs: number;
}

const TARGETS_PER_HAND = 10;

export function FireflyTap({
  visitId = 'demo',
  ageYears = 6,
  initialHandedness,
  onHandednessChange,
  onFinish,
  onExit,
}: FireflyTapProps) {
  const { t, i18n } = useTranslation();
  const [handedness, setHandedness] = useState<Handedness>(initialHandedness ?? 'unknown');
  const [stage, setStage] = useState<Stage>(initialHandedness ? 'ready_dom' : 'hand');
  const [fly, setFly] = useState<ActiveFly | null>(null);
  const [caughtDom, setCaughtDom] = useState(0);
  const [caughtNon, setCaughtNon] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [spawnedCount, setSpawnedCount] = useState(0);
  const [popFx, setPopFx] = useState<{ id: number; x: number; y: number; streak: number } | null>(
    null,
  );

  // Easier (slower/bigger) for younger kids per kiosk-ui skill.
  const young = ageYears <= 6;
  const visibleWindowMs = young ? 2450 : 1900;
  const gapMinMs = young ? 380 : 280;
  const gapMaxMs = young ? 780 : 620;
  const flySizeClass = young ? 'size-28' : 'size-24';

  const startedAtIsoRef = useRef<string>(new Date().toISOString());
  const roundStartPerfRef = useRef<number>(performance.now());
  const boardRef = useRef<HTMLDivElement | null>(null);

  const domTargetsRef = useRef<TapTarget[]>([]);
  const nonTargetsRef = useRef<TapTarget[]>([]);
  const domStrayRef = useRef(0);
  const nonStrayRef = useRef(0);
  const eventsRef = useRef<GameEvent[]>([]);
  const flyRef = useRef<ActiveFly | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const streakRef = useRef(0);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const currentHand: Hand =
    stage === 'play_non' || stage === 'ready_non' ? 'non_dominant' : 'dominant';

  const finishAll = useCallback(() => {
    clearTimers();
    setFly(null);
    const domSummary: TapRoundSummary = summarizeTapRound(
      domTargetsRef.current,
      domStrayRef.current,
      'dominant',
    );
    const nonSummary: TapRoundSummary = summarizeTapRound(
      nonTargetsRef.current,
      nonStrayRef.current,
      'non_dominant',
    );
    const hands = compareHands(domSummary.medianReactionMs, nonSummary.medianReactionMs);
    const observations = motorObservations({
      hands,
      fatigueSlowingPct: domSummary.fatigueSlowingPct,
    });

    const result: GameResult = {
      game: 'firefly_tap',
      handedness,
      started_at: startedAtIsoRef.current,
      events: eventsRef.current,
      summary: {
        medianReactionMs: domSummary.medianReactionMs,
        meanReactionMs: domSummary.meanReactionMs,
        sdReactionMs: domSummary.sdReactionMs,
        hitRate: domSummary.hitRate,
        hits: domSummary.hits + nonSummary.hits,
        misses: domSummary.misses + nonSummary.misses,
        strayTaps: domSummary.strayTaps + nonSummary.strayTaps,
        fatigueSlowingPct: domSummary.fatigueSlowingPct,
        meanAccuracyPx: domSummary.meanAccuracyPx,
        nonDominantMedianMs: nonSummary.medianReactionMs,
        nonDominantHitRate: nonSummary.hitRate,
        handAsymmetryPct: hands?.asymmetryPct ?? null,
        handUnexpectedSide: hands?.unexpectedSide ?? null,
      },
      observations,
    };

    void postGameResult(visitId, result);
    setStage('done');
    onFinish(result);
  }, [clearTimers, handedness, onFinish, visitId]);

  const spawnNext = useCallback(
    (hand: Hand, index: number) => {
      if (index >= TARGETS_PER_HAND) {
        flyRef.current = null;
        setFly(null);
        if (hand === 'dominant') {
          // Ralph comes onto the screen to congratulate Round 1 before Round 2!
          setStage('congrats_dom');
        } else {
          finishAll();
        }
        return;
      }

      const delay = gapMinMs + Math.random() * (gapMaxMs - gapMinMs);
      const spawnTimer = setTimeout(() => {
        const shownAtMs = Math.round(performance.now() - roundStartPerfRef.current);
        const nextFly: ActiveFly = {
          id: index + 1 + (hand === 'non_dominant' ? 100 : 0),
          x: 16 + Math.random() * 68,
          y: 18 + Math.random() * 58,
          shownAtMs,
        };
        flyRef.current = nextFly;
        setFly(nextFly);
        setSpawnedCount(index + 1);

        const missTimer = setTimeout(() => {
          if (flyRef.current?.id !== nextFly.id) return;
          flyRef.current = null;
          setFly(null);
          streakRef.current = 0;
          setStreak(0);
          const targetList = hand === 'dominant' ? domTargetsRef.current : nonTargetsRef.current;
          targetList.push({ shownAtMs: nextFly.shownAtMs, reactionMs: null, accuracyPx: null });
          eventsRef.current.push({
            at_ms: Math.round(performance.now() - roundStartPerfRef.current),
            round: hand === 'dominant' ? 1 : 2,
            hand,
            reaction_ms: null,
            hit: false,
            accuracy_px: null,
          });
          spawnNext(hand, index + 1);
        }, visibleWindowMs);
        timersRef.current.push(missTimer);
      }, delay);

      timersRef.current.push(spawnTimer);
    },
    [finishAll, gapMaxMs, gapMinMs, visibleWindowMs],
  );

  const startHandRound = (hand: Hand) => {
    clearTimers();
    streakRef.current = 0;
    setStreak(0);
    if (hand === 'dominant') {
      startedAtIsoRef.current = new Date().toISOString();
      roundStartPerfRef.current = performance.now();
      domTargetsRef.current = [];
      nonTargetsRef.current = [];
      domStrayRef.current = 0;
      nonStrayRef.current = 0;
      eventsRef.current = [];
      setCaughtDom(0);
      setCaughtNon(0);
      setBestStreak(0);
    }
    setSpawnedCount(0);
    setStage(hand === 'dominant' ? 'play_dom' : 'play_non');
    spawnNext(hand, 0);
  };

  const handleFlyPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const active = flyRef.current;
    if (!active) return;
    clearTimers();
    flyRef.current = null;
    setFly(null);

    const nowMs = Math.round(performance.now() - roundStartPerfRef.current);
    const reactionMs = Math.max(40, nowMs - active.shownAtMs);

    let accuracyPx: number | null = null;
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cx = rect.left + (active.x / 100) * rect.width;
      const cy = rect.top + (active.y / 100) * rect.height;
      accuracyPx = Math.round(Math.hypot(e.clientX - cx, e.clientY - cy) * 10) / 10;
    }

    const hand: Hand = stage === 'play_non' ? 'non_dominant' : 'dominant';
    const targetList = hand === 'dominant' ? domTargetsRef.current : nonTargetsRef.current;
    targetList.push({ shownAtMs: active.shownAtMs, reactionMs, accuracyPx });

    eventsRef.current.push({
      at_ms: nowMs,
      round: hand === 'dominant' ? 1 : 2,
      hand,
      reaction_ms: reactionMs,
      hit: true,
      accuracy_px: accuracyPx,
    });

    const newStreak = streakRef.current + 1;
    streakRef.current = newStreak;
    setStreak(newStreak);
    setBestStreak((b) => Math.max(b, newStreak));
    playFireflyChime(newStreak);

    if (hand === 'dominant') setCaughtDom((c) => c + 1);
    else setCaughtNon((c) => c + 1);

    setPopFx({ id: active.id, x: active.x, y: active.y, streak: newStreak });
    spawnNext(hand, targetList.length);
  };

  const handleBoardPointerDown = () => {
    if (stage !== 'play_dom' && stage !== 'play_non') return;
    if (!flyRef.current) {
      if (stage === 'play_dom') domStrayRef.current += 1;
      else nonStrayRef.current += 1;
    }
  };

  const totalCaught = caughtDom + caughtNon;
  const totalPossible = TARGETS_PER_HAND * 2;
  const lanternPct = Math.min(100, Math.round((totalCaught / totalPossible) * 100));

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-between gap-4 p-4 sm:p-6">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 rounded-card bg-surface px-5 py-3 shadow-soft">
        <div className="flex items-center gap-3">
          <Ralph pose={stage === 'done' || stage === 'congrats_dom' ? 'celebrate' : 'happy'} className="size-14" />
          <div>
            <h1 className="text-2xl font-extrabold text-ink">
              ✨ {t('games.fireflyTap.title', 'Firefly Tap')}
            </h1>
            <p className="text-sm font-semibold text-ink-muted">
              {t('games.fireflyTap.subtitle', "Catch the glowing bugs for Ralph's lantern!")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MuteCheckinButton />
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

      {stage === 'hand' && (
        <div className="my-auto py-4">
          <HandPicker
            onPick={(h) => {
              setHandedness(h);
              onHandednessChange?.(h);
              setStage('ready_dom');
            }}
          />
        </div>
      )}

      {(stage === 'ready_dom' || stage === 'ready_non') && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-accent/50 bg-surface p-8 text-center shadow-soft"
        >
          <Ralph pose="wave" className="size-48" />
          <span className="rounded-pill bg-accent/30 px-4 py-1 text-sm font-extrabold text-ink">
            {stage === 'ready_dom' ? '🌟 STAGE 1 OF 2' : '🌟 STAGE 2 OF 2'}
          </span>
          <h2 className="text-3xl font-extrabold text-ink">
            {stage === 'ready_dom'
              ? t('games.fireflyTap.readyDom', 'Round 1: Use {{hand}}!', {
                  hand: handLabel(handedness, 'dominant', t),
                })
              : t('games.fireflyTap.readyNon', 'Round 2: Now use {{hand}}!', {
                  hand: handLabel(handedness, 'non_dominant', t),
                })}
          </h2>
          <p className="max-w-md text-xl font-semibold text-ink-muted">
            {t(
              'games.fireflyTap.instructions',
              'Tap each glowing firefly as fast as you can before it flies away!',
            )}
          </p>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => startHandRound(stage === 'ready_dom' ? 'dominant' : 'non_dominant')}
            className="min-h-16 rounded-pill bg-primary px-12 text-2xl font-extrabold text-on-primary shadow-soft"
          >
            ✨ {t('games.common.start', "Let's Play!")}
          </motion.button>
        </motion.div>
      )}

      {/* Stage 1 finished → Ralph pops onto the screen to congratulate before Stage 2! */}
      {stage === 'congrats_dom' && (
        <RalphCelebration
          lang={i18n.language}
          title={`Round 1 Complete!`}
          speechText={`Yay! You caught ${caughtDom} fireflies with ${handLabel(
            handedness,
            'dominant',
            t,
          )}! My lantern is glowing! Now let's try Round 2 with ${handLabel(
            handedness,
            'non_dominant',
            t,
          )}!`}
          stats={[
            { icon: '✨', label: 'Round 1 Caught', value: `${caughtDom} / ${TARGETS_PER_HAND}` },
            { icon: '🔥', label: 'Best Streak', value: `${bestStreak}x` },
            { icon: '🏮', label: 'Lantern Glow', value: `${lanternPct}%` },
          ]}
          nextLabel={`Start Round 2 (${handLabel(handedness, 'non_dominant', t)})`}
          onNext={() => setStage('ready_non')}
          secondaryLabel={t('games.fireflyTap.finishNow', 'Finish here')}
          onSecondary={finishAll}
        />
      )}

      {(stage === 'play_dom' || stage === 'play_non') && (
        <div className="flex flex-1 flex-col gap-3">
          {/* HUD Bar with Lantern Meter + Streak */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-5 py-3 shadow-soft">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                🏮
              </span>
              <div className="w-36 sm:w-48">
                <div className="flex justify-between text-xs font-extrabold text-ink">
                  <span>RALPH&apos;S LANTERN</span>
                  <span>{totalCaught} ✨</span>
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
                🔥 {streak}x Streak!
              </motion.span>
            )}

            <span className="rounded-pill bg-bg px-4 py-1 text-sm font-extrabold text-ink-muted">
              {currentHand === 'dominant'
                ? t('games.fireflyTap.round1', 'Round 1 of 2')
                : t('games.fireflyTap.round2', 'Round 2 of 2')}{' '}
              · {spawnedCount}/{TARGETS_PER_HAND}
            </span>
          </div>

          {/* Enchanted Night-Forest Playfield */}
          <div
            ref={boardRef}
            onPointerDown={handleBoardPointerDown}
            className="relative min-h-104 flex-1 overflow-hidden rounded-card border-4 border-night bg-night-deep shadow-soft select-none"
            style={{
              touchAction: 'manipulation',
              background:
                'radial-gradient(circle at 82% 18%, #3b468c 0%, #232a5c 48%, #131736 100%)',
            }}
          >
            {/* Glowing Crescent Moon */}
            <div
              className="pointer-events-none absolute top-5 right-7 size-16 rounded-pill bg-firefly opacity-90 shadow-soft"
              style={{ boxShadow: '0 0 40px 10px rgba(255, 245, 154, 0.45)' }}
            />

            {/* Twinkling Stars */}
            {STARS.map((s, idx) => (
              <motion.span
                key={idx}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
                transition={{ duration: 2 + (idx % 3), repeat: Infinity, ease: 'easeInOut' }}
                className="pointer-events-none absolute size-2.5 rounded-pill bg-star"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              />
            ))}

            {/* Soft forest hills silhouette at bottom */}
            <svg
              viewBox="0 0 800 140"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full"
            >
              <path
                d="M0 95 Q160 35 340 85 T700 65 L800 90 L800 140 L0 140 Z"
                fill="#192048"
              />
              <path
                d="M0 115 Q240 60 480 105 T800 85 L800 140 L0 140 Z"
                fill="#0d1129"
              />
            </svg>

            {/* Active Winged Firefly Target */}
            <AnimatePresence>
              {fly && (
                <motion.button
                  key={fly.id}
                  type="button"
                  aria-label="Firefly"
                  onPointerDown={handleFlyPointerDown}
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{
                    scale: [1, 1.08, 1],
                    y: [0, -7, 0],
                    opacity: 1,
                  }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ left: `${fly.x}%`, top: `${fly.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-pill ${flySizeClass} flex items-center justify-center`}
                >
                  {/* Outer warm halo */}
                  <span
                    className="absolute inset-0 rounded-pill bg-firefly-glow/40 blur-md"
                    aria-hidden
                  />
                  {/* Winged firefly SVG */}
                  <svg viewBox="0 0 120 120" className="relative size-full overflow-visible">
                    <circle cx="60" cy="68" r="34" fill="#fff59a" opacity="0.45" />
                    {/* Left & right fluttering wings */}
                    <ellipse
                      cx="34"
                      cy="46"
                      rx="22"
                      ry="13"
                      transform="rotate(-28 34 46)"
                      fill="#e0f2fe"
                      opacity="0.88"
                      stroke="#2c2d33"
                      strokeWidth="3"
                    />
                    <ellipse
                      cx="86"
                      cy="46"
                      rx="22"
                      ry="13"
                      transform="rotate(28 86 46)"
                      fill="#e0f2fe"
                      opacity="0.88"
                      stroke="#2c2d33"
                      strokeWidth="3"
                    />
                    {/* Glowing golden tail bulb */}
                    <ellipse
                      cx="60"
                      cy="72"
                      rx="22"
                      ry="24"
                      fill="#fff59a"
                      stroke="#f2b84b"
                      strokeWidth="4"
                    />
                    {/* Cute bug head */}
                    <circle cx="60" cy="44" r="16" fill="#2c2d33" />
                    <circle cx="54" cy="42" r="3.5" fill="#ffffff" />
                    <circle cx="66" cy="42" r="3.5" fill="#ffffff" />
                    {/* Antennae */}
                    <path
                      d="M53 30 Q45 18 38 22 M67 30 Q75 18 82 22"
                      fill="none"
                      stroke="#fff59a"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
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
                  {popFx.streak >= 3 && (
                    <div className="text-xs tracking-wider uppercase">{popFx.streak}x COMBO!</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Final Completion → Ralph pops onto the screen to congratulate! */}
      {stage === 'done' && (
        <RalphCelebration
          lang={i18n.language}
          title={t('games.fireflyTap.doneTitle', 'You caught {{count}} fireflies!', {
            count: totalCaught,
          })}
          speechText={`Woohoo! You caught ${totalCaught} fireflies! My lantern is shining super bright now. Thank you so much for helping me!`}
          stats={[
            { icon: '✨', label: 'Total Fireflies', value: `${totalCaught} / ${totalPossible}` },
            { icon: '🔥', label: 'Best Streak', value: `${bestStreak}x` },
            { icon: '🏮', label: 'Lantern Power', value: '100% Super Bright!' },
          ]}
          nextLabel={onExit ? t('games.common.done', 'Continue to Next Activity') : t('games.common.playAgain', 'Play Again')}
          onNext={() => {
            if (onExit) onExit();
            else setStage('ready_dom');
          }}
          secondaryLabel={onExit ? t('games.common.playAgain', 'Play Again') : undefined}
          onSecondary={onExit ? () => setStage('ready_dom') : undefined}
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
