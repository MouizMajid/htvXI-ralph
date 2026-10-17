import { useTranslation } from 'react-i18next';
import { Shell } from '../components/Shell';
import { BigButton } from '../components/BigButton';

export function Welcome({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell pose="wave" big line={t('welcome.greeting')}>
      <BigButton tone="primary" onClick={onStart} className="mt-4 py-5 text-3xl">
        {t('welcome.start')}
      </BigButton>
    </Shell>
  );
}
