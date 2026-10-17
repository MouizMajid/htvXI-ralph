import type { Reason, ScoreBand } from '@ralph/shared';

/** Deterioration score bands: 0–2 stable, 3–4 watch, 5+ escalate. */
export function bandFor(score: number): ScoreBand {
  if (score >= 5) return 'escalate';
  if (score >= 3) return 'watch';
  return 'stable';
}

export function totalScore(reasons: Reason[]): number {
  return reasons.reduce((sum, r) => sum + r.points, 0);
}

// TODO(Tier 1 #7): signal functions (pain delta, "worse", reaction-time vs baseline, …).
