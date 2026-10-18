import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Ralph } from '../components/Ralph';
import { RalphCelebration } from '../components/RalphCelebration';
import { MuteCheckinButton } from '../components/MuteCheckinButton';
import { playCyberGlitch, playCyberNodeLock } from '../../lib/sfx';

/**
 * Game 2: "Cyber Circuit: Firewall Hacker" (ages ~8+). A connect-the-dots puzzle themed as a hack.
 *  - Phase 1 (boot): connect 1 → 20 in order.
 *  - Phase 2 (firewall): every number appears twice, in two colours. Count up while switching
 *    colour each time (1 blue circle → 2 orange square → 3 blue circle …); the other-colour copies are decoys.
 *    Numbers + colours only, so it works in every language.
 *
 * Just for fun: nothing is measured or sent anywhere (CLAUDE.md rule 9). The timer is only
 * for excitement — running out ends the round kindly. Layout is reshuffled every round.
 */

interface CyberCircuitProps {
  /** A round finished — the hub may show a check-in before the next one. */
  onRoundEnd?: () => void;
  onExit?: () => void;
}

type Stage = 'intro_boot' | 'play_boot' | 'congrats_boot' | 'intro_firewall' | 'play_firewall' | 'done';
type Phase = 'boot' | 'firewall';
type NodeColor = 'a' | 'b';

interface CircuitNode {
  label: string;
  color: NodeColor;
  /** Position in the path (0-based), or -1 for a decoy. */
  order: number;
  x: number;
  y: number;
}

const BOOT_COUNT = 20;
const FIREWALL_COUNT = 12; // 1..12, each in both colours = 24 nodes
const FIREWALL_SECONDS = 90;
const HIT_RADIUS_PCT = 6.4;

/** Random, non-overlapping positions (percent of the board), reshuffled every round. */
function scatter(count: number): { x: number; y: number }[] {
  const minDist = count > 22 ? 13 : 15;
  const pts: { x: number; y: number }[] = [];
  for (let tries = 0; pts.length < count && tries < 6000; tries++) {
    const p = { x: 8 + Math.random() * 84, y: 9 + Math.random() * 82 };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minDist - Math.floor(tries / 1500) * 2)) pts.push(p);
  }
  return pts;
}

function buildNodes(phase: Phase): CircuitNode[] {
  const specs: Omit<CircuitNode, 'x' | 'y'>[] =
    phase === 'boot'
      ? Array.from({ length: BOOT_COUNT }, (_, i) => ({ label: String(i + 1), color: 'a' as const, order: i }))
      : Array.from({ length: FIREWALL_COUNT }, (_, i) => {
          const n = i + 1;
          const pathColor: NodeColor = n % 2 === 1 ? 'a' : 'b';
          return (['a', 'b'] as const).map((color) => ({ label: String(n), color, order: color === pathColor ? i : -1 }));
        }).flat();
  const pts = scatter(specs.length);
  return specs.map((s, i) => ({ ...s, ...pts[i]! }));
}

const COLOR_CLASS: Record<NodeColor, string> = {
  a: 'rounded-pill border-cyber-node bg-cyber-bg text-cyber-node shadow-soft',
  b: 'rounded-md border-cyber-alt bg-cyber-bg text-cyber-alt shadow-soft', // square: not colour alone
};

