import type { Reason } from '../types';

/**
 * Game metrics — pure, deterministic, unit-tested (games/metrics.test.ts).
 *
 * Team-defined DEMO thresholds, NOT clinically validated. These are
 * "engagement and alertness trends" for the care team, never a diagnosis.
 * The LLM never touches any of this.
 */

export type Hand = 'dominant' | 'non_dominant';
export type Handedness = 'left' | 'right' | 'unknown';

/** Thresholds live in one place so the team can tune them. */
export const GAME_THRESHOLDS = {
  /** Slower hand vs faster hand. Kids' non-dominant hand is normally ~10–20% slower. */
  HAND_ASYMMETRY_NOTE_PCT: 35,
  /** Reaction slowing vs the child's own first round (triage-engine skill table). */
  SLOWING_WATCH_PCT: 30,
  SLOWING_ESCALATE_PCT: 50,
  /** Hit-rate / accuracy drop vs baseline (relative). */
  ACCURACY_DROP_PCT: 25,
  /** Last third of a round vs first third (within-round fatigue). */
  FATIGUE_NOTE_PCT: 40,
  /** Jitter below this RMS (px) is digitizer noise. */
  JITTER_NOISE_FLOOR_PX: 0.6,
  /** Cyber Circuit: part B / part A time ratio worth showing the nurse. */
  TRAIL_RATIO_NOTE: 3,
} as const;

