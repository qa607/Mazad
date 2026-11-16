import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import type { BackendRole } from '@config/credentials.config';
import type { Browser, Page } from '@playwright/test';
import { type BackendPages, expect, test } from '@fixtures/test.fixture';
import { backendHomePath } from '@test-data/backend-permissions.data';
import {
  expectedInvoiceAccess,
  failedInvoiceRecord as record,
  failedInvoiceText as text,
  forbiddenStatus,
  updateInvoiceFormPath,
} from '@test-data/backend-failed-invoice.data';

// Who can see the Failed Invoice list and use its two row actions, per role, read-only. The
// expectations come from each role's configured permissions (2026-11-11); the tests compare what
// the application really does with them, and never assume a permission from the sidebar alone.
//  - View Invoice: permission view-failed-invoice.
//  - Update Supplier Invoice: permission upload-failed-invoice. Only its popup and its form
//    request are touched: nothing is uploaded, replaced or updated.
//  - The invoice file address is private: it is only used for a request, never logged, attached
//    or put in a message. Signed-out access is not tested.
// Role sessions are the saved sessions of the dedicated QA accounts; Dev Root is not used here.

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

/** The private address of the T2 invoice file, read once from the list as Dev Root (kept in memory only). */
async function invoiceFileHref(
  browser: Browser,
  baseURL: string | undefined,
  pagesOn: (tab: Page) => BackendPages,
): Promise<string> {
  const context = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
  try {
    const { failedInvoicePage } = pagesOn(await context.newPage());
    await failedInvoicePage.gotoByVin(record.vin);
    return await failedInvoicePage.invoiceFileHref(failedInvoicePage.row(record.itemId));
  } finally {
    await context.close();
  }
}

for (const role of roles) {
  const access = expectedInvoiceAccess[role];

  test.describe(
    `Backend - Failed Invoice - access as ${access.label}`,
    { tag: ['@regression'] },
    () => {
      test.use({ signedInAs: role });

      test(
        `FI-PRM-01 ${access.label}: the sidebar ${access.listOpens ? 'links' : 'does not link'} to Failed Invoice`,
        { tag: ['@functional'] },
        async ({ page, mazadDashboardPage }) => {
          await page.goto(backendHomePath);

          await expect(
            mazadDashboardPage.sidebar.locator('a[href*="failed-invoice/index"]'),
          ).toHaveCount(access.listOpens ? 1 : 0);
        },
      );

      test(
        `FI-PRM-02 ${access.label} ${access.listOpens ? 'can' : 'cannot'} open the Failed Invoice list`,
        { tag: ['@functional', ...(access.listOpens ? [] : ['@negative'])] },
        async ({ page, failedInvoicePage }) => {
          const response = await page.goto('/backend/invoice/failed-invoice/index');

          expect(response?.status()).toBe(access.listOpens ? 200 : forbiddenStatus);
          expect((await page.title()) === text.pageTitle).toBe(access.listOpens);
          if (access.listOpens)
            await expect(failedInvoicePage.columnHeaders).toHaveText([...text.columnHeaders]);
        },
      );

      if (access.listOpens) {
        test(
          `FI-PRM-03 ${access.label} sees the invoice row`,
          { tag: ['@functional'] },
          async ({ failedInvoicePage }) => {
            await failedInvoicePage.gotoByVin(record.vin);

            await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
            const [row] = await failedInvoicePage.readRows();
            expect(row['Vin Number']).toBe(record.vin);
            expect(row.Customer).toBe(record.customer);
          },
        );

        test(
          `FI-PRM-04 ${access.label}: View Invoice is ${access.viewInvoice ? 'shown' : 'not shown'}, Update Supplier Invoice is ${access.updateSupplierInvoice ? 'shown' : 'not shown'}`,
          { tag: ['@functional'] },
          async ({ failedInvoicePage }) => {
            await failedInvoicePage.gotoByVin(record.vin);
            const row = failedInvoicePage.row(record.itemId);

            await expect(failedInvoicePage.viewInvoiceLink(row)).toHaveCount(
              access.viewInvoice ? 1 : 0,
            );
            await expect(failedInvoicePage.updateSupplierInvoiceLink(row)).toHaveCount(
              access.updateSupplierInvoice ? 1 : 0,
            );
          },
        );
      }

      if (access.viewInvoice) {
        test(
          `FI-PRM-05 ${access.label}: View Invoice opens the file in a new tab`,
          { tag: ['@functional'] },
          async ({ failedInvoicePage }) => {
            await failedInvoicePage.gotoByVin(record.vin);

            const tab = await failedInvoicePage.openViewInvoice(
              failedInvoicePage.row(record.itemId),
            );

            expect(
              new URL(tab.url()).pathname.endsWith('.pdf'),
              'the new tab shows a PDF file',
            ).toBe(true);
            await tab.close();
          },
        );
      }

      if (access.listOpens && access.updateSupplierInvoice) {
        test(
          `FI-PRM-06 ${access.label}: Update Supplier Invoice opens its popup (nothing is submitted)`,
          { tag: ['@functional'] },
          async ({ failedInvoicePage }) => {
            await failedInvoicePage.gotoByVin(record.vin);

            await failedInvoicePage.openUpdateSupplierInvoice(failedInvoicePage.row(record.itemId));

            await expect(failedInvoicePage.uploadInvoiceDialog.title).toHaveText(
              text.updateDialogTitle,
            );
            await failedInvoicePage.uploadInvoiceDialog.close();
          },
        );
      }

      test(
        `FI-PRM-07 ${access.label} ${access.updateSupplierInvoice ? 'can open' : 'is refused'} the Update Supplier Invoice form request`,
        { tag: ['@functional', ...(access.updateSupplierInvoice ? [] : ['@negative'])] },
        async ({ page }) => {
          // A request for the popup's form only; the form is never filled or sent.
          const response = await page.goto(updateInvoiceFormPath(record.itemId));

          expect(response?.status()).toBe(access.updateSupplierInvoice ? 200 : forbiddenStatus);
        },
      );

      test(
        `FI-PRM-08 ${access.label} ${access.viewInvoice ? 'can' : 'must not be able to'} open the invoice file by its address`,
        { tag: ['@functional', ...(access.viewInvoice ? [] : ['@negative', '@known-bug'])] },
        async ({ browser, baseURL, pagesOn, page }) => {
          // Known defect candidate DC-06 (found 2026-11-11): the file address is served to any
          // signed-in back-office user. The authorization expectation (403 without the View
          // Invoice permission) is kept; observed: 302 to the stored PDF for every role below.
          // Remove test.fail() once the address is protected.
          test.fail(
            !access.viewInvoice,
            'Known defect candidate DC-06: the invoice file is served without the View Invoice permission.',
          );
          const href = await invoiceFileHref(browser, baseURL, pagesOn);
          await page.goto(backendHomePath);

          const response = await page.request.get(href, { maxRedirects: 0 });

          expect(response.status(), 'status of the invoice file address').toBe(
            access.viewInvoice ? 302 : forbiddenStatus,
          );
        },
      );
    },
  );
}

