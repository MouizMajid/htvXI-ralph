import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../components/Shell';
import { useSay } from '../../lib/speech';
import { BigButton } from '../components/BigButton';
import { Icon } from '../components/Icon';

const STICKERS = 6;
const FALLBACK = ['⭐', '🦝', '🌈', '🚀', '🦖', '🌻'];

/** RALPH's job ends here — the nurse takes over in person. */
export function Goodbye({ childName, onDone }: { childName: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  useSay(t('goodbye.title', { name: childName }), i18n.language);
  const n = useMemo(() => Math.floor(Math.random() * STICKERS), []);
  return (
    <Shell pose="celebrate" big line={t('goodbye.title', { name: childName })}>
      <div className="flex flex-col items-center gap-2 rounded-card bg-surface p-6 shadow-soft">
        <Icon name={`sticker-${n + 1}`} fallback={FALLBACK[n]!} className="size-32 text-8xl" />
        <p className="text-center text-xl font-bold">{t('goodbye.sticker')}</p>
      </div>
      <BigButton tone="primary" onClick={onDone}>
        {t('goodbye.done')}
      </BigButton>
    </Shell>
  );
}