// ---------------------------------------------------------------- stats

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function stdDev(xs: readonly number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

/** % change from `base` to `value` (positive = bigger). */
export function pctChange(base: number, value: number): number {
  return base === 0 ? 0 : ((value - base) / base) * 100;
}

// ---------------------------------------------------------------- Firefly Tap

export interface TapTarget {
  /** ms since round start when the firefly appeared */
  shownAtMs: number;
  /** reaction time in ms, or null if the firefly flew away (miss) */
  reactionMs: number | null;
  /** distance of the tap from the firefly centre, px */
  accuracyPx: number | null;
}

export interface TapRoundSummary {
  hand: Hand;
  targets: number;
  hits: number;
  misses: number;
  strayTaps: number;
  hitRate: number;
  meanReactionMs: number | null;
  medianReactionMs: number | null;
  sdReactionMs: number | null;
  /** median of last third vs first third; positive = slowed down during the round */
  fatigueSlowingPct: number | null;
  meanAccuracyPx: number | null;
}

export function summarizeTapRound(
  targets: readonly TapTarget[],
  strayTaps: number,
  hand: Hand,
): TapRoundSummary {
  const hitsArr = targets.filter((t) => t.reactionMs !== null);
  const rts = hitsArr.map((t) => t.reactionMs!);
  const acc = hitsArr.filter((t) => t.accuracyPx !== null).map((t) => t.accuracyPx!);

  let fatigue: number | null = null;
  if (rts.length >= 6) {
    const third = Math.floor(rts.length / 3);
    const first = median(rts.slice(0, third));
    const last = median(rts.slice(-third));
    if (first !== null && last !== null) fatigue = round1(pctChange(first, last));
  }

  return {
    hand,
    targets: targets.length,
    hits: hitsArr.length,
    misses: targets.length - hitsArr.length,
    strayTaps,
    hitRate: targets.length ? Math.round((hitsArr.length / targets.length) * 1000) / 1000 : 0,
    meanReactionMs: round1(mean(rts)),
    medianReactionMs: round1(median(rts)),
    sdReactionMs: round1(stdDev(rts)),
    fatigueSlowingPct: fatigue,
    meanAccuracyPx: round1(mean(acc)),
  };
}

// ---------------------------------------------------------------- hands

export interface HandComparison {
  dominantMs: number;
  nonDominantMs: number;
  /** how much slower the slower hand is than the faster one, % (always ≥ 0) */
  asymmetryPct: number;
  slowerHand: Hand;
  /** non-dominant being slower is expected; dominant being slower is unusual */
  unexpectedSide: boolean;
  noteworthy: boolean;
}

/** Compare median speed (ms per action) of each hand. */
export function compareHands(dominantMs: number | null, nonDominantMs: number | null): HandComparison | null {
  if (!dominantMs || !nonDominantMs) return null;
  const slowerHand: Hand = nonDominantMs >= dominantMs ? 'non_dominant' : 'dominant';
  const fast = Math.min(dominantMs, nonDominantMs);
  const slow = Math.max(dominantMs, nonDominantMs);
  const asymmetryPct = Math.round(pctChange(fast, slow) * 10) / 10;
  const unexpectedSide = slowerHand === 'dominant';
  return {
    dominantMs,
    nonDominantMs,
    asymmetryPct,
    slowerHand,
    unexpectedSide,
    // Dominant hand clearly slower is noteworthy at a lower bar.
    noteworthy: asymmetryPct >= (unexpectedSide ? 20 : GAME_THRESHOLDS.HAND_ASYMMETRY_NOTE_PCT),
  };
}

// ---------------------------------------------------------------- jitter / tremor proxy

export interface PointerSample {
  /** ms */
  t: number;
  /** CSS px */
  x: number;
  y: number;
}

export type JitterPattern = 'none' | 'fine_fast' | 'slow_wide' | 'mixed' | 'insufficient_data';

export interface JitterAnalysis {
  samples: number;
  durationMs: number;
  /** RMS of the high-pass residual, px */
  rmsPx: number;
  /** dominant oscillation frequency estimate, Hz */
  freqHz: number;
  pattern: JitterPattern;
}

/**
 * Tremor PROXY from finger-drag samples.
 *
 * 1. Remove the intended movement with a centred moving average (~300 ms
 *    window ⇒ keeps oscillations above ~3 Hz).
 * 2. RMS of the residual = jitter amplitude.
 * 3. Zero-crossing rate of the residual on its dominant axis = frequency.
 *
 * Pattern buckets (demo heuristics, not diagnosis):
 *  - fine_fast:  ≥ 8 Hz, small amplitude  (physiological-like jitter)
 *  - slow_wide:  3–7 Hz, larger amplitude (slow-oscillation-like)
 * NB: a true resting tremor shows at rest; this only sees the finger while it moves.
 */
export function analyzeJitter(samples: readonly PointerSample[], windowMs = 300): JitterAnalysis {
  const n = samples.length;
  const durationMs = n > 1 ? samples[n - 1]!.t - samples[0]!.t : 0;
  const empty: JitterAnalysis = {
    samples: n,
    durationMs,
    rmsPx: 0,
    freqHz: 0,
    pattern: 'insufficient_data',
  };
  if (n < 30 || durationMs < 500) return empty;

  const half = windowMs / 2;
  const rx: number[] = [];
  const ry: number[] = [];
  let lo = 0;
  let hi = 0;
  let sx = 0;
  let sy = 0;
  // Sliding window over (possibly irregular) timestamps.
  for (let i = 0; i < n; i++) {
    const t = samples[i]!.t;
    while (hi < n && samples[hi]!.t <= t + half) {
      sx += samples[hi]!.x;
      sy += samples[hi]!.y;
      hi++;
    }
    while (samples[lo]!.t < t - half) {
      sx -= samples[lo]!.x;
      sy -= samples[lo]!.y;
      lo++;
    }
    const count = hi - lo;
    rx.push(samples[i]!.x - sx / count);
    ry.push(samples[i]!.y - sy / count);
  }

  // Ignore the edges where the window is truncated.
  const edge = samples.findIndex((s) => s.t >= samples[0]!.t + half);
  const start = Math.max(edge, 0);
  let endIdx = n - 1;
  while (endIdx > start && samples[endIdx]!.t > samples[n - 1]!.t - half) endIdx--;
  const ex = rx.slice(start, endIdx + 1);
  const ey = ry.slice(start, endIdx + 1);
  if (ex.length < 15) return empty;

  const rms = Math.sqrt(ex.reduce((a, v, i) => a + v * v + ey[i]! * ey[i]!, 0) / ex.length);
  const varX = ex.reduce((a, v) => a + v * v, 0);
  const varY = ey.reduce((a, v) => a + v * v, 0);
  const axis = varX >= varY ? ex : ey;

  // Zero crossings with a dead-band so digitizer noise doesn't count.
  const dead = GAME_THRESHOLDS.JITTER_NOISE_FLOOR_PX / 2;
  let crossings = 0;
  let sign = 0;
  for (const v of axis) {
    if (Math.abs(v) < dead) continue;
    const s = v > 0 ? 1 : -1;
    if (sign !== 0 && s !== sign) crossings++;
    sign = s;
  }
  const spanMs = samples[endIdx]!.t - samples[start]!.t;
  const freqHz = spanMs > 0 ? crossings / 2 / (spanMs / 1000) : 0;

  return {
    samples: n,
    durationMs: Math.round(durationMs),
    rmsPx: Math.round(rms * 100) / 100,
    freqHz: Math.round(freqHz * 10) / 10,
    pattern: classifyJitter(rms, freqHz),
  };
}

export function classifyJitter(rmsPx: number, freqHz: number): JitterPattern {
  if (rmsPx < GAME_THRESHOLDS.JITTER_NOISE_FLOOR_PX) return 'none';
  if (freqHz >= 8 && rmsPx < 3) return 'fine_fast';
  if (freqHz >= 3 && freqHz < 8 && rmsPx >= 1.5) return 'slow_wide';
  return 'mixed';
}

/**
 * Jitter over a trail-making drag: sharp turns at each node would read as
 * "oscillation", so drop samples within `guardMs` of each cut time (node hits)
 * and of pen-lifts, analyse each straight segment, and sample-weight the results.
 */
export function analyzeSegmentedJitter(
  samples: readonly PointerSample[],
  cutTimes: readonly number[],
  guardMs = 200,
  maxGapMs = 100,
): JitterAnalysis {
  const segments: PointerSample[][] = [];
  let cur: PointerSample[] = [];
  const nearCut = (t: number) => cutTimes.some((c) => Math.abs(c - t) < guardMs);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const prev = samples[i - 1];
    if (nearCut(s.t) || (prev && s.t - prev.t > maxGapMs)) {
      if (cur.length) segments.push(cur);
      cur = [];
      if (nearCut(s.t)) continue;
    }
    cur.push(s);
  }
  if (cur.length) segments.push(cur);

  const parts = segments.map((seg) => analyzeJitter(seg)).filter((j) => j.pattern !== 'insufficient_data');
  const total = parts.reduce((a, p) => a + p.samples, 0);
  const durationMs = samples.length > 1 ? samples[samples.length - 1]!.t - samples[0]!.t : 0;
  if (!parts.length || total === 0) {
    return { samples: samples.length, durationMs: Math.round(durationMs), rmsPx: 0, freqHz: 0, pattern: 'insufficient_data' };
  }
  const rms = parts.reduce((a, p) => a + p.rmsPx * p.samples, 0) / total;
  const freq = parts.reduce((a, p) => a + p.freqHz * p.samples, 0) / total;
  return {
    samples: total,
    durationMs: Math.round(durationMs),
    rmsPx: Math.round(rms * 100) / 100,
    freqHz: Math.round(freq * 10) / 10,
    pattern: classifyJitter(rms, freq),
  };
}

