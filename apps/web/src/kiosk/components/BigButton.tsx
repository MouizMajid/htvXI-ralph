import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'primary' | 'secondary' | 'surface' | 'yes' | 'no' | 'unsure';

const TONES: Record<Tone, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-secondary text-on-secondary',
  surface: 'bg-surface text-ink',
  yes: 'bg-yes text-on-primary',
  no: 'bg-no text-on-primary',
  unsure: 'bg-unsure text-ink',
};

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  icon?: ReactNode;
  selected?: boolean;
}

/** ≥64 px tall, ≥24 px text — the only kind of button a child presses. */
export function BigButton({ tone = 'surface', icon, selected, className = '', children, ...rest }: BigButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`flex min-h-16 items-center justify-center gap-3 rounded-card px-6 py-3 text-2xl font-bold shadow-soft transition active:scale-95 disabled:opacity-50 ${TONES[tone]} ${selected ? 'ring-4 ring-primary ring-offset-2 ring-offset-bg' : ''} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
