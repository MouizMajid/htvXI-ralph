import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  alternatingSequence,
  analyzeSegmentedJitter,
  compareHands,
  layoutNodes,
  motorObservations,
  numberSequence,
  summarizeTrailPhase,
  trailRatio,
  type GameEvent,
  type GameResult,
  type Hand,
  type Handedness,
  type NodePos,
  type PointerSample,
  type TrailLink,
  type TrailPhase,
  type TrailPhaseResult,
} from '@ralph/shared';
import { Ralph } from '../components/Ralph';
import { RalphCelebration } from '../components/RalphCelebration';
import { MuteCheckinButton } from '../components/MuteCheckinButton';
import { postGameResult } from '../../lib/kioskApi';
import { playCyberGlitch, playCyberNodeLock } from '../../lib/sfx';
import { HandPicker, handLabel } from './HandPicker';

/**
 * Game 2: "Cyber Circuit: Firewall Hacker" (Adolescents & Pre-teens, Ages 10+)
 *
 * Gamified Trail Making Test (Part A + Part B) disguised as a fast-paced hacking
 * puzzle to unlock the clinic's VIP Wi-Fi password / digital reward:
 *  - Phase 1 (The Warm-up): nodes 1..25 in sequential order to "boot up" the hack
 *  - Backup-Hand Sync: quick 10-node calibration with the other hand
 *  - Phase 2 (The Firewall Bypass): numbers (1–13) & letters (A–L) alternating
 *    (1 ➔ A ➔ 2 ➔ B ➔ 3 ➔ C … ➔ 12 ➔ L ➔ 13) under a ticking countdown.
 *    Mistakes flash the node red and trigger a system "glitch".
 *  - After each stage finishes, Ralph pops onto the screen to congratulate the
 *    player before advancing to the next stage!
 */

interface CyberCircuitProps {
  visitId?: string;
  initialHandedness?: Handedness;
  onHandednessChange?: (h: Handedness) => void;
  onFinish: (result: GameResult) => void;
  onExit?: () => void;
}

type Stage =
  | 'hand'
  | 'intro_warmup'
  | 'play_warmup'
  | 'congrats_warmup'
  | 'intro_offhand'
  | 'play_offhand'
  | 'congrats_offhand'
  | 'intro_bypass'
  | 'play_bypass'
  | 'done';

const WARMUP_COUNT = 25;
const OFFHAND_COUNT = 10;
const BYPASS_NUMBERS = 13; // 1..13 + A..L = 25 nodes
const BYPASS_LIMIT_SEC = 75;
const HIT_RADIUS_PCT = 6.4;

