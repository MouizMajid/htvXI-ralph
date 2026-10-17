import { useEffect, useState, useSyncExternalStore } from 'react';
import { Ralph } from '../kiosk/components/Ralph';
import {
  RALPH_FRAMES,
  artUrl,
  isPlaceholder,
  resolveArt,
  subscribeArt,
  type RalphPose,
} from '../kiosk/art';

const POSES: RalphPose[] = ['idle', 'talk', 'listen', 'think', 'happy', 'gentle', 'wave', 'celebrate', 'sleep'];

let v = 0;
const subscribe = (cb: () => void) => subscribeArt(() => (v++, cb()));

/** /art — lets the art team check dropped-in PNGs and every animated pose. */
export function ArtGallery() {
  useSyncExternalStore(subscribe, () => v);
  useEffect(resolveArt, []);
  const [pose, setPose] = useState<RalphPose>('idle');
  const done = RALPH_FRAMES.filter((f) => !isPlaceholder(f)).length;

  return (
    <main className="min-h-full bg-bg p-4 text-ink sm:p-8">
      <h1 className="text-2xl font-extrabold">Ralph art check</h1>
      <p className="text-ink-muted">
        {done} / {RALPH_FRAMES.length} frames drawn. Drop PNGs in <code>apps/web/public/ralph/</code> and reload.
      </p>

      <section className="mt-6 flex flex-col items-center gap-4 rounded-card bg-surface p-6 shadow-soft">
        <Ralph pose={pose} className="size-72" />
        <div className="flex flex-wrap justify-center gap-2">
          {POSES.map((p) => (
            <button
              key={p}
              onClick={() => setPose(p)}
              className={`rounded-pill px-4 py-2 font-bold ${p === pose ? 'bg-primary text-on-primary' : 'bg-bg'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {RALPH_FRAMES.map((f) => (
          <figure key={f} className="rounded-card bg-surface p-2 shadow-soft">
            {/* checkerboard so transparency problems are visible */}
            <img
              src={artUrl(f)}
              alt={f}
              className="aspect-square w-full object-contain"
              style={{ background: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 24px 24px' }}
            />
            <figcaption className="mt-1 text-center text-sm">
              {f}{' '}
              <span className={isPlaceholder(f) ? 'text-ink-muted' : 'font-bold text-success'}>
                {isPlaceholder(f) ? '(placeholder)' : '✓ png'}
              </span>
            </figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
