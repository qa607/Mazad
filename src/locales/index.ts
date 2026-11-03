import type { Language, LanguageSettings } from '../types';
import { ar } from './ar';
import { en, type TranslationKey, type Translations } from './en';

export type { TranslationKey };

export type Translator = (key: TranslationKey) => string;

export const LANGUAGES: Record<Language, LanguageSettings> = {
  en: { locale: 'en-SA', dir: 'ltr' },
  ar: { locale: 'ar-SA', dir: 'rtl' },
};

const translations: Record<Language, Translations> = { en, ar };

export function getTranslator(language: Language): Translator {
  const strings = translations[language];
  return (key) => strings[key];
}
