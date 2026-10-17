import { useTranslation } from 'react-i18next';

export function Welcome({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 p-6 text-center">
      {/* TODO: <Ralph pose="wave" /> once components/Ralph.tsx exists */}
      <div className="flex size-48 items-center justify-center rounded-full bg-white text-6xl shadow-md">
        🦝
      </div>
      <h1 className="text-3xl font-extrabold">{t('welcome.greeting')}</h1>
      <button
        onClick={onStart}
        className="min-h-16 rounded-full bg-berry px-10 text-2xl font-bold text-white shadow-lg active:scale-95"
      >
        {t('welcome.start')}
      </button>
    </section>
  );
}
