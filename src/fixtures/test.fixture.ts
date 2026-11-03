import { test as base, expect } from '@playwright/test';
import {
  type BackendAccount,
  DEV_ROOT_MISSING_REASON,
  getDevRootAccount,
} from '@config/credentials.config';
import { getTranslator, type Translator } from '@locales';
import { MazadDashboardPage } from '@pages/backend/mazad-dashboard.page';
import { MazadLoginPage } from '@pages/backend/mazad-login.page';
import type { Language } from '@typings';

/** Options set per project in playwright.config.ts. */
export interface LanguageOptions {
  language: Language;
}

interface MazadFixtures {
  /** Translator for the active language, for text assertions in tests. */
  t: Translator;
  mazadLoginPage: MazadLoginPage;
  mazadDashboardPage: MazadDashboardPage;
  /** Dev Root staging account from .env. Tests using it are skipped when it is not set. */
  devRoot: BackendAccount;
}

export const test = base.extend<LanguageOptions & MazadFixtures>({
  language: ['en', { option: true }],
  t: async ({ language }, use) => {
    await use(getTranslator(language));
  },
  mazadLoginPage: async ({ page }, use) => {
    await use(new MazadLoginPage(page));
  },
  mazadDashboardPage: async ({ page }, use) => {
    await use(new MazadDashboardPage(page));
  },
  // eslint-disable-next-line no-empty-pattern
  devRoot: async ({}, use, testInfo) => {
    const account = getDevRootAccount();
    testInfo.skip(!account, DEV_ROOT_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
});

export { expect };
