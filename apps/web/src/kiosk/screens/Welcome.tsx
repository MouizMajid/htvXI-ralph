import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Ralph } from '../components/Ralph';

export function Welcome({
  onStart,
  onSkipToWaiting,
}: {
  onStart: () => void;
  onSkipToWaiting?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="relative mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-7 overflow-hidden p-6 text-center">
      {/* Soft decorative background sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70" aria-hidden>
        <span className="absolute top-10 left-10 text-3xl">✨</span>
        <span className="absolute top-16 right-14 text-2xl">🌟</span>
        <span className="absolute bottom-20 left-16 text-2xl">⭐</span>
        <span className="absolute right-12 bottom-24 text-3xl">💛</span>
      </div>

      {/* Badge */}
      <motion.span
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-pill border-2 border-accent/60 bg-surface px-5 py-1.5 text-sm font-extrabold tracking-wide text-ink shadow-soft"
      >
        🩺 RALPH · YOUR WAITING-ROOM BUDDY
      </motion.span>

      {/* Hand-drawn Ralph waving */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      >
        <Ralph pose="wave" className="size-72 sm:size-84" />
      </motion.div>

      {/* Speech Bubble Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-lg rounded-card border-2 border-primary/20 bg-surface px-7 py-5 shadow-soft"
      >
        <h1 className="text-3xl leading-snug font-extrabold text-ink sm:text-4xl">
          “{t('welcome.greeting')}”
        </h1>
      </motion.div>

      <div className="flex flex-col items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="min-h-18 rounded-pill bg-primary px-14 text-2xl font-extrabold text-on-primary shadow-soft"
        >
          {t('welcome.start')} ✨
        </motion.button>

        {onSkipToWaiting && (
          <button
            type="button"
            onClick={onSkipToWaiting}
            className="rounded-pill bg-surface px-6 py-2 text-sm font-extrabold text-ink-muted shadow-soft hover:text-ink"
          >
            🎮 Jump straight to Waiting Room Games & Companion
          </button>
        )}
      </div>
    </section>
  );
}
