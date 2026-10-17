import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Handedness } from '@ralph/shared';

/** "Which hand do you draw with?" — needed to compare writing hand vs other hand. */
export function HandPicker({
  onPick,
  variant = 'kid',
}: {
  onPick: (h: Handedness) => void;
  variant?: 'kid' | 'cyber';
}) {
  const { t } = useTranslation();
  const cyber = variant === 'cyber';
  const btn = cyber
    ? 'min-h-24 flex-1 rounded-card border-2 border-cyber-node bg-cyber-panel text-2xl font-bold text-cyber-text active:scale-95'
    : 'min-h-28 flex-1 rounded-card bg-surface text-2xl font-bold text-ink shadow-soft active:scale-95';
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 text-center">
      <h2 className={`text-3xl font-extrabold ${cyber ? 'text-cyber-text' : 'text-ink'}`}>
        {cyber
          ? t('games.hand.titleCyber', 'Operator check: which hand do you write with?')
          : t('games.hand.title', 'Which hand do you draw with?')}
      </h2>
      <div className="flex w-full gap-4">
        <button className={btn} onClick={() => onPick('left')}>
          <span className="block text-5xl" aria-hidden>
            🫲
          </span>
          {t('games.hand.left', 'Left')}
        </button>
        <button className={btn} onClick={() => onPick('right')}>
          <span className="block text-5xl" aria-hidden>
            🫱
          </span>
          {t('games.hand.right', 'Right')}
        </button>
      </div>
      <button
        className={`min-h-16 rounded-pill px-8 text-xl font-semibold ${cyber ? 'text-cyber-muted' : 'text-ink-muted'}`}
        onClick={() => onPick('unknown')}
      >
        {t('games.hand.unsure', 'Not sure')}
      </button>
    </div>
  );
}

export function handLabel(h: Handedness, which: 'dominant' | 'non_dominant', t: TFunction): string {
  if (h === 'unknown') {
    return which === 'dominant' ? t('games.hand.drawHand', 'the hand you draw with') : t('games.hand.otherHand', 'your other hand');
  }
  const side = which === 'dominant' ? h : h === 'left' ? 'right' : 'left';
  return side === 'left' ? t('games.hand.leftHand', 'your LEFT hand') : t('games.hand.rightHand', 'your RIGHT hand');
}
