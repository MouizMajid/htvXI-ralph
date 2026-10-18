import { useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Ralph } from '../components/Ralph';
import { speak } from '../../lib/speech';

export function Welcome({
  onStart,
  onSkipToWaiting,
}: {
  onStart: () => void;
  onSkipToWaiting?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const greeting = t('welcome.greeting');
  const sayHello = useCallback(() => speak(greeting, i18n.language, () => {}), [greeting, i18n.language]);

  // Ralph says hello when this screen appears. Browsers don't allow sound before the first touch
  // on a freshly loaded page, so then he says it on that first touch (unless it's "Let's go").
  useEffect(() => {
    if (navigator.userActivation?.hasBeenActive ?? true) return sayHello();
    let cancel: (() => void) | undefined;
    const onFirstTouch = (e: PointerEvent) => {
      window.removeEventListener('pointerdown', onFirstTouch);
      if (!(e.target as Element).closest('[data-start]')) cancel = sayHello();
    };
    window.addEventListener('pointerdown', onFirstTouch);
    return () => {
      window.removeEventListener('pointerdown', onFirstTouch);
      cancel?.();
    };
  }, [sayHello]);

  return (
    <section className="relative mx-auto flex min-h-full max-w-7xl flex-col items-center justify-center gap-7 overflow-hidden p-6 text-center">
      {/* Soft decorative background sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70" aria-hidden>
        <span className="absolute top-10 left-10 text-3xl">✨</span>
        <span className="absolute top-16 right-14 text-2xl">🌟</span>
        <span className="absolute bottom-20 left-16 text-2xl">⭐</span>
        <span className="absolute right-12 bottom-24 text-3xl">💛</span>
      </div>

      {/* Hand-painted RALPH title */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center"
      >
        <img
          src="/ralph-title.png"
          alt="RALPH"
          className="w-[clamp(14rem,60vw,64rem)] object-contain"
        />
        <img
          src="/waitingroombuddy.png"
          alt="Your waiting room buddy!"
          className="-mt-[clamp(3rem,13vw,13rem)] w-[min(60vw,40rem)] object-contain"
        />
      </motion.div>

      <div className="-mt-8 flex w-full max-w-2xl items-center justify-start gap-0">
        {/* Hand-painted welcome speech bubble on the left */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="relative z-10 w-[38%]"
        >
          <img
            src="/speechbubble.png"
            alt="Hi, I'm Ralph! Can you help me learn how you're feeling?"
            className="w-full object-contain"
          />
        </motion.div>

        {/* Hand-drawn Ralph waving on the right */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="-ml-[9%] w-[70%] shrink-0"
        >
          {/* Tap Ralph to hear his hello again. */}
          <button type="button" onClick={sayHello} aria-label={t('talk.replay')} className="w-full">
            <Ralph pose="wave" className="aspect-square w-full" />
          </button>
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          data-start
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
