import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import {
  BLINKING_POSES,
  POSE_FRAME,
  SEPARATE_TAIL,
  TAIL_MOTION,
  TAIL_PIVOT,
  TALK_FRAMES,
  artUrl,
  resolveArt,
  subscribeArt,
  type RalphFrame,
  type RalphPose,
} from '../art';

interface RalphProps {
  pose?: RalphPose;
  /** Tailwind size classes for the square box, e.g. "size-64". */
  className?: string;
}

let artVersion = 0;
const subscribe = (cb: () => void) =>
  subscribeArt(() => {
    artVersion++;
    cb();
  });

export function Ralph({ pose = 'idle', className = 'size-64' }: RalphProps) {
  useSyncExternalStore(subscribe, () => artVersion);
  useEffect(resolveArt, []);

  const [blinking, setBlinking] = useState(false);
  const [talkIndex, setTalkIndex] = useState(0);

  // Blink for ~120 ms every 3–5 s.
  useEffect(() => {
    if (!BLINKING_POSES.includes(pose)) return;
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
  }, [pose]);

  // Simple lip flap while talking. TODO(Tier 3): drive by audio volume.
  useEffect(() => {
    if (pose !== 'talk') return;
    const id = setInterval(() => setTalkIndex((i) => (i + 1) % TALK_FRAMES.length), 130);
    return () => clearInterval(id);
  }, [pose]);

  const frame: RalphFrame =
    pose === 'talk'
      ? TALK_FRAMES[talkIndex]!
      : blinking
        ? 'ralph-blink'
        : POSE_FRAME[pose];
  const tail = TAIL_MOTION[pose];

  return (
    <motion.div
      className={`relative select-none ${className}`}
      animate={{ y: pose === 'sleep' ? [0, 4, 0] : [0, -10, 0] }}
      transition={{ duration: pose === 'sleep' ? 4 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
      role="img"
      aria-label="Ralph the raccoon"
    >
      {SEPARATE_TAIL && (
        <motion.img
          src={artUrl('ralph-tail')}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain"
          style={{ transformOrigin: TAIL_PIVOT }}
          animate={{ rotate: tail.rotate }}
          transition={{ duration: tail.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <img
        src={artUrl(frame)}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
    </motion.div>
  );
}
