import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@ralph/shared';
import { Ralph } from '../components/Ralph';
import { CheckinPrompt } from '../components/CheckinPrompt';
import { FireflyTap } from '../games/GameOne';
import { CyberCircuit } from '../games/GameTwo';
import { Companion } from './Companion';

/**
 * Waiting-room hub: age-appropriate games ("Firefly Tap" for younger kids, "Cyber Circuit"
 * for older ones) or a chat with Ralph, while the child waits to be called in.
 *
 * Check-ins: the server decides when one is due (`nextCheckinAt`, from CHECKIN_INTERVAL_SEC).
 * Ralph asks at a natural break — straight away on this screen, at the end of a game round,
 * or between chat messages — never mid-game. The child answers by tap (CheckinPrompt).
 */

interface WaitingHubProps {
  visitId?: string;
  initialName?: string;
  initialAge?: number;
  language?: Lang;
  /** ISO time the next check-in is due (from GET /visits/:id/status); null = none yet. */
  nextCheckinAt?: string | null;
  /** A check-in was saved — refresh status so the server schedules the next one. */
  onCheckinSaved?: () => void;
}

type ActiveTab = 'hub' | 'firefly_tap' | 'cyber_circuit' | 'companion';

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function WaitingHub({
  visitId = 'demo',
  initialName = 'Maya',
  initialAge = 7,
  language = 'en',
  nextCheckinAt = null,
  onCheckinSaved,
}: WaitingHubProps) {
  const { t } = useTranslation();
  const name = initialName;
  const age = initialAge;
  const [tab, setTab] = useState<ActiveTab>('hub');
  const [starsEarned, setStarsEarned] = useState(0);

  // ---- check-ins at natural breaks ----
  const now = useNow(1000);
  const [roundOver, setRoundOver] = useState(false); // a game round just finished
  const [chatIdle, setChatIdle] = useState(false); // Ralph isn't mid-sentence in chat
  const [forced, setForced] = useState(false); // child said they feel worse in chat
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);

  const due = nextCheckinAt !== null && nextCheckinAt !== answeredFor && now >= Date.parse(nextCheckinAt);
  const atBreak = tab === 'hub' || (tab === 'companion' ? chatIdle : roundOver);
  const showCheckin = forced || (due && atBreak);

  const checkinDone = () => {
    setForced(false);
    setRoundOver(false);
    setAnsweredFor(nextCheckinAt);
    onCheckinSaved?.();
  };

  const openTab = (next: ActiveTab) => {
    setRoundOver(false);
    setTab(next);
  };

  let content: React.ReactNode;
  if (tab === 'firefly_tap') {
    content = (
      <FireflyTap
        ageYears={age}
        onRoundStart={() => setRoundOver(false)}
        onRoundEnd={() => (setRoundOver(true), setStarsEarned((s) => s + 1))}
        onExit={() => openTab('hub')}
      />
    );
  } else if (tab === 'cyber_circuit') {
    content = (
      <CyberCircuit
        onRoundStart={() => setRoundOver(false)}
        onRoundEnd={() => (setRoundOver(true), setStarsEarned((s) => s + 1))}
        onExit={() => openTab('hub')}
      />
    );
  } else if (tab === 'companion') {
    content = (
      <Companion
        visitId={visitId}
        firstName={name}
        ageYears={age}
        language={language}
        onIdleChange={setChatIdle}
        onRequestCheckin={() => setForced(true)}
        onSwitchToGames={() => openTab('hub')}
      />
    );
  } else {
    content = renderHub();
  }

  return (
    <>
      {content}
      {showCheckin && <CheckinPrompt visitId={visitId} lang={language} onDone={checkinDone} />}
    </>
  );

  // A render function, not a component: the 1-second clock must not remount the hub.
  function renderHub() {
    const isTeen = age >= 10;
    const setTabFromCard = openTab;
    return (
      <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-between gap-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-card border-2 border-accent/40 bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-4">
            <Ralph pose={starsEarned > 0 ? 'celebrate' : 'wave'} className="size-24 sm:size-28" />
            <div>
              <span className="rounded-pill bg-accent/35 px-3 py-0.5 text-xs font-extrabold text-ink">
                ⭐ {t('waiting.stars', { count: starsEarned })}
              </span>
              <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
                {t('waiting.title', { name })}
              </h1>
              <p className="text-base font-semibold text-ink-muted">{t('waiting.subtitle')}</p>
            </div>
          </div>
        </header>

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
            onClick={() => setTabFromCard('firefly_tap')}
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
                <span className="text-cyber-node">1</span>
                <span className="text-cyber-alt">2</span>
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
                'Connect the nodes to boot up the system, then switch colours as you count to break the firewall and earn a hacker badge!',
              )}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setTabFromCard('cyber_circuit')}
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
                'Just chat with Ralph about your favourite things, or rest. Ralph will check on you every so often.',
              )}
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setTabFromCard('companion')}
          className="min-h-16 shrink-0 rounded-pill bg-secondary px-8 text-xl font-extrabold text-on-secondary shadow-soft"
        >
          {t('waiting.talkWithRalph', 'Talk with Ralph 🦝')}
        </motion.button>
      </motion.div>
      </section>
    );
  }
}

export default WaitingHub;
