/**
 * Lightweight Web Audio synthesizer for game & celebration feedback.
 * Zero external asset dependencies; fails silently if audio is blocked.
 */

import { isRalphMuted } from './speech';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || isRalphMuted()) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx?.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.14,
  delaySec = 0,
  endFreq?: number,
) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime + delaySec;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + durationSec);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/** Sparkly chime when catching a firefly; pitch climbs with streak! */
export function playFireflyChime(streak = 1) {
  const base = 523.25 * Math.pow(1.06, Math.min(streak, 10)); // C5 upward
  tone(base, 0.16, 'triangle', 0.16, 0, base * 1.25);
  tone(base * 1.5, 0.22, 'sine', 0.12, 0.05);
}

/** Crisp synth lock when connecting a Cyber Circuit node. */
export function playCyberNodeLock(stepIndex = 0) {
  const scale = [330, 392, 440, 493.88, 587.33, 659.25, 783.99, 880];
  const f = scale[stepIndex % scale.length]! * (1 + Math.floor(stepIndex / 8) * 0.15);
  tone(f, 0.11, 'sine', 0.13, 0, f * 1.12);
}

/** Low buzz when tapping the wrong node in Cyber Circuit. */
export function playCyberGlitch() {
  tone(155, 0.22, 'sawtooth', 0.12, 0, 95);
  tone(118, 0.25, 'square', 0.08, 0.04, 82);
}

/** Cheerful 4-note fanfare when Ralph pops onto screen to congratulate the player! */
export function playCelebrationFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((n, i) => {
    tone(n, i === 3 ? 0.45 : 0.16, 'triangle', 0.16, i * 0.09);
  });
}
