import type { BackendRole } from '@config/credentials.config';
import { expect, test } from '@fixtures/test.fixture';
import { backendHomePath } from '@test-data/backend-permissions.data';
import { failedInvoiceText, failedText } from '@test-data/backend-failed.data';
import {
  type FailedAccessPage,
  type FailedDeniedProbe,
  expectedFailedAccess,
  failedAccessPaths,
  failedDeniedProbes,
  failedForbiddenStatus,
} from '@test-data/backend-failed-permissions.data';

// Who may open the Failed List and use its actions.
//  - Dev Root runs the administrative checks. It holds every permission and is NOT a Super Admin
//    login test.
//  - Role accounts (Auction Supervisor, Auction Team, Customer Support, Operation, Marketing) run
//    only when their account is in .env (see .env.example); the others are skipped.
//  - Super Admin runs only with SUPER_ADMIN_PHONE / SUPER_ADMIN_PASSWORD in .env.
//  - The throwaway-role test (grant and remove a permission on a QA-AUTO role, FL-PRM-06) was
//    removed from scope on 2026-11-11 because it creates and deletes a role. This file never
//    creates, changes or deletes a role or any other record.

// Signed-in sessions and real credentials: no traces, videos or automatic screenshots.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const pageTitles: Record<FailedAccessPage, string> = {
  list: failedText.pageTitle,
  create: failedText.createAuctionTitle,
  invoiceList: failedInvoiceText.pageTitle,
  pricingUpdate: '',
};
const sidebarPages: FailedAccessPage[] = ['list', 'invoiceList'];

test.describe('Backend - Failed List - access as Dev Root', { tag: ['@regression'] }, () => {
  test.use({ signedInAs: 'devRoot' });

  for (const key of ['list', 'create', 'invoiceList'] as const) {
    test(
      `FL-PRM-01 Dev Root can open ${key} (administrative check, not a Super Admin login)`,
      { tag: ['@smoke', '@functional'] },
      async ({ page }) => {
        const response = await page.goto(failedAccessPaths[key]);

        expect(response?.status()).toBe(200);
        expect(await page.title()).toBe(pageTitles[key]);
      },
    );
  }

  test(
    'FL-PRM-01b Dev Root sees every Failed List action on a row that has bids',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.goto();

      const row = failedPage.rowsWithDirectSale.first();
      await expect(failedPage.rowDirectSaleLink(row)).toBeVisible();
      await expect(failedPage.rowRepricingLink(row)).toBeVisible();
      await expect(failedPage.rowUploadInvoiceLink(row)).toBeVisible();
      await expect(failedPage.rowSuspendLink(row)).toBeVisible();
      await expect(failedPage.createAuctionButton).toBeVisible();
    },
  );
});

for (const profile of [
  'auctionSupervisor',
  'auctionTeam',
  'customerSupport',
  'operation',
  'noAuctionAccess',
] as const satisfies readonly BackendRole[]) {
  const access = expectedFailedAccess[profile];

  test.describe(
    `Backend - Failed List - access as ${access.label}`,
    { tag: ['@regression'] },
    () => {
      test.use({ signedInAs: profile });

      for (const key of Object.keys(failedAccessPaths) as FailedAccessPage[]) {
        if (key === 'pricingUpdate') continue;
        const allowed = access.pages.includes(key);

        test(
          `FL-PRM-02 ${access.label} ${allowed ? 'can' : 'cannot'} open ${key}`,
          { tag: ['@functional', ...(allowed ? [] : ['@negative'])] },
          async ({ page }) => {
            const response = await page.goto(failedAccessPaths[key]);

            expect(response?.status()).toBe(allowed ? 200 : failedForbiddenStatus);
            expect((await page.title()) === pageTitles[key]).toBe(allowed);
          },
        );
      }

      test(
        `FL-PRM-03 The sidebar of ${access.label} links only to the lists it can open`,
        { tag: ['@functional'] },
        async ({ page, mazadDashboardPage }) => {
          await page.goto(backendHomePath);

          for (const key of sidebarPages) {
            const link = mazadDashboardPage.sidebar.locator(`a[href="${failedAccessPaths[key]}"]`);
            await expect(link, `${key} link`).toHaveCount(access.pages.includes(key) ? 1 : 0);
          }
        },
      );

      for (const key of Object.keys(failedDeniedProbes) as FailedDeniedProbe[]) {
        if (!access.refused.includes(key)) continue;
        const { label, path } = failedDeniedProbes[key];

        test(
          `FL-PRM-04 ${access.label} is refused the ${label}`,
          { tag: ['@functional', '@negative'] },
          async ({ page }) => {
            const response = await page.goto(path);

            expect(response?.status(), `${label} HTTP status`).toBe(failedForbiddenStatus);
          },
        );
      }
    },
  );
}

test.describe('Backend - Failed List - access as Super Admin', { tag: ['@regression'] }, () => {
  test(
    'FL-PRM-05 Super Admin can open the Failed List and every action is offered',
    { tag: ['@smoke', '@functional'] },
    async ({ signInAsSuperAdmin, pagesOn }) => {
      const { tab, error } = await signInAsSuperAdmin();
      expect(error, 'Super Admin signs in').toBeNull();
      const { failedPage } = pagesOn(tab);

      await failedPage.goto();

      await expect(tab).toHaveTitle(failedText.pageTitle);
      await expect(failedPage.createAuctionButton).toBeVisible();
      const row = failedPage.rowsWithDirectSale.first();
      await expect(failedPage.rowDirectSaleLink(row)).toBeVisible();
      await expect(failedPage.rowRepricingLink(row)).toBeVisible();
      await expect(failedPage.rowUploadInvoiceLink(row)).toBeVisible();
      await expect(failedPage.rowSuspendLink(row)).toBeVisible();
    },
  );
});

test.describe('Backend - Failed List - Super Admin pages', { tag: ['@regression'] }, () => {
  for (const key of ['list', 'create', 'invoiceList'] as const) {
    test(
      `FL-PRM-05b Super Admin can open ${key} (HTTP 200, right page)`,
      { tag: ['@functional'] },
      async ({ signInAsSuperAdmin }) => {
        const { tab, error } = await signInAsSuperAdmin();
        expect(error, 'Super Admin signs in').toBeNull();

        const response = await tab.goto(failedAccessPaths[key]);

        expect(response?.status()).toBe(200);
        expect(await tab.title()).toBe(pageTitles[key]);
      },
    );
  }
});
