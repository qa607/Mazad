import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import type { BackendRole } from '@config/credentials.config';
import type { Browser, Page } from '@playwright/test';
import { type BackendPages, expect, test } from '@fixtures/test.fixture';
import {
  deliveryPaths,
  expectedDeliveryAccess,
  forbiddenStatus,
  type ExpectedDeliveryAccess,
  existingCompanies,
} from '@test-data/backend-delivery.data';
import { backendHomePath } from '@test-data/backend-permissions.data';

// Who can use Delivery Companies → Tracking and Companies, per role, strictly read-only. The
// expectations come from each role's configured permissions (2026-11-11); the tests compare what
// the application really does. Only GET requests are made: no save, status change, delete or
// tracking-link update is attempted, and no write request is probed. Mismatches against the
// configuration (Super Admin has no Delete permission; Auction Supervisor has the wildcard
// /deliveryCompany/*, which includes Delete) are asserted as observed and described in the report.
// Role sessions are the saved sessions of the dedicated QA accounts; Dev Root only reads the
// address of the Edit Link popup.

// Signed-in sessions and real credentials: no traces, videos or automatic screenshots.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

type RoleKey = Exclude<BackendRole, 'supplier'>;
const roles: RoleKey[] = [
  'auctionSupervisor',
  'auctionTeam',
  'customerSupport',
  'operation',
  'noAuctionAccess',
];

/** The popup address of the first tracking row's Edit Link, read as Dev Root (kept in memory only). */
async function editLinkPopupPath(
  browser: Browser,
  baseURL: string | undefined,
  pagesOn: (tab: Page) => BackendPages,
): Promise<string> {
  const context = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
  try {
    const { deliveryTrackingPage } = pagesOn(await context.newPage());
    await deliveryTrackingPage.goto();
    return await deliveryTrackingPage.editLinkFormPath(deliveryTrackingPage.rows.first());
  } finally {
    await context.close();
  }
}

/** Opens a page and returns the HTTP status. */
async function statusOf(page: Page, path: string): Promise<number | undefined> {
  return (await page.goto(path))?.status();
}

/** Every Companies check for one signed-in tab, shared by the role loop and Super Admin. */
async function expectCompaniesBehaviour(
  page: Page,
  pages: BackendPages,
  access: ExpectedDeliveryAccess,
) {
  const { deliveryCompanyListPage: list, mazadDashboardPage: dashboard } = pages;
  const [first] = existingCompanies;

  await page.goto(backendHomePath);
  await expect(
    dashboard.sidebar.locator(`a[href="${deliveryPaths.companies}"]`),
    'Companies in the sidebar',
  ).toHaveCount(access.companies ? 1 : 0);

  expect(await statusOf(page, deliveryPaths.companies), 'Companies list').toBe(
    access.companies ? 200 : forbiddenStatus,
  );
  expect(await statusOf(page, deliveryPaths.create), 'Create form (GET)').toBe(
    access.companies ? 200 : forbiddenStatus,
  );
  expect(await statusOf(page, deliveryPaths.view(first.id)), 'View page').toBe(
    access.companies ? 200 : forbiddenStatus,
  );
  expect(await statusOf(page, deliveryPaths.update(first.id)), 'Update form (GET)').toBe(
    access.companies ? 200 : forbiddenStatus,
  );

  if (!access.companies) return;

  await list.goto();
  const rows = await list.rows.count();
  expect(rows, 'companies listed').toBeGreaterThanOrEqual(existingCompanies.length);
  await expect(list.createButton).toBeVisible();
  await expect(list.rows.locator('a[title="View"]')).toHaveCount(rows);
  await expect(list.rows.locator('a[title="Update"]')).toHaveCount(rows);
  await expect(list.statusDropdowns, 'status dropdowns').toHaveCount(rows);
  await expect(list.rows.locator('a[title="Delete"]'), 'Delete links').toHaveCount(
    access.deleteLink ? rows : 0,
  );
}

/** Every Tracking check for one signed-in tab. */
async function expectTrackingBehaviour(
  page: Page,
  pages: BackendPages,
  access: ExpectedDeliveryAccess,
  popupPath: string,
) {
  const { deliveryTrackingPage: tracking, mazadDashboardPage: dashboard } = pages;

  await page.goto(backendHomePath);
  await expect(
    dashboard.sidebar.locator(`a[href="${deliveryPaths.tracking}"]`),
    'Tracking in the sidebar',
  ).toHaveCount(access.tracking ? 1 : 0);

  expect(await statusOf(page, deliveryPaths.tracking), 'Tracking list').toBe(
    access.tracking ? 200 : forbiddenStatus,
  );
  if (access.tracking) {
    await expect(tracking.columnHeaders).toHaveCount(7);
    await expect(tracking.rows.first()).toBeVisible();
    if (access.editLink) await expect(tracking.editLinkLinks.first()).toBeVisible();
    else await expect(tracking.editLinkLinks).toHaveCount(0);
  }

  // The Edit Link popup form is only requested (GET); it is never submitted.
  expect(await statusOf(page, popupPath), 'Edit Link popup form (GET)').toBe(
    access.editLink ? 200 : forbiddenStatus,
  );
}

for (const role of roles) {
  const access = expectedDeliveryAccess[role];

  test.describe(
    `Backend - Delivery Companies - access as ${access.label}`,
    { tag: ['@regression'] },
    () => {
      test.use({ signedInAs: role });

      test(
        `DLV-PRM-01 ${access.label}: Tracking is ${access.tracking ? 'available' : 'refused'} (sidebar, page, rows, Edit Link)`,
        { tag: ['@functional', ...(access.tracking ? [] : ['@negative'])] },
        async ({ page, pagesOn, browser, baseURL }) => {
          const popupPath = await editLinkPopupPath(browser, baseURL, pagesOn);

          await expectTrackingBehaviour(page, pagesOn(page), access, popupPath);
        },
      );

      test(
        `DLV-PRM-02 ${access.label}: Companies is ${access.companies ? 'available' : 'refused'} (sidebar, pages, Create, View, Update, status, Delete)`,
        { tag: ['@functional', ...(access.companies ? [] : ['@negative'])] },
        async ({ page, pagesOn }) => {
          await expectCompaniesBehaviour(page, pagesOn(page), access);
        },
      );
    },
  );
}

test.describe(
  'Backend - Delivery Companies - access as Super Admin',
  { tag: ['@regression'] },
  () => {
    const access = expectedDeliveryAccess.superAdmin;

    test(
      'DLV-PRM-03 Super Admin: Tracking and Companies are available, with no Delete link',
      { tag: ['@smoke', '@functional'] },
      async ({ signInAsSuperAdmin, pagesOn, browser, baseURL }) => {
        const popupPath = await editLinkPopupPath(browser, baseURL, pagesOn);
        const { tab, error } = await signInAsSuperAdmin();
        expect(error, 'Super Admin signs in').toBeNull();
        const pages = pagesOn(tab);

        await expectTrackingBehaviour(tab, pages, access, popupPath);
        await expectCompaniesBehaviour(tab, pages, access);
      },
    );
  },
);