// ---------------------------------------------------------------- Cyber Circuit (trail making)

export type TrailPhase = 'warmup' | 'offhand' | 'bypass';

/** 1 … n */
export function numberSequence(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

/** 1, A, 2, B, … 12, L, 13 (25 nodes for n = 13). */
export function alternatingSequence(numbers = 13): string[] {
  const out: string[] = [];
  for (let i = 1; i <= numbers; i++) {
    out.push(String(i));
    if (i < numbers) out.push(String.fromCharCode(64 + i)); // A=65
  }
  return out;
}

export interface TrailLink {
  to: string;
  /** ms since the previous correct node */
  ms: number;
}

export interface TrailPhaseResult {
  phase: TrailPhase;
  hand: Hand;
  nodes: number;
  completed: boolean;
  timedOut: boolean;
  /** first node touch → last node (or time-out) */
  totalMs: number;
  errors: number;
  links: TrailLink[];
}

export interface TrailPhaseSummary {
  phase: TrailPhase;
  hand: Hand;
  completed: boolean;
  timedOut: boolean;
  totalMs: number;
  errors: number;
  linksDone: number;
  medianLinkMs: number | null;
}

export function summarizeTrailPhase(r: TrailPhaseResult): TrailPhaseSummary {
  return {
    phase: r.phase,
    hand: r.hand,
    completed: r.completed,
    timedOut: r.timedOut,
    totalMs: Math.round(r.totalMs),
    errors: r.errors,
    linksDone: r.links.length,
    medianLinkMs: round1(median(r.links.map((l) => l.ms))),
  };
}

/**
 * Classic TMT B/A ratio. Warm-up and bypass both have 25 nodes, so totals compare
 * directly. If bypass timed out, we extrapolate from per-link speed so the
 * number stays meaningful (flagged by `bypassTimedOut`).
 */
export function trailRatio(warmup: TrailPhaseSummary, bypass: TrailPhaseSummary): number | null {
  if (!warmup.completed || warmup.totalMs <= 0) return null;
  let bMs = bypass.totalMs;
  if (!bypass.completed) {
    if (!bypass.linksDone || !bypass.medianLinkMs) return null;
    bMs = bypass.medianLinkMs * 24;
  }
  return Math.round((bMs / warmup.totalMs) * 100) / 100;
}

// ---------------------------------------------------------------- layout

/** Deterministic PRNG for tests (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NodePos {
  x: number;
  y: number;
}

/**
 * Scatter `count` nodes in a 0–100 square with a margin, keeping them at least
 * `minDist` apart. Relaxes the distance if the board gets crowded.
 */
export function layoutNodes(count: number, rng: () => number = Math.random, minDist = 15, margin = 8): NodePos[] {
  let dist = minDist;
  for (let attempt = 0; attempt < 40; attempt++) {
    const pts: NodePos[] = [];
    let tries = 0;
    while (pts.length < count && tries < count * 300) {
      tries++;
      const p = { x: margin + rng() * (100 - 2 * margin), y: margin + rng() * (100 - 2 * margin) };
      if (pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= dist)) pts.push(p);
    }
    if (pts.length === count) return pts;
    dist *= 0.95;
  }
  // Fallback: jittered grid (always succeeds).
  const side = Math.ceil(Math.sqrt(count));
  const cell = (100 - 2 * margin) / side;
  return Array.from({ length: count }, (_, i) => ({
    x: margin + cell * ((i % side) + 0.3 + rng() * 0.4),
    y: margin + cell * (Math.floor(i / side) + 0.3 + rng() * 0.4),
  }));
}

