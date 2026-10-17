import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BodyRegion } from '@ralph/shared';
import { BigButton } from './BigButton';
import { useImageExists } from './Icon';

/*
 * Front view faces the viewer, so the CHILD'S RIGHT is on the viewer's LEFT.
 * "lower_right_tummy" therefore sits on the left side of the drawing. Don't "fix" this.
 * Hotspots are invisible over team art (icons/body-front.png / body-back.png, 300×560 canvas);
 * until the art exists they are drawn as a simple placeholder figure.
 */
type Shape = { region: BodyRegion; d: string };

const rect = (x: number, y: number, w: number, h: number, r = 14) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0z`;

const LIMBS: Shape[] = [
  { region: 'arms', d: rect(52, 130, 40, 175, 18) },
  { region: 'arms', d: rect(208, 130, 40, 175, 18) },
  { region: 'legs', d: rect(102, 330, 44, 210, 18) },
  { region: 'legs', d: rect(154, 330, 44, 210, 18) },
  { region: 'head', d: circle(150, 62, 46) },
];

const FRONT: Shape[] = [
  ...LIMBS,
  { region: 'throat', d: rect(132, 106, 36, 22, 6) },
  { region: 'chest', d: rect(96, 128, 108, 68, 20) },
  { region: 'upper_tummy', d: rect(98, 196, 104, 42, 8) },
  { region: 'belly_button', d: rect(98, 238, 104, 36, 8) },
  { region: 'lower_right_tummy', d: rect(98, 274, 35, 56, 10) }, // child's right = viewer's left
  { region: 'lower_middle_tummy', d: rect(133, 274, 34, 56, 6) },
  { region: 'lower_left_tummy', d: rect(167, 274, 35, 56, 10) },
];

const BACK: Shape[] = [
  ...LIMBS,
  { region: 'throat', d: rect(132, 106, 36, 22, 6) },
  { region: 'back', d: rect(96, 128, 108, 202, 22) },
];

export function BodyMap({ onPick, disabled }: { onPick: (r: BodyRegion) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [picked, setPicked] = useState<BodyRegion | null>(null);
  const art = `/icons/body-${side}.png`;
  const hasArt = useImageExists(art);
  const shapes = side === 'front' ? FRONT : BACK;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {(['front', 'back'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => (setSide(s), setPicked(null))}
            className={`rounded-pill px-5 py-2 text-lg font-bold ${side === s ? 'bg-secondary text-on-secondary' : 'bg-surface'}`}
          >
            {t(`bodyMap.${s}`)}
          </button>
        ))}
      </div>

      <svg viewBox="44 10 212 536" className="h-[60vh] max-h-[560px] w-auto max-w-full touch-manipulation" role="group" aria-label={t('bodyMap.hint')}>
        {hasArt && <image href={art} x="0" y="0" width="300" height="560" />}
        {shapes.map((s, i) => (
          <path
            key={`${s.region}-${i}`}
            d={s.d}
            role="button"
            aria-label={t(`regions.${s.region}`)}
            onClick={() => !disabled && setPicked(s.region)}
            fill={picked === s.region ? 'var(--color-body-selected)' : hasArt ? 'transparent' : 'var(--color-body)'}
            fillOpacity={hasArt && picked === s.region ? 0.45 : 1}
            stroke={hasArt ? 'none' : 'var(--color-body-line)'}
            strokeWidth="2"
            className="cursor-pointer"
          />
        ))}
      </svg>

      <p className="min-h-8 text-xl font-bold">{picked ? t(`regions.${picked}`) : t('bodyMap.hint')}</p>
      <div className="grid w-full grid-cols-2 gap-3">
        <BigButton tone="unsure" disabled={disabled} onClick={() => onPick('all_over')}>
          {t('bodyMap.allOver')}
        </BigButton>
        <BigButton tone="primary" disabled={disabled || !picked} onClick={() => picked && onPick(picked)}>
          {t('bodyMap.confirm')}
        </BigButton>
      </div>
    </div>
  );
}
