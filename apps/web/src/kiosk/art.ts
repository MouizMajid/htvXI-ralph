/**
 * Single source of truth for Ralph's art.
 *
 * Artists: drop `<name>.png` (1024×1024, transparent, same character position in
 * every frame) into apps/web/public/ralph/. It replaces the `.svg` placeholder
 * automatically — no code change. Check the result at /art.
 */

export const RALPH_FRAMES = [
  'ralph-idle',
  'ralph-blink',
  'ralph-talk-1',
  'ralph-talk-2',
  'ralph-talk-3',
  'ralph-listen',
  'ralph-think',
  'ralph-happy',
  'ralph-gentle',
  'ralph-wave',
  'ralph-celebrate',
  'ralph-sleep',
  'ralph-tail',
] as const;
export type RalphFrame = (typeof RALPH_FRAMES)[number];

/** Poses screens ask for. Blink + talk frames are handled inside <Ralph>. */
export type RalphPose =
  | 'idle'
  | 'talk'
  | 'listen'
  | 'think'
  | 'happy'
  | 'gentle'
  | 'wave'
  | 'celebrate'
  | 'sleep';

export const POSE_FRAME: Record<Exclude<RalphPose, 'talk'>, RalphFrame> = {
  idle: 'ralph-idle',
  listen: 'ralph-listen',
  think: 'ralph-think',
  happy: 'ralph-happy',
  gentle: 'ralph-gentle',
  wave: 'ralph-wave',
  celebrate: 'ralph-celebrate',
  sleep: 'ralph-sleep',
};
export const TALK_FRAMES: RalphFrame[] = ['ralph-talk-1', 'ralph-talk-2', 'ralph-talk-3'];

/** Poses that blink. */
export const BLINKING_POSES: RalphPose[] = ['idle', 'listen', 'think', 'gentle'];

/**
 * Tail motion per pose (Framer Motion rotate, degrees, around the tail base).
 * Set SEPARATE_TAIL = false if the artists draw the tail into each body frame instead.
 */
export const SEPARATE_TAIL = true;
export const TAIL_PIVOT = '33% 77%'; // ≈ (338, 788) on the 1024 canvas (left-side fluffy tail)
export const TAIL_MOTION: Record<RalphPose, { rotate: number[]; duration: number }> = {
  idle: { rotate: [-4, 4, -4], duration: 3 },
  talk: { rotate: [-5, 5, -5], duration: 1.8 },
  listen: { rotate: [-2, 2, -2], duration: 3 },
  think: { rotate: [-2, 2, -2], duration: 4 },
  happy: { rotate: [-12, 12, -12], duration: 0.5 },
  celebrate: { rotate: [-16, 16, -16], duration: 0.4 },
  wave: { rotate: [-9, 9, -9], duration: 0.9 },
  gentle: { rotate: [-6, -2, -6], duration: 4 },
  sleep: { rotate: [-8, -6, -8], duration: 4 },
};

// ---- PNG-if-present, else SVG placeholder ----

const resolved = new Map<RalphFrame, string>();
const listeners = new Set<() => void>();
let started = false;

/** Probe every frame once: use the .png if it loads, else the .svg placeholder. */
export function resolveArt() {
  if (started) return;
  started = true;
  for (const name of RALPH_FRAMES) {
    resolved.set(name, `/ralph/${name}.svg`);
    const img = new Image();
    img.onload = () => {
      resolved.set(name, `/ralph/${name}.png`);
      listeners.forEach((l) => l());
    };
    img.src = `/ralph/${name}.png`;
    // Preload the placeholder too so frame swaps never flicker.
    new Image().src = `/ralph/${name}.svg`;
  }
}

export function artUrl(name: RalphFrame): string {
  return resolved.get(name) ?? `/ralph/${name}.svg`;
}

export function isPlaceholder(name: RalphFrame): boolean {
  return artUrl(name).endsWith('.svg');
}

export function subscribeArt(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
