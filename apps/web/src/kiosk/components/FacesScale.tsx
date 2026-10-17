import { useTranslation } from 'react-i18next';
import { FACE_MAX } from '@ralph/shared';
import { useImageExists } from './Icon';

/** Placeholder face: mouth goes from a big smile (0) to a frown (5). Team art: icons/face-N.png. */
function PlaceholderFace({ n }: { n: number }) {
  const curve = 18 - n * 7; // +18 smile … -17 frown
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      <circle cx="50" cy="50" r="46" fill={`var(--color-face-${n})`} stroke="var(--color-ink)" strokeWidth="3" />
      <circle cx="35" cy="40" r="6" fill="var(--color-ink)" />
      <circle cx="65" cy="40" r="6" fill="var(--color-ink)" />
      <path d={`M30 ${68 - curve / 3} Q50 ${68 + curve} 70 ${68 - curve / 3}`} stroke="var(--color-ink)" strokeWidth="5" fill="none" strokeLinecap="round" />
      {n >= 4 && <path d="M30 52 q-3 10 0 14" stroke="var(--color-secondary)" strokeWidth="4" fill="none" />}
    </svg>
  );
}

function Face({ n }: { n: number }) {
  const src = `/icons/face-${n}.png`;
  return useImageExists(src) ? <img src={src} alt="" className="size-full object-contain" /> : <PlaceholderFace n={n} />;
}

export function FacesScale({ onPick, disabled }: { onPick: (n: number) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const faces = Array.from({ length: FACE_MAX + 1 }, (_, n) => n);
  return (
    <div className="grid grid-cols-3 gap-3">
      {faces.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onPick(n)}
          className="flex flex-col items-center gap-1 rounded-card bg-surface p-3 shadow-soft transition active:scale-95 disabled:opacity-50"
        >
          <span className="size-20 sm:size-24">
            <Face n={n} />
          </span>
          <span className="text-lg font-bold">{t(`faces.${n}`)}</span>
        </button>
      ))}
    </div>
  );
}
