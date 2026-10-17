import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Ralph } from './Ralph';
import type { RalphPose } from '../art';
import { speak } from '../../lib/speech';
import { playCelebrationFanfare } from '../../lib/sfx';

export interface CelebrationStat {
  label: string;
  value: string;
  icon?: string;
}

interface RalphCelebrationProps {
  /** Main congratulatory headline */
  title: string;
  /** Warm spoken line from Ralph */
  speechText: string;
  /** Optional subtitle / next-step hint */
  subtitle?: string;
  /** Fun stats / badges earned in this stage */
  stats?: CelebrationStat[];
  /** Primary button label to advance to the next stage */
  nextLabel: string;
  onNext: () => void;
  /** Optional secondary action (e.g. skip optional stage or play again) */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Visual theme ('kid' warm storybook vs 'cyber' neon hacker) */
  variant?: 'kid' | 'cyber';
  lang?: string;
}

const CONFETTI = [
  { x: 10, delay: 0, emoji: '✨' },
  { x: 22, delay: 0.15, emoji: '🌟' },
  { x: 35, delay: 0.05, emoji: '🎉' },
  { x: 50, delay: 0.22, emoji: '⭐' },
  { x: 66, delay: 0.08, emoji: '🎊' },
  { x: 78, delay: 0.18, emoji: '✨' },
  { x: 90, delay: 0.1, emoji: '🌟' },
];

export function RalphCelebration({
  title,
  speechText,
  subtitle,
  stats = [],
  nextLabel,
  onNext,
  secondaryLabel,
  onSecondary,
  variant = 'kid',
  lang = 'en',
}: RalphCelebrationProps) {
  const [pose, setPose] = useState<RalphPose>('talk');
  const cyber = variant === 'cyber';

  useEffect(() => {
    playCelebrationFanfare();
    setPose('talk');
    const cancel = speak(speechText, lang, () => {
      setPose('celebrate');
    });
    return cancel;
  }, [lang, speechText]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className={`relative my-auto flex w-full flex-col items-center gap-5 overflow-hidden rounded-card p-6 text-center shadow-soft sm:p-8 ${
        cyber
          ? 'border-2 border-cyber-ok bg-cyber-panel text-cyber-text'
          : 'border-2 border-accent/60 bg-surface text-ink'
      }`}
    >
      {/* Floating celebratory sparkles */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-around">
        {CONFETTI.map((c, idx) => (
          <motion.span
            key={idx}
            initial={{ y: 24, opacity: 0, scale: 0.4 }}
            animate={{ y: [0, -10, 0], opacity: 1, scale: [1, 1.2, 1] }}
            transition={{
              delay: c.delay,
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="text-2xl sm:text-3xl"
            aria-hidden
          >
            {c.emoji}
          </motion.span>
        ))}
      </div>

      {/* Ralph bouncing onto the screen */}
      <motion.div
        initial={{ y: 40, scale: 0.75 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 16 }}
        className="mt-2"
      >
        <Ralph pose={pose} className="size-48 sm:size-56" />
      </motion.div>

      {/* Headline */}
      <div className="space-y-2">
        <span
          className={`inline-block rounded-pill px-4 py-1 text-xs font-extrabold tracking-widest uppercase ${
            cyber ? 'bg-cyber-ok/20 text-cyber-ok' : 'bg-accent/30 text-ink'
          }`}
        >
          🎉 RALPH SAYS WAY TO GO!
        </span>
        <h2 className="text-3xl font-extrabold sm:text-4xl">{title}</h2>
      </div>

      {/* Speech bubble from Ralph */}
      <div
        className={`relative max-w-lg rounded-card px-6 py-4 text-xl font-bold shadow-soft ${
          cyber
            ? 'border border-cyber-node/50 bg-cyber-bg text-cyber-text'
            : 'border-2 border-primary/20 bg-bg text-ink'
        }`}
      >
        “{speechText}”
      </div>

      {/* Fun stage stats / badges */}
      {stats.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {stats.map((s, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-card px-4 py-2.5 text-left shadow-soft ${
                cyber
                  ? 'border border-cyber-grid bg-cyber-bg'
                  : 'border border-accent/40 bg-bg'
              }`}
            >
              {s.icon && <span className="text-2xl">{s.icon}</span>}
              <div>
                <p
                  className={`text-xs font-bold uppercase ${
                    cyber ? 'text-cyber-muted' : 'text-ink-muted'
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-lg font-extrabold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {subtitle && (
        <p className={`max-w-md text-base font-semibold ${cyber ? 'text-cyber-muted' : 'text-ink-muted'}`}>
          {subtitle}
        </p>
      )}

      {/* Action buttons to advance to the next stage */}
      <div className="mt-1 flex flex-wrap justify-center gap-4">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          onClick={onNext}
          className={`min-h-16 rounded-pill px-10 text-2xl font-extrabold shadow-soft ${
            cyber
              ? 'bg-cyber-ok text-cyber-bg'
              : 'bg-primary text-on-primary'
          }`}
        >
          {nextLabel} ➔
        </motion.button>

        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className={`min-h-16 rounded-pill px-6 text-lg font-bold ${
              cyber
                ? 'border border-cyber-grid bg-cyber-bg text-cyber-muted'
                : 'bg-bg text-ink-muted'
            }`}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}
