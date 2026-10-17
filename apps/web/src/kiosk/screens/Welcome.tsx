import { useTranslation } from 'react-i18next';
import { Ralph } from '../components/Ralph';

export function Welcome({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 p-6 text-center">
      <Ralph pose="wave" className="size-64 sm:size-80" />
      <h1 className="text-3xl font-extrabold">{t('welcome.greeting')}</h1>
      <button
        onClick={onStart}
        className="min-h-16 rounded-pill bg-primary px-10 text-2xl font-bold text-on-primary shadow-soft active:scale-95"
      >
        {t('welcome.start')}
      </button>
    </section>
  );
}
