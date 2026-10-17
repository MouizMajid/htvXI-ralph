import { describe, expect, it } from 'vitest';
import {
  alternatingSequence,
  analyzeJitter,
  compareHands,
  gameDeteriorationReasons,
  isUnresponsive,
  layoutNodes,
  median,
  motorObservations,
  seededRng,
  summarizeTapRound,
  summarizeTrailPhase,
  trailRatio,
  type PointerSample,
  type TapTarget,
} from './metrics.js';

describe('stats', () => {
  it('median handles odd/even/empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('summarizeTapRound', () => {
  const t = (rt: number | null): TapTarget => ({ shownAtMs: 0, reactionMs: rt, accuracyPx: rt ? 10 : null });

  it('counts hits, misses, and hit rate', () => {
    const s = summarizeTapRound([t(400), t(500), t(null), t(600)], 2, 'dominant');
    expect(s.hits).toBe(3);
    expect(s.misses).toBe(1);
    expect(s.strayTaps).toBe(2);
    expect(s.hitRate).toBe(0.75);
    expect(s.medianReactionMs).toBe(500);
  });

  it('detects slowing within a round', () => {
    const s = summarizeTapRound([400, 400, 410, 500, 600, 700, 800, 800, 820].map(t), 0, 'dominant');
    expect(s.fatigueSlowingPct).toBeGreaterThan(90);
  });
});

describe('compareHands', () => {
  it('normal: non-dominant a bit slower, not noteworthy', () => {
    const c = compareHands(500, 560)!;
    expect(c.slowerHand).toBe('non_dominant');
    expect(c.noteworthy).toBe(false);
  });
  it('big gap is noteworthy', () => {
    expect(compareHands(500, 800)!.noteworthy).toBe(true);
  });
  it('dominant clearly slower is noteworthy at lower bar', () => {
    const c = compareHands(650, 500)!;
    expect(c.unexpectedSide).toBe(true);
    expect(c.noteworthy).toBe(true);
  });
  it('null-safe', () => {
    expect(compareHands(null, 500)).toBeNull();
  });
});

describe('analyzeJitter', () => {
  /** Straight drag at constant speed + optional sinusoidal wobble, sampled at 120 Hz. */
  const drag = (hz: number, ampPx: number, ms = 3000): PointerSample[] =>
    Array.from({ length: Math.floor((ms / 1000) * 120) }, (_, i) => {
      const t = (i / 120) * 1000;
      const wobble = ampPx * Math.sin((2 * Math.PI * hz * t) / 1000);
      return { t, x: t * 0.2, y: 200 + wobble };
    });

  it('insufficient data', () => {
    expect(analyzeJitter(drag(10, 1, 200)).pattern).toBe('insufficient_data');
  });
  it('smooth drag → none', () => {
    expect(analyzeJitter(drag(10, 0)).pattern).toBe('none');
  });
  it('fast fine wobble → fine_fast', () => {
    const j = analyzeJitter(drag(10, 1.2));
    expect(j.pattern).toBe('fine_fast');
    expect(j.freqHz).toBeGreaterThan(8);
    expect(j.freqHz).toBeLessThan(12);
  });
  it('slow wide wobble → slow_wide', () => {
    const j = analyzeJitter(drag(5, 4));
    expect(j.pattern).toBe('slow_wide');
    expect(j.freqHz).toBeGreaterThan(3.5);
    expect(j.freqHz).toBeLessThan(6.5);
  });
});

describe('trail making', () => {
  it('alternating sequence is 25 nodes 1,A,2,B…13', () => {
    const s = alternatingSequence();
    expect(s).toHaveLength(25);
    expect(s.slice(0, 4)).toEqual(['1', 'A', '2', 'B']);
    expect(s.at(-1)).toBe('13');
    expect(s.at(-2)).toBe('L');
  });

  it('B/A ratio, incl. extrapolation on timeout', () => {
    const a = summarizeTrailPhase({
      phase: 'warmup', hand: 'dominant', nodes: 25, completed: true, timedOut: false,
      totalMs: 20_000, errors: 0, links: [],
    });
    const b = summarizeTrailPhase({
      phase: 'bypass', hand: 'dominant', nodes: 25, completed: true, timedOut: false,
      totalMs: 50_000, errors: 1, links: [],
    });
    expect(trailRatio(a, b)).toBe(2.5);
    const bTimeout = summarizeTrailPhase({
      phase: 'bypass', hand: 'dominant', nodes: 25, completed: false, timedOut: true,
      totalMs: 90_000, errors: 4, links: Array.from({ length: 10 }, () => ({ to: 'x', ms: 5000 })),
    });
    expect(trailRatio(a, bTimeout)).toBe(6);
  });

  it('layoutNodes keeps nodes apart and inside the board', () => {
    const pts = layoutNodes(25, seededRng(42));
    expect(pts).toHaveLength(25);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
    }
    let minD = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        minD = Math.min(minD, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
    expect(minD).toBeGreaterThan(8);
  });
});

describe('gameDeteriorationReasons', () => {
  it('+2 for >30% slower, +3 for >50%, +1 accuracy drop', () => {
    expect(gameDeteriorationReasons({ medianReactionMs: 500, hitRate: 1 }, { medianReactionMs: 680, hitRate: 1 }))
      .toEqual([expect.objectContaining({ points: 2 })]);
    const r = gameDeteriorationReasons({ medianReactionMs: 500, hitRate: 1 }, { medianReactionMs: 800, hitRate: 0.6 });
    expect(r.map((x) => x.points)).toEqual([3, 1]);
  });
  it('no reasons when stable', () => {
    expect(gameDeteriorationReasons({ medianReactionMs: 500, hitRate: 0.9 }, { medianReactionMs: 520, hitRate: 0.9 })).toEqual([]);
  });
});

describe('motorObservations / isUnresponsive', () => {
  it('produces readable notes', () => {
    const notes = motorObservations({ hands: compareHands(500, 900), trailRatio: 3.4, bypassErrors: 4 });
    expect(notes).toHaveLength(3);
  });
  it('two no_response in a row', () => {
    expect(isUnresponsive(['no_response', 'no_response', 'same'])).toBe(true);
    expect(isUnresponsive(['no_response', 'same'])).toBe(false);
  });
});

describe('analyzeSegmentedJitter', () => {
  it('ignores sharp turns at node hits on an otherwise smooth zig-zag', async () => {
    const { analyzeSegmentedJitter } = await import('./metrics.js');
    // Zig-zag: 4 straight 1.5 s legs at 120 Hz, direction flips at each node.
    const samples: PointerSample[] = [];
    const cuts: number[] = [];
    for (let leg = 0; leg < 4; leg++) {
      cuts.push(leg * 1500);
      for (let i = 0; i < 180; i++) {
        const t = leg * 1500 + (i / 120) * 1000;
        samples.push({ t, x: leg % 2 ? 360 - i * 2 : i * 2, y: 100 + leg * 50 });
      }
    }
    expect(analyzeSegmentedJitter(samples, cuts).pattern).toBe('none');
  });
});
