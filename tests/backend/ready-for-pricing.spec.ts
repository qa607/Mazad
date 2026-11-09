import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  readyForPricingData,
  readyForPricingText,
  readyForPricingUrls,
} from '@test-data/backend-ready-for-pricing.data';
import { suspendedVehiclesText } from '@test-data/backend-suspended-vehicles.data';
import { gridSummary, listPageUrl } from '@test-data/backend-common.data';

// Pages open already signed in as Dev Root (logged in once per run by auth.setup.ts), with no
// trace or video; a failing test attaches a masked screenshot instead (see devRootSession).
test.use(devRootSession);

// Run this file's tests one after another in one worker, so the suspend round trip never
// changes the list while a read-only test is reading it.
test.describe.configure({ mode: 'default' });

const { pageSize } = readyForPricingData;
const firstPageSummary = gridSummary(1, pageSize);

test.describe('Backend - Ready For Pricing list', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, readyForPricingPage }) => {
    await readyForPricingPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(readyForPricingUrls.list);
  });

  test.describe('read-only', () => {
    test(
      'Page shows the heading, filters and the vehicles grid',
      { tag: ['@smoke', '@functional'] },
      async ({ page, readyForPricingPage }) => {
        await expect(page).toHaveTitle(readyForPricingText.pageTitle);
        await expect(readyForPricingPage.pageHeading).toHaveText(readyForPricingText.pageTitle);
        await expect(readyForPricingPage.breadcrumbCurrent).toHaveText(
          readyForPricingText.pageTitle,
        );
        await expect(readyForPricingPage.sidebarLink).toBeVisible();

        await expect(readyForPricingPage.vinInput).toBeEditable();
        await expect(readyForPricingPage.titleInput).toBeEditable();
        await expect(readyForPricingPage.searchButton).toBeEnabled();
        await expect(readyForPricingPage.resetButton).toBeVisible();

        await expect(readyForPricingPage.columnHeaders).toHaveText([
          ...readyForPricingText.columnHeaders,
        ]);
        await expect(readyForPricingPage.summary).toHaveText(firstPageSummary);
        await expect(readyForPricingPage.rows).toHaveCount(readyForPricingData.pageSize);
        await expect(readyForPricingPage.activePage).toHaveText('1');
        await expect(readyForPricingPage.bulkSuspendButton).toHaveClass(/\bdisabled\b/);
      },
    );

    test(
      'Searching by VIN shows only that vehicle',
      { tag: ['@functional'] },
      async ({ page, readyForPricingPage }) => {
        // The oldest vehicles are the least likely to be moved by another spec meanwhile.
        await readyForPricingPage.gotoSortedById();
        const vin = (
          await readyForPricingPage.rowVin(readyForPricingPage.rows.first()).innerText()
        ).trim();

        await readyForPricingPage.searchByVin(vin);

        await expect(page).toHaveURL(readyForPricingUrls.vinSearch);
        await expect(readyForPricingPage.vinInput).toHaveValue(vin);
        await expect(readyForPricingPage.vinCells.first()).toHaveText(vin);
        await expect(readyForPricingPage.vinCells.filter({ hasNotText: vin })).toHaveCount(0);
      },
    );

    test(
      'Searching for an unknown VIN shows no results',
      { tag: ['@negative'] },
      async ({ readyForPricingPage }) => {
        await readyForPricingPage.searchByVin(readyForPricingData.unknownVin);

        await expect(readyForPricingPage.emptyMessage).toHaveText(readyForPricingText.noResults);
        await expect(readyForPricingPage.rows).toHaveCount(0);
        await expect(readyForPricingPage.summary).toHaveCount(0);
      },
    );

    test(
      'Searching by title shows only matching vehicles',
      { tag: ['@functional'] },
      async ({ readyForPricingPage }) => {
        const title = readyForPricingData.titleSearch;

        await readyForPricingPage.searchByTitle(title);

        await expect(readyForPricingPage.titleInput).toHaveValue(title);
        await expect(readyForPricingPage.titleCells.first()).toContainText(title);
        await expect(readyForPricingPage.titleCells.filter({ hasNotText: title })).toHaveCount(0);
      },
    );

    test(
      'Filtering by city shows only vehicles in that city',
      { tag: ['@functional'] },
      async ({ page, readyForPricingPage }) => {
        const city = readyForPricingData.city;

        await readyForPricingPage.filterByCity(city);

        await expect(page).toHaveURL(readyForPricingUrls.citySearch);
        await expect(readyForPricingPage.cityValue).toHaveText(new RegExp(city));
        await expect(readyForPricingPage.cityCells.first()).toHaveText(city);
        await expect(readyForPricingPage.cityCells.filter({ hasNotText: city })).toHaveCount(0);
      },
    );

    test(
      'Filtering by year shows only vehicles of that year',
      { tag: ['@functional'] },
      async ({ page, readyForPricingPage }) => {
        const year = readyForPricingData.year;

        await readyForPricingPage.filterByYear(year);

        await expect(page).toHaveURL(readyForPricingUrls.yearSearch);
        await expect(readyForPricingPage.yearValue).toHaveText(new RegExp(year));
        await expect(readyForPricingPage.yearCells.first()).toHaveText(year);
        await expect(readyForPricingPage.yearCells.filter({ hasNotText: year })).toHaveCount(0);
      },
    );

    test(
      'Year header sorts ascending, then descending',
      { tag: ['@functional'] },
      async ({ page, readyForPricingPage }) => {
        await readyForPricingPage.sortByYear();

        await expect(page).toHaveURL(readyForPricingUrls.sortedBy('year'));
        const ascending = await readyForPricingPage.years();
        expect(ascending).toHaveLength(readyForPricingData.pageSize);
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await readyForPricingPage.sortByYear();

        await expect(page).toHaveURL(readyForPricingUrls.sortedBy('-year'));
        const descending = await readyForPricingPage.years();
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
        expect(descending[0]).toBeGreaterThanOrEqual(ascending[ascending.length - 1]);
      },
    );

    test(
      'Reset clears the filters and shows the full list again',
      { tag: ['@functional'] },
      async ({ page, readyForPricingPage }) => {
        await readyForPricingPage.searchByVin(readyForPricingData.unknownVin);
        await expect(readyForPricingPage.emptyMessage).toBeVisible();

        await readyForPricingPage.reset();

        // The total itself is not compared: the Suspended Vehicles spec may move a vehicle
        // into or out of this list at the same time.
        await expect(page).toHaveURL(readyForPricingUrls.unfiltered);
        await expect(readyForPricingPage.vinInput).toHaveValue('');
        await expect(readyForPricingPage.rows).toHaveCount(readyForPricingData.pageSize);
        await expect(readyForPricingPage.summary).toHaveText(firstPageSummary);
      },
    );

    test(
      'Page 2 shows the next 20 vehicles',
      { tag: ['@functional'] },
      async ({ page, readyForPricingPage }) => {
        await readyForPricingPage.goToPage(2);

        await expect(page).toHaveURL(listPageUrl(2));
        await expect(readyForPricingPage.activePage).toHaveText('2');
        await expect(readyForPricingPage.summary).toHaveText(
          gridSummary(pageSize + 1, 2 * pageSize),
        );
        await expect(readyForPricingPage.rows).toHaveCount(readyForPricingData.pageSize);
      },
    );

    test(
      'Every vehicle appears on exactly one page',
      { tag: ['@functional', '@known-bug'] },
      async ({ readyForPricingPage }) => {
        // Known bug (found 2026-11-08), as on the Suspended list: the default order is not
        // stable, so pages repeat some vehicles and never show others (422 rows listed, only
        // 372 distinct vehicles). Replace BUG-PENDING with the ticket ID; remove test.fail() once the list is ordered by a unique key.
        test.fail(true, 'BUG-PENDING: default list order repeats and hides vehicles across pages.');
        test.slow();

        const total = await readyForPricingPage.totalCount();
        const pageCount = Math.ceil(total / readyForPricingData.pageSize);
        const seen: string[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          await readyForPricingPage.gotoPage(pageNumber);
          seen.push(...(await readyForPricingPage.rowIds()));
        }

        expect(seen).toHaveLength(total);
        expect(new Set(seen).size, 'distinct vehicles across all pages').toBe(total);
      },
    );

    test(
      'Bulk Suspend is enabled only while a vehicle is selected',
      { tag: ['@functional'] },
      async ({ readyForPricingPage }) => {
        const checkbox = readyForPricingPage.rowCheckbox(readyForPricingPage.rows.first());

        await expect(readyForPricingPage.bulkSuspendButton).toHaveClass(/\bdisabled\b/);

        await checkbox.check();
        await expect(readyForPricingPage.bulkSuspendButton).not.toHaveClass(/\bdisabled\b/);

        await checkbox.uncheck();
        await expect(readyForPricingPage.bulkSuspendButton).toHaveClass(/\bdisabled\b/);
      },
    );

    test(
      'Suspending without a reason is rejected, and Close keeps the vehicle',
      { tag: ['@negative'] },
      async ({ page, readyForPricingPage }) => {
        const vehicleId = await readyForPricingPage.rowId(readyForPricingPage.rows.first());

        await readyForPricingPage.openSuspendModal(vehicleId);
        await expect(readyForPricingPage.suspendModalTitle).toHaveText(
          readyForPricingText.suspendModalTitle,
        );
        await expect(readyForPricingPage.suspendReasonLabels).toHaveText([
          ...readyForPricingText.suspendReasons,
        ]);

        await readyForPricingPage.suspendModalSubmitButton.click();

        await expect(readyForPricingPage.suspendReasonError).toHaveText(
          readyForPricingText.reasonRequired,
        );
        await expect(readyForPricingPage.suspendModal).toBeVisible();
        await expect(readyForPricingPage.resultAlert).toHaveCount(0);

        await readyForPricingPage.suspendModalCloseButton.click();

        await expect(readyForPricingPage.suspendModal).toBeHidden();
        await page.reload();
        await expect(readyForPricingPage.row(vehicleId)).toHaveCount(1);
      },
    );
  });

  test.describe('suspend and reactivate', { tag: ['@mutates'] }, () => {
    // Suspends one vehicle, then activates it again, so staging ends as it started. Never
    // retried: a retry would pick and change a second vehicle.
    test.describe.configure({ retries: 0 });

    /** Vehicle suspended by the test and not yet reactivated. */
    let pendingRestore: { id: string; vin: string } | null = null;

    // If the test fails after suspending, reactivate the vehicle.
    test.afterEach(async ({ suspendedVehiclesPage }) => {
      if (!pendingRestore) return;
      const { id, vin } = pendingRestore;
      pendingRestore = null;
      await suspendedVehiclesPage.goto();
      await suspendedVehiclesPage.searchByVin(vin);
      if ((await suspendedVehiclesPage.row(id).count()) === 0) return;
      await suspendedVehiclesPage.activate(id);
      await suspendedVehiclesPage.resultAlertOkButton.click();
    });

    test(
      'Suspending a vehicle moves it to the Suspended list, and activating returns it',
      { tag: ['@functional'] },
      async ({ readyForPricingPage, suspendedVehiclesPage }) => {
        const reason = readyForPricingData.roundTripReason;
        // The oldest vehicle: the Suspended Vehicles spec's round trip uses recent ones.
        await readyForPricingPage.gotoSortedById();
        const row = readyForPricingPage.rows.first();
        const vehicleId = await readyForPricingPage.rowId(row);
        const vin = (await readyForPricingPage.rowVin(row).innerText()).trim();

        await readyForPricingPage.suspend(vehicleId, reason);
        pendingRestore = { id: vehicleId, vin };

        await expect(readyForPricingPage.resultAlertTitle).toHaveText(
          readyForPricingText.suspended,
        );
        await readyForPricingPage.resultAlertOkButton.click();
        await expect(readyForPricingPage.row(vehicleId)).toHaveCount(0);

        // The vehicle is now in the Suspended list, with the chosen reason.
        await suspendedVehiclesPage.goto();
        await suspendedVehiclesPage.searchByVin(vin);
        await expect(suspendedVehiclesPage.row(vehicleId)).toHaveCount(1);
        await expect(suspendedVehiclesPage.suspendReasonCells).toHaveText([reason]);

        // Activating it returns it to Ready For Pricing.
        await suspendedVehiclesPage.activate(vehicleId);
        await expect(suspendedVehiclesPage.resultAlertTitle).toHaveText(
          suspendedVehiclesText.changesSaved,
        );
        await suspendedVehiclesPage.resultAlertOkButton.click();
        pendingRestore = null;
        await expect(suspendedVehiclesPage.row(vehicleId)).toHaveCount(0);

        await readyForPricingPage.goto();
        await readyForPricingPage.searchByVin(vin);
        await expect(readyForPricingPage.row(vehicleId)).toHaveCount(1);
      },
    );
  });
});
