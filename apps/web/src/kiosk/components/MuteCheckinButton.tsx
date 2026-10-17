import { useTranslation } from 'react-i18next';
import { useRalphMuted } from '../../lib/speech';

interface MuteCheckinButtonProps {
  variant?: 'kid' | 'cyber';
}

/**
 * Toggle button that mutes/unmutes Ralph's voice & automatic 12-minute check-ins.
 */
export function MuteCheckinButton({ variant = 'kid' }: MuteCheckinButtonProps) {
  const { t } = useTranslation();
  const [muted, setMuted] = useRalphMuted();
  const cyber = variant === 'cyber';

  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      className={`inline-flex min-h-11 items-center gap-2 rounded-pill px-4 py-1.5 text-sm font-extrabold shadow-soft transition-transform active:scale-95 ${
        muted
          ? cyber
            ? 'border-2 border-cyber-error bg-cyber-error/20 text-cyber-error'
            : 'border-2 border-no bg-no text-on-primary'
          : cyber
            ? 'border border-cyber-node bg-cyber-panel text-cyber-node'
            : 'border-2 border-secondary/30 bg-surface text-ink'
      }`}
      title={
        muted
          ? t('companion.unmuteHint', 'Unmute Ralph & resume 12-minute check-ins')
          : t('companion.muteHint', 'Mute Ralph & pause automatic 12-minute check-ins')
      }
    >
      <span className="text-lg" aria-hidden>
        {muted ? '🔇' : '🔔'}
      </span>
      <span>
        {muted
          ? t('companion.mutedLabel', 'Muted (Check-ins Off)')
          : t('companion.unmutedLabel', '12m Auto Check-In: ON')}
      </span>
    </button>
  );
}
