import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';
import es from './es.json';
import fr from './fr.json';
import zhCN from './zh-CN.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    es: { translation: es },
    fr: { translation: fr },
    'zh-CN': { translation: zhCN },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
