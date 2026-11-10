export type Language = 'en' | 'ar';

export interface LanguageSettings {
  /** Browser locale used for the language's test project. */
  locale: string;
  /** Expected document direction. */
  dir: 'ltr' | 'rtl';
}

export interface EnvConfig {
  /** Approved staging environment id (TEST_ENV), matching a file in config/environments. */
  name: string;
  baseURL: string;
  /** ERP (ERPNext) base URL for read-only verification. Optional: ERP tests skip without it. */
  erpURL?: string;
  /** Whether the ERP's environment ownership is confirmed (see config/environments/<id>.json). */
  erpStatus?: 'unconfirmed' | 'confirmed';
  /** Appium server URL for mobile tests. */
  appiumURL: string;
}
