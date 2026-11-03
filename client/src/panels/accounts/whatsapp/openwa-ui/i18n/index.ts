import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

// The vendored Chats UI is mounted inside the CRM, whose language is English.
// Keeping the same exports means the copied components need no further changes.
export const supportedLanguages = ['en'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = [];

export const languageOptions: Array<{ value: SupportedLanguage; label: string; compactLabel: string }> = [
  { value: 'en', label: 'English', compactLabel: 'EN' },
];

export function resolveSupportedLanguage(_lang?: string): SupportedLanguage {
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export const i18nReady = Promise.resolve();

export default i18n;
