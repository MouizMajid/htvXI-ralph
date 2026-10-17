import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, type Lang } from '@ralph/shared';
import { Shell } from '../components/Shell';
import { BigButton } from '../components/BigButton';

/** Each language in its own script — no flags (languages aren't countries). */
const NATIVE_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  es: 'Español',
  fr: 'Français',
  'zh-CN': '中文',
};

export function Language({ onPick }: { onPick: (lang: Lang) => void }) {
  const { t } = useTranslation();
  return (
    <Shell pose="idle" line={t('language.title')} subline={t('language.hint')}>
      {SUPPORTED_LANGS.map((l) => (
        <BigButton key={l} lang={l} onClick={() => onPick(l)}>
          {NATIVE_NAMES[l]}
        </BigButton>
      ))}
    </Shell>
  );
}
