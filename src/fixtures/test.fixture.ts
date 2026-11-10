import fs from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
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
import { PermissionListPage } from '@pages/backend/access/permission-list.page';
import { RolePermissionsPage } from '@pages/backend/access/role-permissions.page';
import { AwaitingPage } from '@pages/backend/auctions/awaiting.page';
import { CreateAuctionPage } from '@pages/backend/auctions/create-auction.page';
import { FailedPage } from '@pages/backend/auctions/failed.page';
import { LivePage } from '@pages/backend/auctions/live.page';
import { PricingDonePage } from '@pages/backend/auctions/pricing-done.page';
import { ReadyForPricingPage } from '@pages/backend/auctions/ready-for-pricing.page';
import { SuspendedVehiclesPage } from '@pages/backend/auctions/suspended-vehicles.page';
import { UpcomingPage } from '@pages/backend/auctions/upcoming.page';
import { WaitingApprovalPage } from '@pages/backend/auctions/waiting-approval.page';
import { MazadLoginPage } from '@pages/backend/auth/mazad-login.page';
import { CustomerGroupFormPage } from '@pages/backend/customer-group/customer-group-form.page';
import { CustomerGroupListPage } from '@pages/backend/customer-group/customer-group-list.page';
import { CustomerGroupMembersPage } from '@pages/backend/customer-group/customer-group-members.page';
import { CustomerGroupViewPage } from '@pages/backend/customer-group/customer-group-view.page';
import { MazadDashboardPage } from '@pages/backend/dashboard/mazad-dashboard.page';
import { AuctionClosedReportPage } from '@pages/backend/reports/auction-closed-report.page';
import { PurchaseSurveyReportPage } from '@pages/backend/reports/purchase-survey-report.page';
import { SupplierAuctionInfoPage } from '@pages/backend/suppliers/supplier-auction-info.page';
import { SupplierFormPage } from '@pages/backend/suppliers/supplier-form.page';
import { SupplierListPage } from '@pages/backend/suppliers/supplier-list.page';
import { SupplierViewPage } from '@pages/backend/suppliers/supplier-view.page';
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

/**
 * test.use() settings for specs whose pages open signed in as Dev Root. Traces, videos and
 * automatic screenshots would capture the session and the account header, so they are off;
 * a failing test attaches a screenshot with account details masked instead.
 */
export const devRootSession = {
  signedInAs: 'devRoot',
  trace: 'off',
  video: 'off',
  screenshot: 'off',
} as const;

/** Back-office page objects for one browser tab. */
export interface BackendPages {
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
  waitingApprovalPage: WaitingApprovalPage;
  auctionClosedReportPage: AuctionClosedReportPage;
  purchaseSurveyReportPage: PurchaseSurveyReportPage;
  supplierListPage: SupplierListPage;
  supplierFormPage: SupplierFormPage;
  supplierViewPage: SupplierViewPage;
  supplierAuctionInfoPage: SupplierAuctionInfoPage;
  rolePermissionsPage: RolePermissionsPage;
  permissionListPage: PermissionListPage;
  customerGroupListPage: CustomerGroupListPage;
  customerGroupFormPage: CustomerGroupFormPage;
  customerGroupViewPage: CustomerGroupViewPage;
  customerGroupMembersPage: CustomerGroupMembersPage;
}

function createBackendPages(page: Page): BackendPages {
  return {
    mazadLoginPage: new MazadLoginPage(page),
    mazadDashboardPage: new MazadDashboardPage(page),
    suspendedVehiclesPage: new SuspendedVehiclesPage(page),
    readyForPricingPage: new ReadyForPricingPage(page),
    pricingDonePage: new PricingDonePage(page),
    upcomingPage: new UpcomingPage(page),
    createAuctionPage: new CreateAuctionPage(page),
    awaitingPage: new AwaitingPage(page),
    livePage: new LivePage(page),
    failedPage: new FailedPage(page),
    waitingApprovalPage: new WaitingApprovalPage(page),
    auctionClosedReportPage: new AuctionClosedReportPage(page),
    purchaseSurveyReportPage: new PurchaseSurveyReportPage(page),
    supplierListPage: new SupplierListPage(page),
    supplierFormPage: new SupplierFormPage(page),
    supplierViewPage: new SupplierViewPage(page),
    supplierAuctionInfoPage: new SupplierAuctionInfoPage(page),
    rolePermissionsPage: new RolePermissionsPage(page),
    permissionListPage: new PermissionListPage(page),
    customerGroupListPage: new CustomerGroupListPage(page),
    customerGroupFormPage: new CustomerGroupFormPage(page),
    customerGroupViewPage: new CustomerGroupViewPage(page),
    customerGroupMembersPage: new CustomerGroupMembersPage(page),
  };
}

