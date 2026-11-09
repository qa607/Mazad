import type { Page } from '@playwright/test';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { expect, test } from '@fixtures/test.fixture';
import {
  type AccessProfile,
  backendHomePath,
  expectedAccess,
  forbiddenStatus,
} from '@test-data/backend-permissions.data';
import {
  expectedReportAccess,
  otherSupplierIds,
  type ReportPage,
  reportPages,
  supplierAccountId,
  supplierReports,
} from '@test-data/backend-report-permissions.data';

// Who can open each Report page. Dev Root always runs; every other role runs only when its test
// account is set in .env, and is skipped otherwise. For the supplier, it also checks that each
// report it opens is limited to its own data. Read-only.

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const profiles = Object.keys(expectedReportAccess) as AccessProfile[];
const reportKeys = Object.keys(reportPages) as ReportPage[];

/** Total of a Backend grid ("Showing 1-20 of 531 items." -> 531), 0 when it lists nothing. */
async function gridTotal(page: Page): Promise<number> {
  const summary = page.locator('.grid-view .summary').first();
  if ((await summary.count()) === 0) return 0;
  return Number((await summary.locator('b').last().innerText()).replace(/\D/g, ''));
}

for (const profile of profiles) {
  const allowed = expectedReportAccess[profile];

  test.describe(`Report permissions - ${expectedAccess[profile].label}`, () => {
    test.use({ signedInAs: profile });

    for (const report of reportKeys) {
      const { label, path } = reportPages[report];
      const canOpen = allowed.includes(report);

      test(`${canOpen ? 'can' : 'cannot'} open the ${label} report`, async ({ page }) => {
        const response = await page.goto(path);

        expect(response?.status(), `${label} HTTP status`).toBe(canOpen ? 200 : forbiddenStatus);
      });
    }

    test('the Report menu lists exactly the reports the role can open', async ({ page }) => {
      await page.goto(backendHomePath);
      const menu = page.locator('.app-sidebar a[href^="/backend/report/"]');

      await expect(menu).toHaveText(allowed.map((report) => reportPages[report].label));
    });
  });
}

test.describe('Report permissions - Supplier sees only its own data', () => {
  test.use({ signedInAs: 'supplier' });

  for (const { report, form } of supplierReports) {
    const { label, path } = reportPages[report];
    const filterName = `${form}[supplier_id]`;

    test(`${label}: lists as many rows as Dev Root sees for this supplier`, async ({
      page,
      browser,
      baseURL,
    }) => {
      await page.goto(path);
      const own = await gridTotal(page);

      const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
      try {
        const staffPage = await staff.newPage();
        await staffPage.goto(`${path}?${encodeURIComponent(filterName)}=${supplierAccountId}`);
        expect(own, `${label} rows for supplier ${supplierAccountId}`).toBe(
          await gridTotal(staffPage),
        );
      } finally {
        await staff.close();
      }
    });

    test(`${label}: another supplier's ID in the address changes nothing`, async ({ page }) => {
      await page.goto(path);
      const ownIds = await page
        .locator('.grid-view tbody tr[data-key]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key')));
      const own = await gridTotal(page);

      for (const other of otherSupplierIds) {
        await test.step(`supplier ${other}`, async () => {
          await page.goto(`${path}?${encodeURIComponent(filterName)}=${other}`);
          expect(await gridTotal(page), 'rows listed').toBe(own);
          const ids = await page
            .locator('.grid-view tbody tr[data-key]')
            .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key')));
          expect(ids).toEqual(ownIds);
        });
      }
    });

    test(`${label}: the Supplier filter offers no other supplier`, async ({ page }) => {
      // Known gap (found 2026-11-09): a supplier sees the Supplier filter with every other
      // supplier's name (e.g. 335 in Auction Closed), although choosing one changes nothing.
      // Remove test.fail() once the filter is hidden for suppliers or lists only their own.
      test.fail(true, 'Known gap: suppliers see the names of all other suppliers.');
      await page.goto(path);

      const options = await page
        .locator(`select[name="${filterName}"] option`)
        .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
      const others = options.filter((value) => value && value !== supplierAccountId);
      expect(others, 'other suppliers offered').toEqual([]);
    });
  }
});