// ---------------------------------------------------------------- reasons for staff

export interface RoundBaseline {
  medianReactionMs: number | null;
  hitRate: number | null;
}

/**
 * Deterioration points vs the child's own first round (triage-engine skill):
 *  reaction > 30% slower +2, > 50% slower +3 (replaces +2); accuracy drop > 25% +1.
 */
export function gameDeteriorationReasons(baseline: RoundBaseline, current: RoundBaseline): Reason[] {
  const reasons: Reason[] = [];
  if (baseline.medianReactionMs && current.medianReactionMs) {
    const slow = pctChange(baseline.medianReactionMs, current.medianReactionMs);
    if (slow > GAME_THRESHOLDS.SLOWING_ESCALATE_PCT) {
      reasons.push({ points: 3, alert: false, text: `Reaction time down ${Math.round(slow)}% vs first game` });
    } else if (slow > GAME_THRESHOLDS.SLOWING_WATCH_PCT) {
      reasons.push({ points: 2, alert: false, text: `Reaction time down ${Math.round(slow)}% vs first game` });
    }
  }
  if (baseline.hitRate && current.hitRate !== null) {
    const drop = -pctChange(baseline.hitRate, current.hitRate);
    if (drop > GAME_THRESHOLDS.ACCURACY_DROP_PCT) {
      reasons.push({ points: 1, alert: false, text: `Missing more targets (${Math.round(drop)}% fewer hits)` });
    }
  }
  return reasons;
}

/** Plain-language, zero-point observations for the nurse. Never shown to the child. */
export function motorObservations(input: {
  hands?: HandComparison | null;
  jitter?: JitterAnalysis | null;
  fatigueSlowingPct?: number | null;
  trailRatio?: number | null;
  bypassErrors?: number | null;
}): string[] {
  const out: string[] = [];
  const { hands, jitter, fatigueSlowingPct, trailRatio: ratio, bypassErrors } = input;
  if (hands?.noteworthy) {
    out.push(
      hands.unexpectedSide
        ? `Writing hand ${hands.asymmetryPct}% slower than the other hand (unusual side)`
        : `Other hand ${hands.asymmetryPct}% slower than writing hand`,
    );
  }
  if (jitter && (jitter.pattern === 'slow_wide' || jitter.pattern === 'fine_fast')) {
    const kind = jitter.pattern === 'slow_wide' ? 'slow, wider' : 'fast, fine';
    out.push(`Finger jitter while dragging: ${kind} (~${jitter.freqHz} Hz, ${jitter.rmsPx}px)`);
  }
  if (fatigueSlowingPct !== null && fatigueSlowingPct !== undefined && fatigueSlowingPct >= GAME_THRESHOLDS.FATIGUE_NOTE_PCT) {
    out.push(`Slowed down ${Math.round(fatigueSlowingPct)}% by the end of the round`);
  }
  if (ratio !== null && ratio !== undefined && ratio >= GAME_THRESHOLDS.TRAIL_RATIO_NOTE) {
    out.push(`Switching task took ${ratio}× longer than simple task`);
  }
  if (bypassErrors !== null && bypassErrors !== undefined && bypassErrors >= 3) {
    out.push(`${bypassErrors} sequence mistakes in the switching task`);
  }
  return out;
}

/** Two unanswered check-ins in a row → unresponsive alert (triage-engine skill). */
export function isUnresponsive(recentFeelingsNewestFirst: readonly string[]): boolean {
  return (
    recentFeelingsNewestFirst.length >= 2 &&
    recentFeelingsNewestFirst[0] === 'no_response' &&
    recentFeelingsNewestFirst[1] === 'no_response'
  );
}