interface MazadFixtures extends BackendPages {
  /** Translator for the active language, for text assertions in tests. */
  t: Translator;
  /** Dev Root staging account from .env. Tests using it are skipped when it is not set. */
  devRoot: BackendAccount;
  /** Page objects for another tab, such as one opened by a grid row action. */
  pagesOn: (tab: Page) => BackendPages;
  /**
   * Automatic: when automatic screenshots are off (because the page can show credentials or
   * account details), a failing test attaches a screenshot with those areas masked.
   */
  maskedFailureScreenshot: void;
  /**
   * Records the names of customer groups a test creates; after the test (passed or failed) every
   * group with one of those names is deleted through the list page.
   */
  customerGroupCleanup: { track: (name: string) => void };
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
  supplierListPage: async ({ page }, use) => {
    await use(new SupplierListPage(page));
  },
  supplierFormPage: async ({ page }, use) => {
    await use(new SupplierFormPage(page));
  },
  supplierViewPage: async ({ page }, use) => {
    await use(new SupplierViewPage(page));
  },
  supplierAuctionInfoPage: async ({ page }, use) => {
    await use(new SupplierAuctionInfoPage(page));
  },
  waitingApprovalPage: async ({ page }, use) => {
    await use(new WaitingApprovalPage(page));
  },
  auctionClosedReportPage: async ({ page }, use) => {
    await use(new AuctionClosedReportPage(page));
  },
  purchaseSurveyReportPage: async ({ page }, use) => {
    await use(new PurchaseSurveyReportPage(page));
  },
  rolePermissionsPage: async ({ page }, use) => {
    await use(new RolePermissionsPage(page));
  },
  permissionListPage: async ({ page }, use) => {
    await use(new PermissionListPage(page));
  },
  customerGroupListPage: async ({ page }, use) => {
    await use(new CustomerGroupListPage(page));
  },
  customerGroupFormPage: async ({ page }, use) => {
    await use(new CustomerGroupFormPage(page));
  },
  customerGroupViewPage: async ({ page }, use) => {
    await use(new CustomerGroupViewPage(page));
  },
  customerGroupMembersPage: async ({ page }, use) => {
    await use(new CustomerGroupMembersPage(page));
  },
  customerGroupCleanup: async ({ customerGroupListPage }, use) => {
    const names = new Set<string>();
    await use({ track: (name) => names.add(name) });
    for (const name of names) await customerGroupListPage.deleteGroupsNamed(name);
  },
  // eslint-disable-next-line no-empty-pattern
  pagesOn: async ({}, use) => {
    await use(createBackendPages);
  },
  // eslint-disable-next-line no-empty-pattern
  devRoot: async ({}, use, testInfo) => {
    const account = getDevRootAccount();
    testInfo.skip(!account, DEV_ROOT_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  maskedFailureScreenshot: [
    async ({ page, screenshot }, use, testInfo) => {
      await use();
      const mode = typeof screenshot === 'string' ? screenshot : screenshot.mode;
      if (mode !== 'off' || testInfo.status === testInfo.expectedStatus) return;
      const login = new MazadLoginPage(page);
      const dashboard = new MazadDashboardPage(page);
      const image = await page
        .screenshot({
          fullPage: true,
          mask: [...login.sensitiveAreas(), ...dashboard.sensitiveAreas()],
        })
        .catch(() => null);
      if (image) {
        await testInfo.attach('screenshot (account details masked)', {
          body: image,
          contentType: 'image/png',
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
