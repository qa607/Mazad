import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';
import {
  type BackendAccount,
  type BackendRole,
  DEV_ROOT_MISSING_REASON,
  DEV_ROOT_SESSION_FILE,
  getDevRootAccount,
  getRoleAccount,
  roleMissingReason,
  roleSessionFile,
} from '@config/credentials.config';
import { getTranslator, type Translator } from '@locales';
import { AwaitingPage } from '@pages/backend/awaiting.page';
import { FailedPage } from '@pages/backend/failed.page';
import { LivePage } from '@pages/backend/live.page';
import { CreateAuctionPage } from '@pages/backend/create-auction.page';
import { MazadDashboardPage } from '@pages/backend/mazad-dashboard.page';
import { MazadLoginPage } from '@pages/backend/mazad-login.page';
import { PricingDonePage } from '@pages/backend/pricing-done.page';
import { ReadyForPricingPage } from '@pages/backend/ready-for-pricing.page';
import { SupplierAuctionInfoPage } from '@pages/backend/supplier-auction-info.page';
import { SuspendedVehiclesPage } from '@pages/backend/suspended-vehicles.page';
import { UpcomingPage } from '@pages/backend/upcoming.page';
import { WaitingApprovalPage } from '@pages/backend/waiting-approval.page';
import type { Language } from '@typings';

/** Options set per project in playwright.config.ts. */
export interface LanguageOptions {
  language: Language;
}

/** Options set per spec with test.use(). */
export interface SessionOptions {
  /**
   * 'devRoot' opens every page already signed in as Dev Root, reusing the session saved once
   * per run by tests/backend/auth.setup.ts. A role key (see BACKEND_ROLES) does the same with
   * that role's test account. Default 'none': a fresh, signed-out browser.
   */
  signedInAs: 'none' | 'devRoot' | BackendRole;
}

interface MazadFixtures {
  /** Translator for the active language, for text assertions in tests. */
  t: Translator;
  mazadLoginPage: MazadLoginPage;
  mazadDashboardPage: MazadDashboardPage;
  suspendedVehiclesPage: SuspendedVehiclesPage;
  readyForPricingPage: ReadyForPricingPage;
  pricingDonePage: PricingDonePage;
  upcomingPage: UpcomingPage;
  createAuctionPage: CreateAuctionPage;
  awaitingPage: AwaitingPage;
  livePage: LivePage;
  failedPage: FailedPage;
  supplierAuctionInfoPage: SupplierAuctionInfoPage;
  waitingApprovalPage: WaitingApprovalPage;
  /** Dev Root staging account from .env. Tests using it are skipped when it is not set. */
  devRoot: BackendAccount;
}

export const test = base.extend<LanguageOptions & SessionOptions & MazadFixtures>({
  language: ['en', { option: true }],
  signedInAs: ['none', { option: true }],
  storageState: async ({ signedInAs, storageState }, use, testInfo) => {
    if (signedInAs === 'none') return use(storageState);

    if (signedInAs !== 'devRoot') {
      testInfo.skip(!getRoleAccount(signedInAs), roleMissingReason(signedInAs));
      const sessionFile = roleSessionFile(signedInAs);
      if (!fs.existsSync(sessionFile)) {
        throw new Error(
          `No saved session for role "${signedInAs}": its sign-in step in "backend-setup" ` +
            'failed or did not run. Run the "backend" project and check the setup step passed.',
        );
      }
      return use(sessionFile);
    }

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
  pricingDonePage: async ({ page }, use) => {
    await use(new PricingDonePage(page));
  },
  upcomingPage: async ({ page }, use) => {
    await use(new UpcomingPage(page));
  },
  createAuctionPage: async ({ page }, use) => {
    await use(new CreateAuctionPage(page));
  },
  awaitingPage: async ({ page }, use) => {
    await use(new AwaitingPage(page));
  },
  livePage: async ({ page }, use) => {
    await use(new LivePage(page));
  },
  failedPage: async ({ page }, use) => {
    await use(new FailedPage(page));
  },
  supplierAuctionInfoPage: async ({ page }, use) => {
    await use(new SupplierAuctionInfoPage(page));
  },
  waitingApprovalPage: async ({ page }, use) => {
    await use(new WaitingApprovalPage(page));
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
