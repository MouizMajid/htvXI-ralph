import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Ralph } from './Ralph';
import { useSpeaking } from '../../lib/speech';
import type { RalphPose } from '../art';

interface ShellProps {
  pose: RalphPose;
  /** What Ralph says (speech bubble). */
  line?: ReactNode;
  /** Smaller line under the bubble, e.g. "Grown-up, please answer for Maya". */
  subline?: ReactNode;
  /** Shows "Oops, let's try tapping!" — the child just taps again. */
  error?: boolean;
  /** Big Ralph for welcome/goodbye; small for question screens. */
  big?: boolean;
  /** Shows a 🔊 "say it again" button next to the bubble. */
  onReplay?: () => void;
  children?: ReactNode;
}

/** One kiosk screen: Ralph + speech bubble on top, one action area below. */
export function Shell({ pose, line, subline, error, big, onReplay, children }: ShellProps) {
  const { t } = useTranslation();
  // While Ralph is talking, his mouth moves (talk pose) whatever the screen asked for.
  const speaking = useSpeaking();
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center gap-5 px-4 py-6 sm:py-10">
      <div className={`flex w-full items-center gap-3 ${big ? 'flex-col' : 'flex-row'}`}>
        <Ralph pose={speaking ? 'talk' : pose} className={big ? 'size-56 sm:size-72' : 'size-28 shrink-0 sm:size-36'} />
        {line && (
          <div
            className={`relative rounded-card bg-surface px-5 py-4 text-2xl font-bold leading-snug shadow-soft ${big ? 'text-center' : ''}`}
          >
            {line}
            {onReplay && (
              <button
                type="button"
                onClick={onReplay}
                aria-label={t('talk.replay')}
                className="ml-2 inline-flex size-10 items-center justify-center rounded-pill bg-bg align-middle text-xl active:scale-95"
              >
                🔊
              </button>
            )}
          </div>
        )}
      </div>
      {subline && <p className="text-center text-lg font-semibold text-ink-muted">{subline}</p>}
      {error && (
        <p role="alert" className="rounded-pill bg-accent px-5 py-2 text-lg font-bold text-ink">
          {t('oops')}
        </p>
      )}
      <div className="flex w-full flex-1 flex-col items-stretch gap-3">{children}</div>
    </main>
  );
}