export function CyberCircuit({
  visitId = 'demo',
  initialHandedness,
  onHandednessChange,
  onFinish,
  onExit,
}: CyberCircuitProps) {
  const { t, i18n } = useTranslation();
  const [handedness, setHandedness] = useState<Handedness>(initialHandedness ?? 'unknown');
  const [stage, setStage] = useState<Stage>(initialHandedness ? 'intro_warmup' : 'hand');

  // Active phase board state
  const [labels, setLabels] = useState<string[]>([]);
  const [positions, setPositions] = useState<NodePos[]>([]);
  const [nextIdx, setNextIdx] = useState<number>(0);
  const [errorNodeIdx, setErrorNodeIdx] = useState<number | null>(null);
  const [glitching, setGlitching] = useState(false);
  const [cursorPct, setCursorPct] = useState<NodePos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(BYPASS_LIMIT_SEC);

  // Refs for timing & metrics
  const boardRef = useRef<HTMLDivElement | null>(null);
  const startedAtIsoRef = useRef<string>(new Date().toISOString());
  const gameStartPerfRef = useRef<number>(performance.now());
  const phaseStartPerfRef = useRef<number>(performance.now());
  const lastNodePerfRef = useRef<number>(performance.now());
  const phaseErrorsRef = useRef<number>(0);
  const phaseLinksRef = useRef<TrailLink[]>([]);
  const wrongLockRef = useRef<number | null>(null);

  const warmupResultRef = useRef<TrailPhaseResult | null>(null);
  const offhandResultRef = useRef<TrailPhaseResult | null>(null);
  const bypassResultRef = useRef<TrailPhaseResult | null>(null);
  const eventsRef = useRef<GameEvent[]>([]);
  const dragSamplesRef = useRef<PointerSample[]>([]);
  const cutTimesRef = useRef<number[]>([]);

  const activePhase: TrailPhase | null =
    stage === 'play_warmup'
      ? 'warmup'
      : stage === 'play_offhand'
        ? 'offhand'
        : stage === 'play_bypass'
          ? 'bypass'
          : null;

  const activeHand: Hand = stage === 'play_offhand' ? 'non_dominant' : 'dominant';

  const startPhase = useCallback((phase: TrailPhase) => {
    const seq =
      phase === 'warmup'
        ? numberSequence(WARMUP_COUNT)
        : phase === 'offhand'
          ? numberSequence(OFFHAND_COUNT)
          : alternatingSequence(BYPASS_NUMBERS);
    const pts = layoutNodes(seq.length, Math.random, seq.length > 15 ? 14 : 18, 9);
    setLabels(seq);
    setPositions(pts);
    setNextIdx(0);
    setErrorNodeIdx(null);
    setGlitching(false);
    setCursorPct(null);
    setDragging(false);
    phaseStartPerfRef.current = performance.now();
    lastNodePerfRef.current = performance.now();
    phaseErrorsRef.current = 0;
    phaseLinksRef.current = [];
    wrongLockRef.current = null;
    if (phase === 'warmup') {
      startedAtIsoRef.current = new Date().toISOString();
      gameStartPerfRef.current = performance.now();
      eventsRef.current = [];
      dragSamplesRef.current = [];
      cutTimesRef.current = [];
    }
    if (phase === 'bypass') {
      setSecondsLeft(BYPASS_LIMIT_SEC);
    }
    setStage(
      phase === 'warmup'
        ? 'play_warmup'
        : phase === 'offhand'
          ? 'play_offhand'
          : 'play_bypass',
    );
  }, []);

  const finalizeGame = useCallback(() => {
    const warm = warmupResultRef.current;
    const off = offhandResultRef.current;
    const byp = bypassResultRef.current;

    const warmSum = warm ? summarizeTrailPhase(warm) : null;
    const offSum = off ? summarizeTrailPhase(off) : null;
    const bypSum = byp ? summarizeTrailPhase(byp) : null;

    const ratio = warmSum && bypSum ? trailRatio(warmSum, bypSum) : null;
    const hands = compareHands(warmSum?.medianLinkMs ?? null, offSum?.medianLinkMs ?? null);
    const jitter = analyzeSegmentedJitter(dragSamplesRef.current, cutTimesRef.current);

    const observations = motorObservations({
      hands,
      jitter,
      trailRatio: ratio,
      bypassErrors: bypSum?.errors ?? null,
    });

    const totalNodes = (warm?.nodes ?? 0) + (byp?.nodes ?? 0);
    const totalErrors = (warm?.errors ?? 0) + (byp?.errors ?? 0);
    const hitRate =
      totalNodes > 0
        ? Math.round((totalNodes / (totalNodes + totalErrors)) * 1000) / 1000
        : 1;

    const result: GameResult = {
      game: 'cyber_circuit',
      handedness,
      started_at: startedAtIsoRef.current,
      events: eventsRef.current,
      summary: {
        medianReactionMs: warmSum?.medianLinkMs ?? null,
        hitRate,
        warmupTotalMs: warmSum?.totalMs ?? null,
        warmupErrors: warmSum?.errors ?? 0,
        bypassTotalMs: bypSum?.totalMs ?? null,
        bypassCompleted: bypSum?.completed ?? false,
        bypassTimedOut: bypSum?.timedOut ?? false,
        bypassErrors: bypSum?.errors ?? 0,
        bypassMedianLinkMs: bypSum?.medianLinkMs ?? null,
        trailRatioBA: ratio,
        offhandMedianLinkMs: offSum?.medianLinkMs ?? null,
        handAsymmetryPct: hands?.asymmetryPct ?? null,
        handUnexpectedSide: hands?.unexpectedSide ?? null,
        jitterRmsPx: jitter.rmsPx,
        jitterFreqHz: jitter.freqHz,
        jitterPattern: jitter.pattern,
      },
      observations,
    };

    void postGameResult(visitId, result);
    setStage('done');
    onFinish(result);
  }, [handedness, onFinish, visitId]);

  const completePhase = useCallback(
    (phase: TrailPhase, completed: boolean, timedOut: boolean) => {
      const totalMs = Math.round(performance.now() - phaseStartPerfRef.current);
      const res: TrailPhaseResult = {
        phase,
        hand: phase === 'offhand' ? 'non_dominant' : 'dominant',
        nodes: labels.length,
        completed,
        timedOut,
        totalMs,
        errors: phaseErrorsRef.current,
        links: [...phaseLinksRef.current],
      };

      if (phase === 'warmup') {
        warmupResultRef.current = res;
        // Ralph pops up to congratulate Phase 1 before moving on!
        setStage('congrats_warmup');
      } else if (phase === 'offhand') {
        offhandResultRef.current = res;
        // Ralph pops up to congratulate Backup-Hand Sync before Phase 2!
        setStage('congrats_offhand');
      } else {
        bypassResultRef.current = res;
        finalizeGame();
      }
    },
    [finalizeGame, labels.length],
  );

  // Countdown timer for Phase 2 (Firewall Bypass)
  useEffect(() => {
    if (stage !== 'play_bypass') return;
    const id = setInterval(() => {
      const elapsed = Math.floor((performance.now() - phaseStartPerfRef.current) / 1000);
      const rem = Math.max(0, BYPASS_LIMIT_SEC - elapsed);
      setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(id);
        completePhase('bypass', false, true);
      }
    }, 250);
    return () => clearInterval(id);
  }, [completePhase, stage]);

  const triggerGlitch = useCallback((idx: number) => {
    playCyberGlitch();
    setErrorNodeIdx(idx);
    setGlitching(true);
    setTimeout(() => {
      setGlitching(false);
      setErrorNodeIdx((cur) => (cur === idx ? null : cur));
    }, 420);
  }, []);

  const attemptNode = useCallback(
    (idx: number) => {
      if (!activePhase) return;
      if (idx < nextIdx) return;

      const nowPerf = performance.now();
      const atMs = Math.round(nowPerf - gameStartPerfRef.current);
      const roundNum = activePhase === 'warmup' ? 1 : activePhase === 'offhand' ? 2 : 3;

      if (idx === nextIdx) {
        wrongLockRef.current = null;
        playCyberNodeLock(idx);
        const deltaMs = Math.max(40, Math.round(nowPerf - lastNodePerfRef.current));
        lastNodePerfRef.current = nowPerf;
        cutTimesRef.current.push(atMs);

        const label = labels[idx] ?? String(idx + 1);
        if (idx > 0) {
          phaseLinksRef.current.push({ to: label, ms: deltaMs });
        }
        eventsRef.current.push({
          at_ms: atMs,
          round: roundNum,
          phase: activePhase,
          hand: activeHand,
          reaction_ms: idx === 0 ? null : deltaMs,
          hit: true,
          label,
        });

        const updated = idx + 1;
        setNextIdx(updated);
        if (updated >= labels.length) {
          completePhase(activePhase, true, false);
        }
      } else if (wrongLockRef.current !== idx) {
        wrongLockRef.current = idx;
        phaseErrorsRef.current += 1;
        eventsRef.current.push({
          at_ms: atMs,
          round: roundNum,
          phase: activePhase,
          hand: activeHand,
          reaction_ms: null,
          hit: false,
          label: labels[idx] ?? '?',
        });
        triggerGlitch(idx);
      }
    },
    [activeHand, activePhase, completePhase, labels, nextIdx, triggerGlitch],
  );

  const samplePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!boardRef.current || !activePhase) return;
    const rect = boardRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setCursorPct({ x: xPct, y: yPct });

    dragSamplesRef.current.push({
      t: Math.round(performance.now() - gameStartPerfRef.current),
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    for (let i = nextIdx; i < positions.length; i++) {
      const p = positions[i]!;
      if (Math.hypot(p.x - xPct, p.y - yPct) <= HIT_RADIUS_PCT) {
        attemptNode(i);
        break;
      }
    }
  };

  const nextLabel = labels[nextIdx] ?? '';
  const prevPos = nextIdx > 0 ? positions[nextIdx - 1] : null;
  const progressPct = labels.length > 0 ? Math.round((nextIdx / labels.length) * 100) : 0;

  const rewardCode = useMemo(
    () => `RALPH-VIP-${Math.floor(1000 + Math.random() * 9000)}`,
    [],
  );

  const warmSec = ((warmupResultRef.current?.totalMs ?? 0) / 1000).toFixed(1);
  const offSec = ((offhandResultRef.current?.totalMs ?? 0) / 1000).toFixed(1);
  const bypSec = ((bypassResultRef.current?.totalMs ?? 0) / 1000).toFixed(1);

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-between gap-4 bg-cyber-bg p-4 text-cyber-text sm:p-6">
      {/* Header */}
      <header className="flex items-center justify-between rounded-card border border-cyber-grid bg-cyber-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <Ralph
            pose={
              stage === 'congrats_warmup' || stage === 'congrats_offhand' || stage === 'done'
                ? 'celebrate'
                : glitching
                  ? 'gentle'
                  : 'happy'
            }
            className="size-14"
          />
          <div>
            <p className="text-xs font-bold tracking-widest text-cyber-node uppercase">
              ⚡ CYBER CIRCUIT // FIREWALL HACKER
            </p>
            <h1 className="text-lg font-extrabold sm:text-xl">
              {stage === 'play_bypass' || stage === 'intro_bypass'
                ? t('games.cyber.phase2Title', 'PHASE 2 // FIREWALL BYPASS (1 ➔ A ➔ 2 ➔ B)')
                : stage === 'play_offhand' || stage === 'intro_offhand'
                  ? t('games.cyber.offhandTitle', 'AUX RELAY // OFF-HAND CALIBRATION')
                  : t('games.cyber.phase1Title', 'PHASE 1 // SYSTEM BOOT (1 ➔ 25)')}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MuteCheckinButton variant="cyber" />
          {onExit && (
            <button
              onClick={onExit}
              className="min-h-11 rounded-pill border border-cyber-grid bg-cyber-bg px-4 text-sm font-bold text-cyber-text active:scale-95"
            >
              ← {t('games.common.exit', 'Exit')}
            </button>
          )}
        </div>
      </header>

      {stage === 'hand' && (
        <div className="my-auto py-6">
          <HandPicker
            variant="cyber"
            onPick={(h) => {
              setHandedness(h);
              onHandednessChange?.(h);
              setStage('intro_warmup');
            }}
          />
        </div>
      )}

      {stage === 'intro_warmup' && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-cyber-node/60 bg-cyber-panel p-8 text-center"
        >
          <Ralph pose="wave" className="size-44" />
          <span className="rounded-pill border border-cyber-node px-4 py-1 text-xs font-bold tracking-widest text-cyber-node uppercase">
            PHASE 1 // THE WARM-UP
          </span>
          <h2 className="text-3xl font-extrabold">
            {t('games.cyber.warmupHeading', 'Boot Up the Neural Link')}
          </h2>
          <p className="max-w-lg text-lg text-cyber-muted">
            {t(
              'games.cyber.warmupDesc',
              'Use {{hand}}. Drag your finger (or tap) to connect the glowing blue nodes in order from 1 to 25 as fast as you can to boot up the hack.',
              { hand: handLabel(handedness, 'dominant', t) },
            )}
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => startPhase('warmup')}
            className="min-h-16 rounded-pill bg-cyber-node px-10 text-xl font-extrabold text-cyber-bg"
          >
            ⚡ {t('games.cyber.launchPhase1', 'INITIALIZE BOOT (1 ➔ 25)')}
          </motion.button>
        </motion.div>
      )}

      {/* Stage 1 finished → Ralph pops onto the screen to congratulate before Stage 2! */}
      {stage === 'congrats_warmup' && (
        <RalphCelebration
          variant="cyber"
          lang={i18n.language}
          title="Phase 1 Boot Complete!"
          speechText={`Awesome job! You connected all 25 boot nodes in ${warmSec} seconds! Next up, let's do a quick 10-node sync with your other hand before the main firewall!`}
          stats={[
            { icon: '⚡', label: 'Boot Time', value: `${warmSec}s` },
            { icon: '🎯', label: 'Nodes Linked', value: '25 / 25' },
            { icon: '🛡️', label: 'Glitches', value: `${warmupResultRef.current?.errors ?? 0}` },
          ]}
          nextLabel="Next Stage: Backup-Hand Sync"
          onNext={() => setStage('intro_offhand')}
          secondaryLabel={t('games.cyber.skipToPhase2', 'Skip straight to Phase 2')}
          onSecondary={() => setStage('intro_bypass')}
        />
      )}

      {stage === 'intro_offhand' && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-cyber-ok/60 bg-cyber-panel p-8 text-center"
        >
          <Ralph pose="happy" className="size-40" />
          <span className="rounded-pill border border-cyber-ok px-4 py-1 text-xs font-bold tracking-widest text-cyber-ok uppercase">
            STAGE 2 // AUXILIARY CHANNEL
          </span>
          <h2 className="text-3xl font-extrabold">
            {t('games.cyber.offhandHeading', 'Quick Backup-Hand Sync (1 ➔ 10)')}
          </h2>
          <p className="max-w-lg text-lg text-cyber-muted">
            {t(
              'games.cyber.offhandDesc',
              'Switch to {{hand}} for a quick 10-node sync before breaching the main firewall.',
              { hand: handLabel(handedness, 'non_dominant', t) },
            )}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => startPhase('offhand')}
              className="min-h-16 rounded-pill bg-cyber-ok px-10 text-xl font-extrabold text-cyber-bg active:scale-95"
            >
              {t('games.cyber.startOffhand', 'SYNC BACKUP HAND')}
            </button>
            <button
              onClick={() => setStage('intro_bypass')}
              className="min-h-16 rounded-pill border border-cyber-grid px-6 text-base font-bold text-cyber-muted"
            >
              {t('games.cyber.skipToPhase2', 'Skip to Firewall Bypass')}
            </button>
          </div>
        </motion.div>
      )}

      {/* Stage 2 finished → Ralph pops onto the screen to congratulate before Phase 2 Firewall Bypass! */}
      {stage === 'congrats_offhand' && (
        <RalphCelebration
          variant="cyber"
          lang={i18n.language}
          title="Backup Hand Calibrated!"
          speechText={`Sweet! You synced the backup channel in ${offSec} seconds! Now get ready for the final boss: Phase 2 Firewall Bypass!`}
          stats={[
            { icon: '🫲', label: 'Sync Time', value: `${offSec}s` },
            { icon: '🔗', label: 'Relay Nodes', value: '10 / 10' },
          ]}
          nextLabel="Next Stage: Firewall Bypass"
          onNext={() => setStage('intro_bypass')}
        />
      )}

      {stage === 'intro_bypass' && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-cyber-letter bg-cyber-panel p-8 text-center"
        >
          <Ralph pose="happy" className="size-40" />
          <span className="rounded-pill border border-cyber-letter px-4 py-1 text-xs font-bold tracking-widest text-cyber-letter uppercase">
            FINAL STAGE // THE FIREWALL BYPASS
          </span>
          <h2 className="text-3xl font-extrabold">
            {t('games.cyber.bypassHeading', 'Alternate Numbers & Letters!')}
          </h2>
          <p className="max-w-lg text-lg text-cyber-muted">
            {t(
              'games.cyber.bypassDesc',
              'The security grid now mixes numbers (1–13) and letters (A–L). Alternate your connections: 1 ➔ A ➔ 2 ➔ B ➔ 3 ➔ C … before the {{sec}}s countdown hits zero! Wrong nodes trigger a system glitch.',
              { sec: BYPASS_LIMIT_SEC },
            )}
          </p>
          <div className="rounded-pill border border-cyber-node/40 bg-cyber-bg px-6 py-2.5 font-mono text-lg font-bold text-cyber-node">
            1 ➔ A ➔ 2 ➔ B ➔ 3 ➔ C ➔ 4 ➔ D … ➔ 13
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => startPhase('bypass')}
            className="min-h-16 rounded-pill bg-cyber-letter px-10 text-xl font-extrabold text-cyber-bg"
          >
            🔓 {t('games.cyber.launchBypass', 'BREACH FIREWALL')}
          </motion.button>
        </motion.div>
      )}

      {activePhase && (
        <div className="flex flex-1 flex-col gap-3">
          {/* Status HUD + Progress bar */}
          <div className="space-y-2 rounded-card border border-cyber-grid bg-cyber-panel px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold sm:text-base">
              <div className="flex items-center gap-3">
                <span className="text-cyber-muted">NEXT TARGET:</span>
                <motion.span
                  key={nextLabel}
                  initial={{ scale: 0.7 }}
                  animate={{ scale: 1 }}
                  className="inline-flex size-9 items-center justify-center rounded-pill bg-cyber-node font-mono text-lg font-extrabold text-cyber-bg"
                >
                  {nextLabel}
                </motion.span>
                <span className="text-xs text-cyber-muted">
                  ({nextIdx}/{labels.length})
                </span>
              </div>

              {activePhase === 'bypass' && (
                <div
                  className={`font-mono text-lg font-extrabold ${
                    secondsLeft <= 15 ? 'text-cyber-error' : 'text-cyber-ok'
                  }`}
                >
                  ⏱ {secondsLeft}s
                </div>
              )}

              <div className="text-xs text-cyber-muted">
                GLITCHES: <span className="font-extrabold text-cyber-error">{phaseErrorsRef.current}</span>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-pill bg-cyber-bg">
              <motion.div
                className="h-full rounded-pill bg-cyber-ok"
                animate={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Interactive circuit board */}
          <motion.div
            ref={boardRef}
            animate={glitching ? { x: [-9, 9, -6, 6, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
            onPointerDown={(e) => {
              setDragging(true);
              samplePointer(e);
            }}
            onPointerMove={(e) => {
              if (!dragging && e.buttons === 0) return;
              samplePointer(e);
            }}
            onPointerUp={() => {
              setDragging(false);
              setCursorPct(null);
            }}
            onPointerCancel={() => {
              setDragging(false);
              setCursorPct(null);
            }}
            className={`relative min-h-104 flex-1 overflow-hidden rounded-card border-2 select-none ${
              glitching ? 'border-cyber-error bg-cyber-error/10' : 'border-cyber-grid bg-cyber-panel'
            }`}
            style={{
              touchAction: 'none',
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.08) 0%, transparent 70%), linear-gradient(to right, rgba(22, 36, 74, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(22, 36, 74, 0.45) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 36px 36px, 36px 36px',
            }}
          >
            {/* Vector trace lines connecting completed nodes + active finger drag */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full"
            >
              <defs>
                <filter id="laserGlow">
                  <feGaussianBlur stdDeviation="0.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {positions.slice(0, nextIdx).map((pos, i) => {
                if (i === 0) return null;
                const prev = positions[i - 1]!;
                return (
                  <line
                    key={`edge-${i}`}
                    x1={prev.x}
                    y1={prev.y}
                    x2={pos.x}
                    y2={pos.y}
                    stroke="var(--color-cyber-ok)"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    filter="url(#laserGlow)"
                  />
                );
              })}
              {dragging && prevPos && cursorPct && (
                <line
                  x1={prevPos.x}
                  y1={prevPos.y}
                  x2={cursorPct.x}
                  y2={cursorPct.y}
                  stroke="var(--color-cyber-node)"
                  strokeWidth="0.9"
                  strokeDasharray="1.6 1.6"
                />
              )}
            </svg>

            {/* Nodes */}
            {positions.map((pos, idx) => {
              const label = labels[idx]!;
              const done = idx < nextIdx;
              const isFirst = idx === 0 && nextIdx === 0;
              const isError = errorNodeIdx === idx;
              const isLetter = /^[A-Z]$/.test(label);

              const nodeColor = isError
                ? 'border-cyber-error bg-cyber-error text-cyber-bg scale-125'
                : done
                  ? 'border-cyber-ok bg-cyber-ok/25 text-cyber-ok opacity-75 scale-90'
                  : isLetter
                    ? 'border-cyber-letter bg-cyber-bg text-cyber-letter shadow-soft'
                    : 'border-cyber-node bg-cyber-bg text-cyber-node shadow-soft';

              return (
                <button
                  key={`${activePhase}-${label}`}
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragging(true);
                    attemptNode(idx);
                  }}
                  onPointerEnter={(e) => {
                    if (dragging || e.buttons > 0) attemptNode(idx);
                  }}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className={`absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill border-2 font-mono text-base font-extrabold transition-transform sm:size-12 sm:text-lg ${nodeColor} ${
                    isFirst ? 'ring-4 ring-cyber-ok/60' : ''
                  }`}
                >
                  {done ? '✓' : label}
                </button>
              );
            })}

            {glitching && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="rounded-pill bg-cyber-error px-4 py-1.5 font-mono text-xs font-extrabold tracking-widest text-cyber-bg uppercase shadow-soft">
                  ⚠ SYSTEM GLITCH // WRONG SEQUENCE — FIND NODE [{nextLabel}]
                </span>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Final Stage finished → Ralph pops onto the screen to congratulate & present VIP Wi-Fi Passkey! */}
      {stage === 'done' && (
        <RalphCelebration
          variant="cyber"
          lang={i18n.language}
          title={t('games.cyber.unlockedTitle', 'Firewall Breached! VIP Wi-Fi Unlocked!')}
          speechText={`Boom! You cracked the security circuit in ${bypSec} seconds! Here is your VIP Wi-Fi passkey: ${rewardCode}!`}
          subtitle={`VIP PASSKEY TOKEN: ${rewardCode}`}
          stats={[
            { icon: '🔑', label: 'VIP Passkey', value: rewardCode },
            { icon: '⏱', label: 'Bypass Time', value: `${bypSec}s` },
            { icon: '⚡', label: 'Boot Time', value: `${warmSec}s` },
          ]}
          nextLabel={onExit ? t('games.common.done', 'Continue to Waiting Hub') : t('games.common.playAgain', 'Run New Hack')}
          onNext={() => {
            if (onExit) onExit();
            else startPhase('warmup');
          }}
          secondaryLabel={onExit ? t('games.common.playAgain', 'Run New Hack') : undefined}
          onSecondary={onExit ? () => startPhase('warmup') : undefined}
        />
      )}
    </section>
  );
}

export default CyberCircuit;
