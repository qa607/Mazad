import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { escapeRegExp } from '@utils/text';
import {
  vehiclesReportData,
  vehiclesReportText,
  vehiclesReportUrls,
} from '@test-data/backend-vehicles-report.data';

// Report > Vehicles (/backend/report/item-report/index): one row per vehicle that went to
// auction, with how many auctions it entered and, once sold, its fees and commissions.
// Read-only, apart from the Excel exports the server generates for the export tests.

test.use(devRootSession);

test.describe('Backend - Vehicles report', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, vehiclesReportPage }) => {
    await vehiclesReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(vehiclesReportUrls.list);
  });

  test(
    'Report shows the heading, filters and the vehicles grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, vehiclesReportPage: report }) => {
      await expect(page).toHaveTitle(vehiclesReportText.pageTitle);
      await expect(report.pageHeading).toHaveText(vehiclesReportText.pageTitle);
      await expect(report.breadcrumbCurrent).toHaveText(vehiclesReportText.pageTitle);
      await expect(report.sidebarLink).toHaveText(vehiclesReportText.sidebarLabel);

      await expect(report.vinInput).toBeEditable();
      await expect(report.plateInput).toBeEditable();
      await expect(report.titleInput).toBeEditable();
      await expect(report.exportButton).toBeVisible();

      await expect(report.columnHeaders).toHaveText([...vehiclesReportText.columnHeaders]);
      await expect(report.summary).toHaveText(/^Showing 1-20 of [\d,]+ items\.$/);
    },
  );

  test.describe('rows (every vehicle on the first page)', () => {
    test(
      'Every vehicle entered at least one auction',
      { tag: '@functional' },
      async ({ vehiclesReportPage: report }) => {
        const counts = (await report.readRows()).map((row) => row.countAuction);

        expect(counts.filter((count) => !(count >= 1))).toEqual([]);
      },
    );

    test(
      'A sold vehicle lists its commissions and fees; an unsold one says it is not sold',
      { tag: '@functional' },
      async ({ vehiclesReportPage: report }) => {
        // Supplier 782 has both sold and unsold vehicles.
        await report.filterBySupplier(vehiclesReportData.supplierOption);
        const rows = await report.readRows();
        const sold = rows.filter((row) => row.fees !== vehiclesReportText.notSold);
        test.skip(sold.length === 0, 'No sold vehicle on the first page right now.');

        for (const row of sold) {
          for (const label of vehiclesReportText.soldFeeLabels) {
            expect(row.fees, `vehicle ${row.id}`).toMatch(new RegExp(`${label} [\\d,.]+ SR`));
          }
        }
      },
    );
  });

  test(
    'The test-auction vehicle shows the 2 auctions it entered, unsold',
    { tag: '@functional' },
    async ({ vehiclesReportPage: report }) => {
      const { vin, supplier, countAuction } = vehiclesReportData.knownVehicle;

      await report.searchByVin(vin);

      const [row] = await report.readRows();
      expect(row, `No vehicle with VIN ${vin} in the report.`).toBeDefined();
      expect(row).toMatchObject({ vin, supplier, countAuction, fees: vehiclesReportText.notSold });
    },
  );

  test.describe('filters', () => {
    test(
      'VIN: full, part, and unknown',
      { tag: '@negative' },
      async ({ vehiclesReportPage: report }) => {
        const [first] = await report.readRows();

        await test.step('full VIN', async () => {
          await report.searchByVin(first.vin);
          await expect(report.rows).toHaveCount(1);
          await expect(report.row(first.id)).toHaveCount(1);
        });
        await test.step('part of the VIN', async () => {
          const part = first.vin.slice(0, vehiclesReportData.partialVinLength);
          await report.searchByVin(part);
          await expect(report.row(first.id)).toHaveCount(1);
          const vins = (await report.readRows()).map((row) => row.vin);
          expect(vins.filter((vin) => !vin.includes(part))).toEqual([]);
        });
        await test.step('unknown VIN', async () => {
          await report.searchByVin(vehiclesReportData.unknownVin);
          await expect(report.emptyMessage).toHaveText(vehiclesReportText.noResults);
        });
      },
    );

    test(
      'Plate number shows that vehicle',
      { tag: '@functional' },
      async ({ vehiclesReportPage: report }) => {
        const [first] = await report.readRows();

        await report.searchByPlate(first.plate);

        await expect(report.row(first.id)).toHaveCount(1);
        const plates = (await report.readRows()).map((row) => row.plate);
        expect(plates.filter((plate) => plate !== first.plate)).toEqual([]);
      },
    );

    test(
      'Title, make and year show only matching vehicles',
      { tag: '@functional' },
      async ({ vehiclesReportPage: report }) => {
        const { titleSearch, make, year } = vehiclesReportData;

        await test.step(`title "${titleSearch}"`, async () => {
          await report.searchByTitle(titleSearch);
          const titles = (await report.readRows()).map((row) => row.title);
          expect(titles.length).toBeGreaterThan(0);
          expect(titles.filter((title) => !title.includes(titleSearch))).toEqual([]);
        });
        await test.step(`make ${make}`, async () => {
          await report.reset();
          await report.filterByMake(make);
          await expect(report.makeValue).toContainText(make);
          const titles = (await report.readRows()).map((row) => row.title);
          expect(
            titles.filter((title) => !new RegExp(`^${escapeRegExp(make)}\\b`, 'i').test(title)),
          ).toEqual([]);
        });
        await test.step(`year ${year}`, async () => {
          await report.reset();
          await report.filterByYear(year);
          await expect(report.yearValue).toContainText(year);
          const titles = (await report.readRows()).map((row) => row.title);
          expect(titles.filter((title) => !title.endsWith(year))).toEqual([]);
        });
      },
    );

    test(
      'Supplier shows only that supplier’s vehicles',
      { tag: '@functional' },
      async ({ vehiclesReportPage: report }) => {
        await report.filterBySupplier(vehiclesReportData.supplierOption);

        await expect(report.supplierValue).toContainText(vehiclesReportData.supplierName);
        const suppliers = (await report.readRows()).map((row) => row.supplier);
        expect(suppliers.length).toBeGreaterThan(0);
        expect(suppliers.filter((s) => s !== vehiclesReportData.supplierName)).toEqual([]);
      },
    );

    test(
      'Reset clears the filters',
      { tag: '@functional' },
      async ({ page, vehiclesReportPage: report }) => {
        const total = await report.totalCount();
        await report.searchByVin(vehiclesReportData.unknownVin);
        await expect(report.emptyMessage).toBeVisible();

        await report.reset();

        await expect(page).toHaveURL(vehiclesReportUrls.listUnfiltered);
        expect(await report.totalCount()).toBe(total);
      },
    );
  });

  test(
    'Count Auction sorts ascending, then descending',
    { tag: '@functional' },
    async ({ page, vehiclesReportPage: report }) => {
      await report.sortByCountAuction();
      await expect(page).toHaveURL(/[?&]sort=count_auction(&|$)/);
      const ascending = (await report.readRows()).map((row) => row.countAuction);
      expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

      await report.sortByCountAuction();
      await expect(page).toHaveURL(/[?&]sort=-count_auction(&|$)/);
      const descending = (await report.readRows()).map((row) => row.countAuction);
      expect(descending).toEqual([...descending].sort((a, b) => b - a));
      expect(descending[0]).toBeGreaterThanOrEqual(ascending[ascending.length - 1]);
    },
  );

  test.describe('export', () => {
    // One at a time: each export makes the server build a file.
    test.describe.configure({ mode: 'default' });

    test(
      'After a search, Export downloads the Excel file',
      { tag: '@functional' },
      async ({ vehiclesReportPage: report }) => {
        // A one-vehicle search keeps the server's export small.
        await report.searchByVin(vehiclesReportData.knownVehicle.vin);

        const { response, download } = await report.export();

        expect(response.status(), 'export HTTP status').toBe(200);
        await expect(report.alertTitle).toHaveText(vehiclesReportText.exportDone);
        expect(download, 'downloaded file').not.toBeNull();
        expect(download!.suggestedFilename()).toMatch(vehiclesReportUrls.exportFileName);
        // An .xlsx file is a zip archive: it starts with "PK".
        const start = fs
          .readFileSync(await download!.path())
          .subarray(0, 2)
          .toString();
        expect(start).toBe('PK');
      },
    );

    test(
      'Export works on a report opened from a link with one filter',
      { tag: ['@functional', '@known-bug'] },
      async ({ vehiclesReportPage: report }) => {
        // Known bug (found 2026-11-09): the export reads every filter from the page address, which
        // holds them all only after pressing Search. A report opened from a link with one filter
        // answers HTTP 500 with 'Undefined array key "supplier_id"' (then "make"...), plus the
        // server's file path and stack trace. Remove test.fail() once such an export works.
        // (The link keeps the export to one vehicle; an address with no filter at all exports
        // every vehicle, which is too heavy to run here.)
        test.fail(true, 'BUG-PENDING: Known bug: Export from a one-filter link answers HTTP 500.');
        await report.gotoWithQuery({
          [vehiclesReportData.vinFilter]: vehiclesReportData.knownVehicle.vin,
        });

        const { response } = await report.export();

        expect(response.status(), 'export HTTP status').toBe(200);
      },
    );

    test(
      'A failed export does not show server internals',
      { tag: ['@negative', '@known-bug'] },
      async ({ vehiclesReportPage: report }) => {
        // Known security bug (found 2026-11-09): the HTTP 500 of the one-filter export (above)
        // answers with the server's file path and stack trace. Remove test.fail() once errors
        // answer a generic message.
        test.fail(
          true,
          'BUG-PENDING: Known security bug: export errors show the file path and stack trace.',
        );
        await report.gotoWithQuery({
          [vehiclesReportData.vinFilter]: vehiclesReportData.knownVehicle.vin,
        });

        const { response } = await report.export();

        expect(await response.text(), 'export error body').not.toMatch(
          vehiclesReportData.serverInternals,
        );
      },
    );

    test(
      'The exported file cannot be downloaded without signing in',
      { tag: ['@negative', '@known-bug'] },
      async ({ browser, baseURL, vehiclesReportPage: report }) => {
        // Known security bug (found 2026-11-09): exports are saved at a predictable public address
        // (/backend/export/vehicle-report-<date>.xlsx) that answers the file with HTTP 200 to a
        // signed-out request. Remove test.fail() once exports require a signed-in session.
        test.fail(true, 'BUG-PENDING: Known security bug: exported files are public.');
        await report.searchByVin(vehiclesReportData.knownVehicle.vin);
        const { response } = await report.export();
        const { url: fileUrl } = (await response.json()) as { url: string };
        expect(fileUrl).toMatch(vehiclesReportUrls.exportFile);

        const signedOut = await browser.newContext({ baseURL });
        try {
          const answer = await signedOut.request.get(fileUrl, { maxRedirects: 0 });
          expect(answer.status(), 'signed-out request for the export file').not.toBe(200);
        } finally {
          await signedOut.close();
        }
      },
    );
  });
});
