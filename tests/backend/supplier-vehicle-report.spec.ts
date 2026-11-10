import fs from 'node:fs';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import type { BackendListPage } from '@pages/backend/base/backend-list.page';
import type { SupplierVehicleRow } from '@pages/backend/reports/supplier-vehicle-report.page';
import { parseCsv } from '@utils/csv';
import { escapeRegExp } from '@utils/text';
import {
  auctionStages,
  inspectionStages,
  liveList,
  stageLists,
  supplierVehicleText,
  supplierVehicleUrls,
  suspendedList,
} from '@test-data/backend-supplier-vehicle-report.data';

// Report > Supplier Vehicle (/backend/report/supplier-vehicle-report/index): per supplier, how
// many vehicles sit in each auction and inspection stage. Read-only. The counts are checked
// against each other for every active supplier, and against the auction lists themselves for
// the supplier with the most vehicles.

test.use(devRootSession);

const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);

/** The list page object behind each stage the report counts. */
const stagePage = (pages: BackendPages, stage: string): BackendListPage =>
  ({
    'Ready For Pricing': pages.readyForPricingPage,
    'Pricing Done': pages.pricingDonePage,
    Upcoming: pages.upcomingPage,
    Awaiting: pages.awaitingPage,
    Failed: pages.failedPage,
    Suspended: pages.suspendedVehiclesPage,
    Live: pages.livePage,
  })[stage]!;

/**
 * Total of a Backend list filtered to one supplier. The list must answer 200 and show its grid,
 * so an error page, a 403 or a redirect to login fails instead of reading as 0 vehicles.
 */
async function listTotal(list: BackendListPage, form: string, supplierId: string) {
  const status = await list.gotoWithQuery({ [`${form}[supplier_id]`]: supplierId });
  expect(status, 'list HTTP status').toBe(200);
  await expect(list.grid, 'the list shows its grid').toBeVisible();
  return list.totalCount();
}

/** Names of the suppliers breaking a rule, for a readable failure message. */
const breaking = (rows: SupplierVehicleRow[], holds: (row: SupplierVehicleRow) => boolean) =>
  rows.filter((row) => !holds(row)).map((row) => `#${row.id} ${row.name}`);

