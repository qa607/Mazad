export type Language = 'en' | 'ar';

export interface LanguageSettings {
  /** Browser locale used for the language's test project. */
  locale: string;
  /** Expected document direction. */
  dir: 'ltr' | 'rtl';
}

export interface EnvConfig {
  /** Environment name, matching a file in config/environments. */
  name: string;
  baseURL: string;
}
