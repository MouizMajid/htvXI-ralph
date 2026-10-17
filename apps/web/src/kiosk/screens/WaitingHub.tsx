import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AUTO_CHECKIN_MINUTES,
  DEFAULT_COMPANION_TIMINGS,
  type AssignedNurseInfo,
  type Feeling,
  type GameResult,
  type Handedness,
  type Lang,
} from '@ralph/shared';
import { Ralph } from '../components/Ralph';
import { MuteCheckinButton } from '../components/MuteCheckinButton';
import { kioskApi } from '../../lib/api';
import { postCheckin } from '../../lib/kioskApi';
import { speak, useRalphMuted } from '../../lib/speech';
import { FireflyTap } from '../games/GameOne';
import { CyberCircuit } from '../games/GameTwo';
import { Companion } from './Companion';

/**
 * Waiting-room hub:
 * 1. Shows the patient exactly who their assigned nurse is ("Meeting Their Nurse").
 * 2. Displays live dynamic wait times that update in real-time when rooms clear early.
 * 3. Lets the child choose games ("Firefly Tap", "Cyber Circuit") or chat with Ralph.
 * 4. Runs the 12-minute Ralph check-in timer (unless muted).
 */

interface WaitingHubProps {
  visitId?: string;
  initialName?: string;
  initialAge?: number;
  language?: Lang;
  initialAssignedNurse?: AssignedNurseInfo | null;
  initialWaitMinutes?: number | null;
  initialQueuePosition?: number | null;
}

type ActiveTab = 'hub' | 'firefly_tap' | 'cyber_circuit' | 'companion';