export function CyberCircuit({ onRoundEnd, onExit }: CyberCircuitProps) {
  const { t, i18n } = useTranslation();
  const [stage, setStage] = useState<Stage>('intro_boot');
  const [nodes, setNodes] = useState<CircuitNode[]>([]);
  const [nextIdx, setNextIdx] = useState(0);
  const [errorNodeIdx, setErrorNodeIdx] = useState<number | null>(null);
  const [glitching, setGlitching] = useState(false);
  const [glitches, setGlitches] = useState(0);
  const [cursorPct, setCursorPct] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(FIREWALL_SECONDS);
  const [timedOut, setTimedOut] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const phaseStartRef = useRef(performance.now());
  const wrongLockRef = useRef<number | null>(null);

  const activePhase: Phase | null = stage === 'play_boot' ? 'boot' : stage === 'play_firewall' ? 'firewall' : null;
  const pathLength = useMemo(() => nodes.filter((n) => n.order >= 0).length, [nodes]);
  const pathNodes = useMemo(
    () => nodes.filter((n) => n.order >= 0).sort((p, q) => p.order - q.order),
    [nodes],
  );

  const startPhase = useCallback((phase: Phase) => {
    setNodes(buildNodes(phase));
    setNextIdx(0);
    setErrorNodeIdx(null);
    setGlitching(false);
    setGlitches(0);
    setCursorPct(null);
    setDragging(false);
    setTimedOut(false);
    wrongLockRef.current = null;
    phaseStartRef.current = performance.now();
    if (phase === 'firewall') setSecondsLeft(FIREWALL_SECONDS);
    setStage(phase === 'boot' ? 'play_boot' : 'play_firewall');
  }, []);

  const finishPhase = useCallback(
    (phase: Phase, outOfTime = false) => {
      setDragging(false);
      setCursorPct(null);
      if (phase === 'boot') {
        setStage('congrats_boot');
      } else {
        setTimedOut(outOfTime);
        setStage('done');
        onRoundEnd?.();
      }
    },
    [onRoundEnd],
  );

  // Visual countdown for the firewall phase. Running out just ends the round kindly.
  useEffect(() => {
    if (stage !== 'play_firewall') return;
    const id = setInterval(() => {
      const rem = Math.max(0, FIREWALL_SECONDS - Math.floor((performance.now() - phaseStartRef.current) / 1000));
      setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(id);
        finishPhase('firewall', true);
      }
    }, 250);
    return () => clearInterval(id);
  }, [finishPhase, stage]);

  const triggerGlitch = useCallback((idx: number) => {
    playCyberGlitch();
    setGlitches((g) => g + 1);
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
      const node = nodes[idx];
      if (!node || (node.order >= 0 && node.order < nextIdx)) return; // already linked

      if (node.order === nextIdx) {
        wrongLockRef.current = null;
        playCyberNodeLock(nextIdx);
        const updated = nextIdx + 1;
        setNextIdx(updated);
        if (updated >= pathLength) finishPhase(activePhase);
      } else if (wrongLockRef.current !== idx) {
        wrongLockRef.current = idx;
        triggerGlitch(idx);
      }
    },
    [activePhase, finishPhase, nextIdx, nodes, pathLength, triggerGlitch],
  );

  const samplePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!boardRef.current || !activePhase) return;
    const rect = boardRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setCursorPct({ x: xPct, y: yPct });
    const hit = nodes.findIndex((n) => Math.hypot(n.x - xPct, n.y - yPct) <= HIT_RADIUS_PCT);
    if (hit >= 0) attemptNode(hit);
  };

  const target = pathNodes[nextIdx];
  const prevPos = nextIdx > 0 ? pathNodes[nextIdx - 1] : null;
  const progressPct = pathLength > 0 ? Math.round((nextIdx / pathLength) * 100) : 0;
  const badge = useMemo(() => `AGENT-RALPH-${Math.floor(1000 + Math.random() * 9000)}`, []);

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-between gap-4 bg-cyber-bg p-4 text-cyber-text sm:p-6">
      <header className="flex items-center justify-between rounded-card border border-cyber-grid bg-cyber-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <Ralph pose={stage === 'congrats_boot' || stage === 'done' ? 'celebrate' : glitching ? 'gentle' : 'happy'} className="size-14" />
          <div>
            <p className="text-xs font-bold tracking-widest text-cyber-node uppercase">⚡ CYBER CIRCUIT // FIREWALL HACKER</p>
            <h1 className="text-lg font-extrabold sm:text-xl">
              {stage === 'play_firewall' || stage === 'intro_firewall'
                ? t('games.cyber.firewallTitle', 'PHASE 2 // FIREWALL')
                : t('games.cyber.bootTitle', 'PHASE 1 // SYSTEM BOOT')}
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

      {stage === 'intro_boot' && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-cyber-node/60 bg-cyber-panel p-8 text-center"
        >
          <Ralph pose="wave" className="size-44" />
          <h2 className="text-3xl font-extrabold">{t('games.cyber.bootHeading', 'Boot up the hack')}</h2>
          <p className="max-w-lg text-lg text-cyber-muted">
            {t('games.cyber.bootDesc', 'Drag your finger (or tap) to connect the glowing nodes in order, from 1 to {{n}}.', { n: BOOT_COUNT })}
          </p>
          <div className="rounded-pill border border-cyber-node/40 bg-cyber-bg px-6 py-2.5 font-mono text-lg font-bold text-cyber-node">1 ➔ 2 ➔ 3 ➔ … ➔ {BOOT_COUNT}</div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => startPhase('boot')}
            className="min-h-16 rounded-pill bg-cyber-node px-10 text-xl font-extrabold text-cyber-bg"
          >
            ⚡ {t('games.cyber.startBoot', 'START BOOT')}
          </motion.button>
        </motion.div>
      )}

      {stage === 'congrats_boot' && (
        <RalphCelebration
          variant="cyber"
          lang={i18n.language}
          title={t('games.cyber.bootDoneTitle', 'System booted!')}
          speechText={t('games.cyber.bootDoneSpeech', 'Awesome! The system is booted. Now for the firewall: count up and switch colours every time!')}
          stats={[{ icon: '🎯', label: t('games.cyber.statLinked', 'Nodes linked'), value: `${BOOT_COUNT} / ${BOOT_COUNT}` }]}
          nextLabel={t('games.cyber.toFirewall', 'Next: the firewall')}
          onNext={() => setStage('intro_firewall')}
        />
      )}

      {stage === 'intro_firewall' && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto flex flex-col items-center gap-6 rounded-card border-2 border-cyber-alt bg-cyber-panel p-8 text-center"
        >
          <Ralph pose="happy" className="size-40" />
          <h2 className="text-3xl font-extrabold">{t('games.cyber.firewallHeading', 'Switch colours as you count!')}</h2>
          <p className="max-w-lg text-lg text-cyber-muted">
            {t(
              'games.cyber.firewallDesc',
              'Every number is here twice, in two colours. Count up from 1 to {{n}}, switching colour every time. The other copies are traps!',
              { n: FIREWALL_COUNT },
            )}
          </p>
          <div className="flex items-center gap-2 rounded-pill border border-cyber-grid bg-cyber-bg px-5 py-2.5 font-mono text-lg font-bold">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="flex items-center gap-2">
                <span className={n % 2 ? 'text-cyber-node' : 'text-cyber-alt'}>{n}</span>
                <span className="text-cyber-muted">➔</span>
              </span>
            ))}
            <span className="text-cyber-muted">…</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => startPhase('firewall')}
            className="min-h-16 rounded-pill bg-cyber-alt px-10 text-xl font-extrabold text-cyber-bg"
          >
            🔓 {t('games.cyber.startFirewall', 'BREAK THE FIREWALL')}
          </motion.button>
        </motion.div>
      )}

      {activePhase && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="space-y-2 rounded-card border border-cyber-grid bg-cyber-panel px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold sm:text-base">
              <div className="flex items-center gap-3">
                <span className="text-cyber-muted">{t('games.cyber.next', 'NEXT:')}</span>
                {target && (
                  <motion.span
                    key={`${nextIdx}`}
                    initial={{ scale: 0.7 }}
                    animate={{ scale: 1 }}
                    className={`inline-flex size-9 items-center justify-center rounded-pill border-2 font-mono text-lg font-extrabold ${COLOR_CLASS[target.color]}`}
                  >
                    {target.label}
                  </motion.span>
                )}
                <span className="text-xs text-cyber-muted">
                  ({nextIdx}/{pathLength})
                </span>
              </div>
              {activePhase === 'firewall' && (
                <div className={`font-mono text-lg font-extrabold ${secondsLeft <= 15 ? 'text-cyber-error' : 'text-cyber-ok'}`}>⏱ {secondsLeft}s</div>
              )}
              <div className="text-xs text-cyber-muted">
                {t('games.cyber.glitches', 'GLITCHES:')} <span className="font-extrabold text-cyber-error">{glitches}</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-cyber-bg">
              <motion.div className="h-full rounded-pill bg-cyber-ok" animate={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <motion.div
            ref={boardRef}
            animate={glitching ? { x: [-6, 6, -3, 3, 0] } : { x: 0 }}
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
            {/* Trace lines between linked nodes + the live drag line */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
              <defs>
                <filter id="laserGlow">
                  <feGaussianBlur stdDeviation="0.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {pathNodes.slice(1, nextIdx).map((pos, i) => {
                const prev = pathNodes[i]!;
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

            {nodes.map((node, idx) => {
              const done = node.order >= 0 && node.order < nextIdx;
              const isError = errorNodeIdx === idx;
              const isStart = node.order === 0 && nextIdx === 0;
              const cls = isError
                ? 'rounded-pill border-cyber-error bg-cyber-error text-cyber-bg scale-110'
                : done
                  ? 'rounded-pill border-cyber-ok bg-cyber-ok/25 text-cyber-ok opacity-75 scale-90'
                  : COLOR_CLASS[node.color];
              return (
                <button
                  key={`${activePhase}-${node.label}-${node.color}`}
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragging(true);
                    attemptNode(idx);
                  }}
                  onPointerEnter={(e) => {
                    if (dragging || e.buttons > 0) attemptNode(idx);
                  }}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  className={`absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 font-mono text-base font-extrabold transition-transform sm:size-12 sm:text-lg ${cls} ${
                    isStart ? 'ring-4 ring-cyber-ok/60' : ''
                  }`}
                >
                  {done ? '✓' : node.label}
                </button>
              );
            })}

            {glitching && target && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="rounded-pill bg-cyber-error px-4 py-1.5 font-mono text-xs font-extrabold tracking-widest text-cyber-bg uppercase shadow-soft">
                  {t('games.cyber.glitchHint', 'Oops! Find {{label}}', { label: target.label })}
                </span>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {stage === 'done' && (
        <RalphCelebration
          variant="cyber"
          lang={i18n.language}
          title={
            timedOut
              ? t('games.cyber.timeUpTitle', 'Time! Great hacking!')
              : t('games.cyber.doneTitle', 'Firewall broken!')
          }
          speechText={
            timedOut
              ? t('games.cyber.timeUpSpeech', 'Time is up, but you got so far! Want to try again?')
              : t('games.cyber.doneSpeech', 'Boom! You broke the firewall! You earned a hacker badge!')
          }
          subtitle={timedOut ? undefined : t('games.cyber.badge', 'Your hacker badge: {{badge}}', { badge })}
          stats={[
            { icon: '🔗', label: t('games.cyber.statLinked', 'Nodes linked'), value: `${nextIdx} / ${pathLength}` },
            ...(timedOut ? [] : [{ icon: '🏅', label: t('games.cyber.statBadge', 'Badge'), value: badge }]),
          ]}
          nextLabel={t('games.common.playAgain', 'Play Again')}
          onNext={() => setStage('intro_boot')}
          secondaryLabel={onExit ? t('games.common.done', 'Back to Ralph') : undefined}
          onSecondary={onExit}
        />
      )}
    </section>
  );
}

export default CyberCircuit;
