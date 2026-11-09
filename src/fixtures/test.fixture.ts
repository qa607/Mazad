import { test as base, expect, request as playwrightRequest } from '@playwright/test';
import {
  type BackendAccount,
  DEV_ROOT_MISSING_REASON,
  ERP_MISSING_REASON,
  getDevRootAccount,
  getErpAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { ErpClient } from '@api/erp.client';
import { MazadApiClient } from '@api/mazad-api.client';
import { getTranslator, type Translator } from '@locales';
import { MazadDashboardPage } from '@pages/backend/mazad-dashboard.page';
import { MazadLoginPage } from '@pages/backend/mazad-login.page';
import { MazadSoldListPage } from '@pages/backend/mazad-sold-list.page';
import { MazadVehicleViewPage } from '@pages/backend/mazad-vehicle-view.page';
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
  mazadSoldListPage: MazadSoldListPage;
  mazadVehicleViewPage: MazadVehicleViewPage;
  /** Dev Root staging account from .env. Tests using it are skipped when it is not set. */
  devRoot: BackendAccount;
  /**
   * A back office session signed in as Dev Root, made read-only: after login every request
   * that is not a GET (except logout) is aborted, so tests cannot change back office data.
   * On failure it attaches a screenshot with account details masked.
   */
  backendSession: void;
  /** Mazad customer API client (guest calls). */
  mazadApi: MazadApiClient;
  /** Read-only ERP client, signed in from .env. Skips the test when the ERP is not configured. */
  erp: ErpClient;
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
  mazadSoldListPage: async ({ page }, use) => {
    await use(new MazadSoldListPage(page));
  },
  mazadVehicleViewPage: async ({ page }, use) => {
    await use(new MazadVehicleViewPage(page));
  },
  // eslint-disable-next-line no-empty-pattern
  devRoot: async ({}, use, testInfo) => {
    const account = getDevRootAccount();
    testInfo.skip(!account, DEV_ROOT_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  backendSession: async ({ page, devRoot, mazadLoginPage, mazadDashboardPage }, use, testInfo) => {
    await mazadLoginPage.goto();
    await mazadLoginPage.loginAs(devRoot);
    await mazadDashboardPage.userMenuToggle.waitFor();

    await page.route('**/*', async (route) => {
      const req = route.request();
      const allowed = req.method() === 'GET' || req.url().includes('/authentication/logout');
      await (allowed ? route.fallback() : route.abort('blockedbyclient'));
    });

    await use();

    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshot = await page
        .screenshot({
          fullPage: false,
          mask: [...mazadLoginPage.sensitiveAreas(), ...mazadDashboardPage.sensitiveAreas()],
        })
        .catch(() => null);
      if (screenshot) {
        await testInfo.attach('screenshot (account details masked)', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    }
    // Log out from the dashboard, within a fixed budget so teardown never eats the test timeout.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await Promise.race([
      (async () => {
        await mazadDashboardPage.goto();
        await mazadDashboardPage.logout();
        await page.waitForURL(/\/authentication\/login/);
      })(),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]).catch(() => undefined);
  },
  mazadApi: async ({ request }, use) => {
    await use(new MazadApiClient(request));
  },
  // eslint-disable-next-line no-empty-pattern
  erp: async ({}, use, testInfo) => {
    const account = getErpAccount();
    testInfo.skip(!envConfig.erpURL, `No erpURL configured for environment "${envConfig.name}".`);
    testInfo.skip(!account, ERP_MISSING_REASON);
    if (!account || !envConfig.erpURL) return; // Not reached: skip() ends the test.

    const context = await playwrightRequest.newContext({ baseURL: envConfig.erpURL });
    const client = new ErpClient(context);
    await client.login(account);
    await use(client);
    await client.logout();
    await context.dispose();
  },
});

export { expect };