export function WaitingHub({
  visitId = 'demo',
  initialName = 'Maya',
  initialAge = 7,
  language = 'en',
  initialAssignedNurse = null,
  initialWaitMinutes = null,
  initialQueuePosition = null,
}: WaitingHubProps) {
  const { t } = useTranslation();
  const [muted] = useRalphMuted();
  const [name, setName] = useState(initialName);
  const [age, setAge] = useState(initialAge);
  const [handedness, setHandedness] = useState<Handedness | undefined>(undefined);
  const [tab, setTab] = useState<ActiveTab>('hub');
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [starsEarned, setStarsEarned] = useState(0);
  const [showTelemetry, setShowTelemetry] = useState(false);

  // Live Nurse & Dynamic Wait Time State (Pillar 3)
  const [nurse, setNurse] = useState<AssignedNurseInfo | null>(
    initialAssignedNurse || {
      id: 'nurse-sarah',
      name: 'Nurse Sarah',
      title: 'Pediatric Emergency RN',
      avatar: '👩‍⚕️',
    },
  );
  const [waitMin, setWaitMin] = useState<number>(initialWaitMinutes ?? 12);
  const [prevWaitMin, setPrevWaitMin] = useState<number | null>(null);
  const [queuePos, setQueuePos] = useState<number>(initialQueuePosition ?? 1);
  const [roomStatus, setRoomStatus] = useState<'waiting' | 'in_room' | 'done'>('waiting');
  const [waitDropBanner, setWaitDropBanner] = useState<string | null>(null);

  // Poll live nurse assignment and wait times every 3.5 seconds
  useEffect(() => {
    let active = true;
    const pollStatus = async () => {
      try {
        const res = await kioskApi.status(visitId);
        if (!active || !res) return;
        if (res.assigned_nurse) setNurse(res.assigned_nurse);
        if (typeof res.estimated_wait_minutes === 'number') {
          setWaitMin((curr) => {
            if (curr > res.estimated_wait_minutes! + 1) {
              const diff = curr - res.estimated_wait_minutes!;
              setWaitDropBanner(
                `⚡ Faster than expected! Nurse ${res.assigned_nurse?.name || 'Sarah'} cleared the previous room early. Your wait time dropped by ${diff} minutes!`,
              );
              setPrevWaitMin(curr);
            }
            return res.estimated_wait_minutes!;
          });
        }
        if (typeof res.queue_position === 'number') setQueuePos(res.queue_position);
        if (res.status) setRoomStatus(res.status);
      } catch {
        /* demo mode / mock fallback */
      }
    };

    void pollStatus();
    const interval = setInterval(() => void pollStatus(), 3500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [visitId]);

  // Automatic 12-minute check-in modal when on the hub (disabled when muted)
  const [checkinModalOpen, setCheckinModalOpen] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number>(
    Math.round(DEFAULT_COMPANION_TIMINGS.quietCheckinMs / 1000),
  );
  const deadlineRef = useRef<number>(Date.now() + DEFAULT_COMPANION_TIMINGS.quietCheckinMs);

  useEffect(() => {
    if (tab !== 'hub' || muted || checkinModalOpen) return;

    deadlineRef.current = Date.now() + DEFAULT_COMPANION_TIMINGS.quietCheckinMs;
    setRemainingSec(Math.round(DEFAULT_COMPANION_TIMINGS.quietCheckinMs / 1000));

    const tick = setInterval(() => {
      const rem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemainingSec(rem);
    }, 1000);

    const timer = setTimeout(() => {
      clearInterval(tick);
      setCheckinModalOpen(true);
      speak(
        t('companion.checkinLine', 'Hey, how are you feeling now?'),
        language,
        () => {},
      );
    }, DEFAULT_COMPANION_TIMINGS.quietCheckinMs);

    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [checkinModalOpen, language, muted, t, tab]);

  const handleQuickCheckin = (feeling: Exclude<Feeling, 'no_response'>) => {
    void postCheckin(visitId, {
      feeling,
      source: 'timer',
    });
    setCheckinModalOpen(false);
  };

  if (tab === 'firefly_tap') {
    return (
      <FireflyTap
        visitId={visitId}
        ageYears={age}
        initialHandedness={handedness}
        onHandednessChange={setHandedness}
        onFinish={(res) => {
          setLastResult(res);
          setStarsEarned((s) => s + 1);
        }}
        onExit={() => setTab('hub')}
      />
    );
  }

  if (tab === 'cyber_circuit') {
    return (
      <CyberCircuit
        visitId={visitId}
        initialHandedness={handedness}
        onHandednessChange={setHandedness}
        onFinish={(res) => {
          setLastResult(res);
          setStarsEarned((s) => s + 1);
        }}
        onExit={() => setTab('hub')}
      />
    );
  }

  if (tab === 'companion') {
    return (
      <Companion
        visitId={visitId}
        firstName={name}
        ageYears={age}
        language={language}
        onSwitchToGames={() => setTab('hub')}
      />
    );
  }

  const isTeen = age >= 10;
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-between gap-6 p-4 sm:p-6">
      {/* Header + patient age switcher, Mute button & stars counter */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-card border-2 border-accent/40 bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-4">
          <Ralph
            pose={muted ? 'sleep' : starsEarned > 0 ? 'celebrate' : 'wave'}
            className="size-24 sm:size-28"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-pill bg-accent/35 px-3 py-0.5 text-xs font-extrabold text-ink">
                ⭐ {starsEarned} {starsEarned === 1 ? 'RALPH STAR' : 'RALPH STARS'}
              </span>
              <span className="rounded-pill bg-bg px-3 py-0.5 text-xs font-extrabold text-ink-muted">
                {muted
                  ? `🔇 Auto ${AUTO_CHECKIN_MINUTES}m check-in muted`
                  : `⏱ Next check-in in ${mins}m ${secs.toString().padStart(2, '0')}s`}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
              {t('waiting.title', "Hi {{name}}! Let's hang out while we wait.", { name })}
            </h1>
            <p className="text-base font-semibold text-ink-muted">
              {t('waiting.subtitle', 'Pick a fun game below, or just chat and rest with Ralph!')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mute / Unmute Button for 12-minute check-ins */}
          <MuteCheckinButton />

          <div className="flex items-center gap-2 rounded-card bg-bg px-4 py-2 text-sm font-bold">
            <label className="text-ink-muted" htmlFor="demo-name">
              Name:
            </label>
            <input
              id="demo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-20 rounded-pill bg-surface px-3 py-1 font-extrabold text-ink shadow-soft outline-none"
            />
            <label className="text-ink-muted" htmlFor="demo-age">
              Age:
            </label>
            <input
              id="demo-age"
              type="number"
              min={4}
              max={17}
              value={age}
              onChange={(e) => setAge(Math.max(4, Math.min(17, Number(e.target.value) || 7)))}
              className="w-14 rounded-pill bg-surface px-2 py-1 text-center font-extrabold text-ink shadow-soft outline-none"
            />
          </div>
        </div>
      </header>

      {/* PILLAR 3: MEET YOUR NURSE & LIVE DYNAMIC WAIT TIME CARD */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-card border-2 border-secondary/30 bg-gradient-to-r from-blue-50/60 via-surface to-blue-50/40 p-5 shadow-soft"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          {/* Left: Nurse Info */}
          <div className="flex items-center gap-4">
            <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-secondary/15 text-3xl shadow-inner ring-2 ring-secondary/30">
              {nurse?.avatar || '👩‍⚕️'}
              <span className="absolute -top-1 -right-1 flex size-4">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-yes opacity-75" />
                <span className="relative inline-flex size-4 rounded-full bg-yes border-2 border-surface" />
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill bg-secondary/15 px-3 py-0.5 text-xs font-black tracking-wide text-secondary uppercase">
                  Your Assigned Nurse
                </span>
                <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-bold text-ink-muted shadow-sm">
                  Spot #{queuePos} in line
                </span>
              </div>
              <h2 className="mt-1 text-xl font-extrabold text-ink sm:text-2xl">
                You are in line to see <span className="text-secondary">{nurse?.name || 'Nurse Sarah'}</span>
              </h2>
              <p className="text-sm font-semibold text-ink-muted">
                {nurse?.title || 'Pediatric Emergency RN'} · Care room will be ready shortly
              </p>
            </div>
          </div>

          {/* Right: Live Dynamic Wait Time */}
          <div className="flex shrink-0 flex-col items-start rounded-2xl border border-secondary/20 bg-surface px-5 py-3 shadow-sm sm:items-end">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-yes opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-yes" />
              </span>
              <span className="text-xs font-extrabold tracking-wider text-ink-muted uppercase">
                Live Wait Estimate
              </span>
            </div>

            {roomStatus === 'in_room' ? (
              <span className="mt-0.5 text-2xl font-black text-yes">
                Ready in Room! 🚪
              </span>
            ) : (
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-black tabular-nums text-ink sm:text-4xl">
                  ~{waitMin}
                </span>
                <span className="text-base font-bold text-ink-muted">min</span>
              </div>
            )}

            <p className="text-[11px] font-semibold text-ink-muted">
              {roomStatus === 'in_room'
                ? 'Please head inside the care room'
                : 'Updates live as care rooms clear'}
            </p>
          </div>
        </div>

        {/* Real-time Wait Time Drop Notification Banner */}
        <AnimatePresence>
          {waitDropBanner && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex items-center justify-between rounded-xl border border-yes/40 bg-yes/15 px-4 py-2.5 text-sm font-bold text-yes"
            >
              <span>{waitDropBanner}</span>
              <button
                type="button"
                onClick={() => setWaitDropBanner(null)}
                className="ml-3 text-xs underline hover:opacity-80"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Automatic 12-Minute Check-In Popup Modal */}
      <AnimatePresence>
        {checkinModalOpen && !muted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="flex flex-col items-center gap-4 rounded-card border-2 border-primary bg-surface p-6 text-center shadow-soft"
          >
            <Ralph pose="gentle" className="size-36" />
            <span className="rounded-pill bg-accent/35 px-4 py-1 text-xs font-extrabold text-ink">
              🔔 {AUTO_CHECKIN_MINUTES}-MINUTE CHECK-IN
            </span>
            <h2 className="text-3xl font-extrabold text-ink">
              “{t('companion.checkinLine', 'Hey, how are you feeling now?')}”
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => handleQuickCheckin('better')}
                className="min-h-14 rounded-pill bg-yes px-6 text-lg font-extrabold text-on-primary shadow-soft active:scale-95"
              >
                😊 {t('companion.feelBetter', 'Feeling better')}
              </button>
              <button
                type="button"
                onClick={() => handleQuickCheckin('same')}
                className="min-h-14 rounded-pill bg-secondary px-6 text-lg font-extrabold text-on-secondary shadow-soft active:scale-95"
              >
                😐 {t('companion.feelSame', 'About the same')}
              </button>
              <button
                type="button"
                onClick={() => handleQuickCheckin('worse')}
                className="min-h-14 rounded-pill bg-no px-6 text-lg font-extrabold text-on-primary shadow-soft active:scale-95"
              >
                😣 {t('companion.feelWorse', 'Feeling worse')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCheckinModalOpen(false);
                  setTab('companion');
                }}
                className="min-h-14 rounded-pill bg-accent px-6 text-lg font-extrabold text-ink shadow-soft active:scale-95"
              >
                💬 Chat with Ralph
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main activity cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Game 1: Firefly Tap (Younger kids) */}
        <motion.div
          whileHover={{ y: -4 }}
          className={`flex flex-col justify-between gap-5 overflow-hidden rounded-card bg-night-deep p-6 text-on-primary shadow-soft ${
            !isTeen ? 'ring-4 ring-accent' : ''
          }`}
          style={{
            background:
              'radial-gradient(circle at 85% 15%, #3b468c 0%, #232a5c 55%, #141938 100%)',
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex size-14 items-center justify-center rounded-pill bg-firefly/20 text-4xl ring-4 ring-firefly/30">
                ✨
              </span>
              <span className="rounded-pill bg-firefly px-3.5 py-1 text-xs font-extrabold text-ink">
                {!isTeen ? '★ Recommended · Ages 4–9' : 'Ages 4–9'}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-firefly sm:text-3xl">
              {t('games.fireflyTap.title', 'Firefly Tap')}
            </h2>
            <p className="text-base font-semibold text-star">
              {t(
                'games.fireflyTap.cardDesc',
                "Tap the glowing fireflies in the enchanted forest to light up Ralph's lantern!",
              )}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setTab('firefly_tap')}
            className="min-h-16 w-full rounded-pill bg-accent text-xl font-extrabold text-ink shadow-soft"
          >
            {t('waiting.playFirefly', 'Play Firefly Tap ✨')}
          </motion.button>
        </motion.div>

        {/* Game 2: Cyber Circuit: Firewall Hacker (Adolescents & Pre-teens 10+) */}
        <motion.div
          whileHover={{ y: -4 }}
          className={`flex flex-col justify-between gap-5 rounded-card border-2 border-cyber-grid bg-cyber-panel p-6 text-cyber-text shadow-soft ${
            isTeen ? 'ring-4 ring-cyber-node' : ''
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex size-14 items-center justify-center rounded-pill border-2 border-cyber-node bg-cyber-bg font-mono text-2xl font-extrabold text-cyber-node">
                1➔A
              </span>
              <span className="rounded-pill border border-cyber-node bg-cyber-node/15 px-3.5 py-1 text-xs font-extrabold text-cyber-node">
                {isTeen ? '★ Recommended · Ages 10+' : 'Ages 10+'}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-cyber-text sm:text-3xl">
              {t('games.cyber.cardTitle', 'Cyber Circuit: Firewall Hacker')}
            </h2>
            <p className="text-base font-semibold text-cyber-muted">
              {t(
                'games.cyber.cardDesc',
                'Link nodes 1➔25 to boot up, then alternate 1➔A➔2➔B under the clock to unlock the VIP Wi-Fi code!',
              )}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setTab('cyber_circuit')}
            className="min-h-16 w-full rounded-pill bg-cyber-node text-xl font-extrabold text-cyber-bg shadow-soft"
          >
            {t('waiting.playCyber', 'Launch Cyber Hack ⚡')}
          </motion.button>
        </motion.div>
      </div>

      {/* Companion option for kids who don't want to play or don't feel well enough */}
      <motion.div
        whileHover={{ y: -2 }}
        className="flex flex-col items-center justify-between gap-4 rounded-card border-2 border-secondary/30 bg-surface p-6 shadow-soft sm:flex-row"
      >
        <div className="flex items-center gap-4 text-center sm:text-left">
          <Ralph pose="gentle" className="hidden size-20 shrink-0 sm:block" />
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-ink">
              💬 {t('waiting.companionTitle', "Don't feel like playing a game?")}
            </h2>
            <p className="text-base font-semibold text-ink-muted">
              {t(
                'waiting.companionDesc',
                'Just talk with Ralph about how you feel or your favourite hobbies — or rest quietly and Ralph will check on you every 12 minutes (unless muted).',
              )}
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setTab('companion')}
          className="min-h-16 shrink-0 rounded-pill bg-secondary px-8 text-xl font-extrabold text-on-secondary shadow-soft"
        >
          {t('waiting.talkWithRalph', 'Talk with Ralph 🦝')}
        </motion.button>
      </motion.div>

      {/* Demo Telemetry Drawer (shows what the nurse dashboard receives) */}
      {lastResult && (
        <div className="rounded-card bg-surface p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-ink">
              🩺 Staff Telemetry Captured ({lastResult.game === 'firefly_tap' ? 'Firefly Tap' : 'Cyber Circuit'})
            </span>
            <button
              type="button"
              onClick={() => setShowTelemetry((s) => !s)}
              className="text-sm font-bold text-secondary underline"
            >
              {showTelemetry ? 'Hide details' : 'Show nurse metrics'}
            </button>
          </div>
          {showTelemetry && (
            <div className="mt-3 space-y-2 text-xs text-ink-muted">
              {lastResult.observations.length > 0 ? (
                <ul className="list-disc pl-5 font-bold text-ink">
                  {lastResult.observations.map((obs, i) => (
                    <li key={i}>{obs}</li>
                  ))}
                </ul>
              ) : (
                <p className="font-semibold text-success">
                  No asymmetry, slowing, or tremor flags observed in this round.
                </p>
              )}
              <pre className="overflow-x-auto rounded-card bg-bg p-3 font-mono text-xs text-ink">
                {JSON.stringify(lastResult.summary, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default WaitingHub;
