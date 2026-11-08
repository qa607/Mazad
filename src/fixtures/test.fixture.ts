import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';
import {
  type BackendAccount,
  DEV_ROOT_MISSING_REASON,
  DEV_ROOT_SESSION_FILE,
  getDevRootAccount,
} from '@config/credentials.config';
import { getTranslator, type Translator } from '@locales';
import { MazadDashboardPage } from '@pages/backend/mazad-dashboard.page';
import { MazadLoginPage } from '@pages/backend/mazad-login.page';
import { ReadyForPricingPage } from '@pages/backend/ready-for-pricing.page';
import { SuspendedVehiclesPage } from '@pages/backend/suspended-vehicles.page';
import type { Language } from '@typings';

/** Options set per project in playwright.config.ts. */
export interface LanguageOptions {
  language: Language;
}

/** Options set per spec with test.use(). */
export interface SessionOptions {
  /**
   * 'devRoot' opens every page already signed in as Dev Root, reusing the session saved once
   * per run by tests/backend/auth.setup.ts. Default 'none': a fresh, signed-out browser.
   */
  signedInAs: 'none' | 'devRoot';
}

interface MazadFixtures {
  /** Translator for the active language, for text assertions in tests. */
  t: Translator;
  mazadLoginPage: MazadLoginPage;
  mazadDashboardPage: MazadDashboardPage;
  suspendedVehiclesPage: SuspendedVehiclesPage;
  readyForPricingPage: ReadyForPricingPage;
  /** Dev Root staging account from .env. Tests using it are skipped when it is not set. */
  devRoot: BackendAccount;
}

export const test = base.extend<LanguageOptions & SessionOptions & MazadFixtures>({
  language: ['en', { option: true }],
  signedInAs: ['none', { option: true }],
  storageState: async ({ signedInAs, storageState }, use, testInfo) => {
    if (signedInAs === 'none') return use(storageState);

    testInfo.skip(!getDevRootAccount(), DEV_ROOT_MISSING_REASON);
    if (!fs.existsSync(DEV_ROOT_SESSION_FILE)) {
      throw new Error(
        'No saved Dev Root session: the "backend-setup" project signs in first. ' +
          'Run the "backend" project (it depends on backend-setup) rather than this file alone ' +
          'with --no-deps, and check the setup step passed.',
      );
    }
    await use(DEV_ROOT_SESSION_FILE);
  },
  t: async ({ language }, use) => {
    await use(getTranslator(language));
  },
  mazadLoginPage: async ({ page }, use) => {
    await use(new MazadLoginPage(page));
  },
  mazadDashboardPage: async ({ page }, use) => {
    await use(new MazadDashboardPage(page));
  },
  suspendedVehiclesPage: async ({ page }, use) => {
    await use(new SuspendedVehiclesPage(page));
  },
  readyForPricingPage: async ({ page }, use) => {
    await use(new ReadyForPricingPage(page));
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