test.describe('Backend - Supplier Vehicle report', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, supplierVehicleReportPage }) => {
    await supplierVehicleReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(supplierVehicleUrls.list);
  });

  test(
    'Report shows the heading, filters and one row per active supplier',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierVehicleReportPage: report }) => {
      await expect(page).toHaveTitle(supplierVehicleText.pageTitle);
      await expect(report.pageHeading).toHaveText(supplierVehicleText.pageTitle);
      await expect(report.breadcrumbCurrent).toHaveText(supplierVehicleText.pageTitle);
      await expect(report.sidebarLink).toHaveText(supplierVehicleText.sidebarLabel);

      // Supplier Status starts on Active.
      await expect(report.statusValue).toContainText('Active');
      await expect(report.columnHeaders).toHaveText([...supplierVehicleText.columnHeaders]);
      await expect(report.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
      await expect(report.exportAllButton).toBeVisible();

      const statuses = (await report.readRows()).map((row) => row.status);
      expect(statuses.filter((status) => status !== 'active')).toEqual([]);
    },
  );

  test.describe('counts add up (every active supplier)', () => {
    test(
      'Count Auction is the sum of the auction stages',
      { tag: '@functional' },
      async ({ supplierVehicleReportPage: report }) => {
        const rows = await report.readAllRows();

        expect(breaking(rows, (row) => row.auction === sum(row.auctionDetails))).toEqual([]);
      },
    );

    test(
      'Count Inspection is the sum of the inspection stages',
      { tag: '@functional' },
      async ({ supplierVehicleReportPage: report }) => {
        const rows = await report.readAllRows();

        expect(breaking(rows, (row) => row.inspection === sum(row.inspectionDetails))).toEqual([]);
      },
    );

    test(
      'Count All is Auction + Inspection + Suspended',
      { tag: ['@functional', '@known-bug'] },
      async ({ supplierVehicleReportPage: report }) => {
        // Known bug (found 2026-11-09): for some suppliers Count All is higher than its parts, e.g.
        // #1927: 4,182 vs 4,096 + 1 + 83 = 4,180, and #27302: 142 vs 128 + 9 + 2 = 139. Remove
        // test.fail() once Count All matches its parts (or the report shows the missing stage).
        test.fail(
          true,
          'BUG-PENDING: Known bug: Count All is higher than its parts for some suppliers.',
        );
        const rows = await report.readAllRows();

        expect(
          breaking(rows, (row) => row.all === row.auction + row.inspection + row.suspended),
        ).toEqual([]);
      },
    );
  });

  test.describe('counts match the auction lists (supplier with the most vehicles)', () => {
    let top: SupplierVehicleRow;

    test.beforeEach(async ({ supplierVehicleReportPage: report }) => {
      await report.gotoFiltered({ sort: '-union_count_all' });
      [top] = await report.readRows();
    });

    for (const list of stageLists) {
      test(
        `${list.stage} count equals the ${list.stage} list`,
        { tag: '@functional' },
        async ({ pagesOn, page }) => {
          const total = await listTotal(stagePage(pagesOn(page), list.stage), list.form, top.id);

          expect(total, `${list.stage} vehicles of supplier #${top.id}`).toBe(
            top.auctionDetails[list.stage],
          );
        },
      );
    }

    test(
      'Count Suspended equals the Suspended Vehicles list',
      { tag: '@functional' },
      async ({ suspendedVehiclesPage }) => {
        const total = await listTotal(suspendedVehiclesPage, suspendedList.form, top.id);

        expect(total, `suspended vehicles of supplier #${top.id}`).toBe(top.suspended);
      },
    );

    test(
      'Live count equals the Live list',
      { tag: ['@functional', '@known-bug'] },
      async ({ livePage }) => {
        // Known bug (found 2026-11-09): the report's Live count is higher than the Live list, e.g.
        // supplier #141: report 34, Live list 5; #782: report 5, Live list 0. Remove test.fail()
        // once the report counts only vehicles that are live.
        test.fail(
          true,
          'BUG-PENDING: Known bug: the report counts more Live vehicles than the Live list.',
        );
        const total = await listTotal(livePage, liveList.form, top.id);

        expect(total, `live vehicles of supplier #${top.id}`).toBe(top.auctionDetails.Live);
      },
    );
  });

  test.describe('filters', () => {
    test(
      'Supplier Status: All = Active + Inactive',
      { tag: '@functional' },
      async ({ supplierVehicleReportPage: report }) => {
        await report.gotoFiltered({ status: 'all' });
        const all = await report.totalCount();
        await report.gotoFiltered({ status: 'active' });
        const active = await report.totalCount();
        await report.gotoFiltered({ status: 'inactive' });
        const inactive = await report.totalCount();
        const statuses = (await report.readRows()).map((row) => row.status);

        expect(statuses.filter((status) => status !== 'inactive')).toEqual([]);
        expect(active + inactive).toBe(all);
      },
    );

    for (const haveInspection of [true, false]) {
      test(
        `Have Inspection "${haveInspection ? 'Yes' : 'No'}"`,
        { tag: '@functional' },
        async ({ supplierVehicleReportPage: report }) => {
          await report.gotoFiltered({ status: 'all', haveInspection });
          const rows = await report.readAllRows();

          expect(rows.length).toBeGreaterThan(0);
          expect(breaking(rows, (row) => row.inspection > 0 === haveInspection)).toEqual([]);
        },
      );
    }

    for (const haveAuction of [true, false]) {
      test(
        `Have Auction "${haveAuction ? 'Yes' : 'No'}"`,
        { tag: '@functional' },
        async ({ supplierVehicleReportPage: report }) => {
          await report.gotoFiltered({ status: 'all', haveAuction });
          const rows = await report.readAllRows();

          expect(rows.length).toBeGreaterThan(0);
          expect(breaking(rows, (row) => row.auction > 0 === haveAuction)).toEqual([]);
        },
      );
    }

    test(
      'Supplier shows that supplier only',
      { tag: '@functional' },
      async ({ supplierVehicleReportPage: report }) => {
        const [first] = await report.readRows();

        await report.filterBySupplier(
          new RegExp(`^\\s*${escapeRegExp(first.name)} - Supplier\\s*$`),
        );

        await expect(report.supplierValue).toContainText(first.name);
        await expect(report.rows).toHaveCount(1);
        await expect(report.row(first.id)).toHaveCount(1);
      },
    );
  });

  test(
    'Count All sorts ascending, then descending',
    { tag: '@functional' },
    async ({ page, supplierVehicleReportPage: report }) => {
      await report.sortByCountAll();
      await expect(page).toHaveURL(/[?&]sort=union_count_all(&|$)/);
      const ascending = (await report.readRows()).map((row) => row.all);
      expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

      await report.sortByCountAll();
      await expect(page).toHaveURL(/[?&]sort=-union_count_all(&|$)/);
      const descending = (await report.readRows()).map((row) => row.all);
      expect(descending).toEqual([...descending].sort((a, b) => b - a));
    },
  );

  test(
    'Export CSV downloads every supplier with the same counts',
    { tag: '@functional' },
    async ({ supplierVehicleReportPage: report }) => {
      const total = await report.totalCount();
      const [first] = await report.readRows();

      const download = await report.exportCsv();

      expect(download.suggestedFilename()).toMatch(supplierVehicleUrls.csvFileName);
      // parseCsv drops the byte order mark and keeps quoted line breaks inside one record.
      const [headers, ...records] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

      expect(headers).toEqual([...supplierVehicleText.csvHeaders]);
      expect(records.length, 'suppliers in the CSV').toBe(total);
      // The CSV has no Supplier Status or Pending Bulk column; the rest follows the grid.
      expect(records[0]).toEqual([
        first.name,
        ...[first.all, first.auction, first.inspection, first.suspended].map(String),
        ...auctionStages
          .filter((stage) => stage !== 'Pending Bulk')
          .map((s) => String(first.auctionDetails[s])),
        ...inspectionStages.map((stage) => String(first.inspectionDetails[stage])),
      ]);
    },
  );
});
