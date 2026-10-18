import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BLINKING_POSES, type RalphPose } from '../art';

const EYES_OPEN = '/ralph/ralph-eyes-open.png';
const EYES_CLOSED = '/ralph/ralph-eyes-closed.png';
const TAIL_WAG = '/ralph/ralph-tail-wag.png';

const ASSESSMENT_SEQUENCE = [
  { frame: 'open', duration: 420 },
  { frame: 'wag', duration: 420 },
  { frame: 'open', duration: 420 },
  { frame: 'wag', duration: 420 },
  { frame: 'blink', duration: 120 },
] as const;

type AssessmentFrame = (typeof ASSESSMENT_SEQUENCE)[number]['frame'];

interface RalphProps {
  pose?: RalphPose;
  /** Tailwind size classes for the square box, e.g. "size-64". */
  className?: string;
}

export function Ralph({ pose = 'idle', className = 'size-64' }: RalphProps) {
  const [blinking, setBlinking] = useState(false);
  const [animationFrame, setAnimationFrame] = useState<AssessmentFrame>('open');
  // The welcome screen uses the wave pose; listen/think are used during assessment.
  const wagging = pose === 'wave' || pose === 'listen' || pose === 'think';

  // Blink for ~120 ms every 3–5 s.
  useEffect(() => {
    if (wagging || !BLINKING_POSES.includes(pose)) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlinking(true);
        timer = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 120);
      }, 3000 + Math.random() * 2000);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      setBlinking(false);
    };
  }, [pose, wagging]);

  // On the title screen and during assessment, repeat open → wag → open → wag → blink.
  useEffect(() => {
    if (!wagging) {
      setAnimationFrame('open');
      return;
    }

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => {
      const step = ASSESSMENT_SEQUENCE[index]!;
      setAnimationFrame(step.frame);
      index = (index + 1) % ASSESSMENT_SEQUENCE.length;
      timer = setTimeout(advance, step.duration);
    };
    advance();
    return () => clearTimeout(timer);
  }, [wagging]);

  const eyesAreClosed = pose === 'sleep' || (wagging ? animationFrame === 'blink' : blinking);
  const showOpenFrame = !eyesAreClosed && (!wagging || animationFrame === 'open');
  const showTailWagFrame = !eyesAreClosed && wagging && animationFrame === 'wag';

  return (
    <motion.div
      className={`relative select-none ${className}`}
      animate={{ y: pose === 'sleep' ? [0, 4, 0] : [0, -10, 0] }}
      transition={{ duration: pose === 'sleep' ? 4 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
      role="img"
      aria-label="Ralph the raccoon"
    >
      <motion.img
        src={EYES_OPEN}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        animate={{ opacity: showOpenFrame ? 1 : 0 }}
        transition={{ duration: 0.1 }}
      />
      <motion.img
        src={TAIL_WAG}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        animate={{ opacity: showTailWagFrame ? 1 : 0 }}
        transition={{ duration: 0.1 }}
      />
      <motion.img
        src={EYES_CLOSED}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        animate={{ opacity: eyesAreClosed ? 1 : 0 }}
        transition={{ duration: 0.04 }}
      />
    </motion.div>
  );
}