test.describe('Backend - Failed Invoice - access as Super Admin', { tag: ['@regression'] }, () => {
  const access = expectedInvoiceAccess.superAdmin;

  test(
    'FI-PRM-09 Super Admin: sidebar link, list, row and both actions',
    { tag: ['@smoke', '@functional'] },
    async ({ signInAsSuperAdmin, pagesOn }) => {
      const { tab, error } = await signInAsSuperAdmin();
      expect(error, 'Super Admin signs in').toBeNull();
      const { failedInvoicePage, mazadDashboardPage } = pagesOn(tab);

      await tab.goto(backendHomePath);
      await expect(
        mazadDashboardPage.sidebar.locator('a[href*="failed-invoice/index"]'),
      ).toHaveCount(1);

      const response = await tab.goto('/backend/invoice/failed-invoice/index');
      expect(response?.status()).toBe(200);
      await failedInvoicePage.gotoByVin(record.vin);
      const row = failedInvoicePage.row(record.itemId);
      await expect(row).toHaveCount(1);
      await expect(failedInvoicePage.viewInvoiceLink(row)).toHaveCount(access.viewInvoice ? 1 : 0);
      await expect(failedInvoicePage.updateSupplierInvoiceLink(row)).toHaveCount(1);
    },
  );

  test(
    'FI-PRM-10 Super Admin: View Invoice opens a PDF, Update Supplier Invoice opens its popup, nothing is submitted',
    { tag: ['@functional'] },
    async ({ signInAsSuperAdmin, pagesOn }) => {
      const { tab, error } = await signInAsSuperAdmin();
      expect(error, 'Super Admin signs in').toBeNull();
      const { failedInvoicePage } = pagesOn(tab);
      await failedInvoicePage.gotoByVin(record.vin);
      const row = failedInvoicePage.row(record.itemId);

      const viewer = await failedInvoicePage.openViewInvoice(row);
      expect(new URL(viewer.url()).pathname.endsWith('.pdf'), 'the new tab shows a PDF file').toBe(
        true,
      );
      await viewer.close();

      await failedInvoicePage.openUpdateSupplierInvoice(row);
      await expect(failedInvoicePage.uploadInvoiceDialog.title).toHaveText(text.updateDialogTitle);
      await failedInvoicePage.uploadInvoiceDialog.close();
    },
  );
});
