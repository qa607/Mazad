import { DEV_ROOT_SESSION_FILE, getSupplierAccountId } from '@config/credentials.config';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
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
  supplierReports,
} from '@test-data/backend-report-permissions.data';

// Who can open each Report page. Dev Root always runs; every other role runs only when its test
// account is set in .env, and is skipped otherwise. For the supplier, it also checks that each
// report it opens is limited to its own data. Read-only.

test.use(devRootSession);

const profiles = Object.keys(expectedReportAccess) as AccessProfile[];
const reportKeys = Object.keys(reportPages) as ReportPage[];

for (const profile of profiles) {
  const allowed = expectedReportAccess[profile];

  test.describe(
    `Report permissions - ${expectedAccess[profile].label}`,
    { tag: '@regression' },
    () => {
      test.use({ signedInAs: profile });

      for (const report of reportKeys) {
        const { label, path } = reportPages[report];
        const canOpen = allowed.includes(report);

        test(
          `${canOpen ? 'can' : 'cannot'} open the ${label} report`,
          { tag: '@negative' },
          async ({ reportGrid }) => {
            expect(await reportGrid.open(path), `${label} HTTP status`).toBe(
              canOpen ? 200 : forbiddenStatus,
            );
          },
        );
      }

      test(
        'the Report menu lists exactly the reports the role can open',
        { tag: '@functional' },
        async ({ page, mazadDashboardPage }) => {
          await page.goto(backendHomePath);

          await expect(mazadDashboardPage.sidebarLinksUnder('/backend/report/')).toHaveText(
            allowed.map((report) => reportPages[report].label),
          );
        },
      );
    },
  );
}

test.describe(
  'Report permissions - Supplier sees only its own data',
  { tag: '@regression' },
  () => {
    test.use({ signedInAs: 'supplier' });

    for (const { report, form } of supplierReports) {
      const { label, path } = reportPages[report];
      const filterName = `${form}[supplier_id]`;

      test(
        `${label}: lists the same rows Dev Root sees for this supplier`,
        { tag: ['@functional', '@negative'] },
        async ({ reportGrid, browser, baseURL, pagesOn }) => {
          const supplierId = getSupplierAccountId()!;

          await test.step('The supplier opens its own report', async () => {
            expect(await reportGrid.open(path), `${label} HTTP status`).toBe(200);
            await expect(reportGrid.grid, 'the report shows its grid').toBeVisible();
          });
          const own = (await reportGrid.totalCount())!;
          // An empty report proves nothing about isolation: the check needs supplier data.
          expect(own, `${label}: the supplier must have rows for this check`).toBeGreaterThan(0);
          const ownIds = await reportGrid.rowIds();

          const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
          try {
            const staffGrid = pagesOn(await staff.newPage()).reportGrid;
            expect(await staffGrid.open(path, { [filterName]: supplierId })).toBe(200);
            await expect(staffGrid.grid).toBeVisible();

            expect(own, `${label} rows for supplier ${supplierId}`).toBe(
              await staffGrid.totalCount(),
            );
            // When everything fits on one page, the very same records must be listed.
            if (ownIds.length === own) {
              expect([...ownIds].sort(), 'same records as Dev Root').toEqual(
                (await staffGrid.rowIds()).sort(),
              );
            }
          } finally {
            await staff.close();
          }
        },
      );

      test(
        `${label}: another supplier's ID in the address changes nothing`,
        { tag: '@negative' },
        async ({ reportGrid }) => {
          expect(await reportGrid.open(path), `${label} HTTP status`).toBe(200);
          await expect(reportGrid.grid).toBeVisible();
          const own = (await reportGrid.totalCount())!;
          expect(own, `${label}: the supplier must have rows for this check`).toBeGreaterThan(0);
          const ownIds = await reportGrid.rowIds();

          for (const other of otherSupplierIds) {
            await test.step(`supplier ${other}`, async () => {
              expect(await reportGrid.open(path, { [filterName]: other })).toBe(200);
              await expect(reportGrid.grid).toBeVisible();
              expect(await reportGrid.totalCount(), 'rows listed').toBe(own);
              expect(await reportGrid.rowIds()).toEqual(ownIds);
            });
          }
        },
      );

      test(
        `${label}: the Supplier filter offers no other supplier`,
        { tag: ['@negative', '@known-bug'] },
        async ({ reportGrid }) => {
          // Known security gap (found 2026-11-09): a supplier sees the Supplier filter with every
          // other supplier's name (e.g. 335 in Auction Closed), although choosing one changes
          // nothing. Remove test.fail() once the filter is hidden for suppliers or lists only
          // their own.
          // Read before test.fail(): a missing SUPPLIER_ID must fail, not pass as expected.
          const supplierId = getSupplierAccountId()!;
          test.fail(true, 'BUG-PENDING: Known security gap: suppliers see all supplier names.');
          expect(await reportGrid.open(path)).toBe(200);

          const options = await reportGrid.filterOptionValues(filterName);
          const others = options.filter((value) => value && value !== supplierId);
          expect(others, 'other suppliers offered').toEqual([]);
        },
      );
    }
  },
);
