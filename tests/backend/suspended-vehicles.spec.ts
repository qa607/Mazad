import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { readyForPricingText } from '@test-data/backend-ready-for-pricing.data';
import {
  suspendedVehiclesData,
  suspendedVehiclesText,
  suspendedVehiclesUrls,
} from '@test-data/backend-suspended-vehicles.data';
import { gridSummary, listPageUrl } from '@test-data/backend-common.data';

const { pageSize } = suspendedVehiclesData;

// Pages open already signed in as Dev Root (logged in once per run by auth.setup.ts), with no
// trace or video; a failing test attaches a masked screenshot instead (see devRootSession).
test.use(devRootSession);

// Run this file's tests one after another in one worker, so the activation test never
// changes the list while a read-only test is reading it.
test.describe.configure({ mode: 'default' });

test.describe('Backend - Suspended Vehicles list', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, suspendedVehiclesPage }) => {
    await suspendedVehiclesPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(suspendedVehiclesUrls.list);
  });

  test.describe('read-only', () => {
    test(
      'Page shows the heading, filters and the suspended vehicles grid',
      { tag: ['@smoke', '@functional'] },
      async ({ page, suspendedVehiclesPage }) => {
        await expect(page).toHaveTitle(suspendedVehiclesText.pageTitle);
        await expect(suspendedVehiclesPage.pageHeading).toHaveText(suspendedVehiclesText.pageTitle);
        await expect(suspendedVehiclesPage.breadcrumbCurrent).toHaveText(
          suspendedVehiclesText.pageTitle,
        );
        await expect(suspendedVehiclesPage.sidebarLink).toBeVisible();

        await expect(suspendedVehiclesPage.vinInput).toBeEditable();
        await expect(suspendedVehiclesPage.searchButton).toBeEnabled();
        await expect(suspendedVehiclesPage.resetButton).toBeVisible();

        await expect(suspendedVehiclesPage.columnHeaders).toHaveText([
          ...suspendedVehiclesText.columnHeaders,
        ]);
        await expect(suspendedVehiclesPage.summary).toHaveText(gridSummary(1, pageSize));
        await expect(suspendedVehiclesPage.rows).toHaveCount(suspendedVehiclesData.pageSize);
        await expect(suspendedVehiclesPage.activePage).toHaveText('1');
      },
    );

    test(
      'Searching by VIN shows only that vehicle',
      { tag: ['@functional'] },
      async ({ page, suspendedVehiclesPage }) => {
        // A locked ("Inactive supplier") vehicle, which no other test activates meanwhile.
        const row = suspendedVehiclesPage.lockedRows.first();
        const vin = (await suspendedVehiclesPage.rowVin(row).innerText()).trim();

        await suspendedVehiclesPage.searchByVin(vin);

        await expect(page).toHaveURL(suspendedVehiclesUrls.vinSearch);
        await expect(suspendedVehiclesPage.vinInput).toHaveValue(vin);
        await expect(suspendedVehiclesPage.vinCells.first()).toHaveText(vin);
        await expect(suspendedVehiclesPage.vinCells.filter({ hasNotText: vin })).toHaveCount(0);
      },
    );

    test(
      'Searching for an unknown VIN shows no results',
      { tag: ['@negative'] },
      async ({ suspendedVehiclesPage }) => {
        await suspendedVehiclesPage.searchByVin(suspendedVehiclesData.unknownVin);

        await expect(suspendedVehiclesPage.emptyMessage).toHaveText(
          suspendedVehiclesText.noResults,
        );
        await expect(suspendedVehiclesPage.rows).toHaveCount(0);
        await expect(suspendedVehiclesPage.summary).toHaveCount(0);
      },
    );

    test(
      'Filtering by suspend reason shows only vehicles with that reason',
      { tag: ['@functional'] },
      async ({ page, suspendedVehiclesPage }) => {
        const reason = suspendedVehiclesData.filterReason;

        await suspendedVehiclesPage.filterBySuspendReason(reason);

        await expect(page).toHaveURL(suspendedVehiclesUrls.reasonSearch);
        await expect(suspendedVehiclesPage.suspendReasonValue).toHaveText(new RegExp(reason));
        await expect(suspendedVehiclesPage.suspendReasonCells.first()).toHaveText(reason);
        await expect(
          suspendedVehiclesPage.suspendReasonCells.filter({ hasNotText: reason }),
        ).toHaveCount(0);
      },
    );

    test(
      'Reset clears the filters and shows the full list again',
      { tag: ['@functional'] },
      async ({ page, suspendedVehiclesPage }) => {
        await suspendedVehiclesPage.searchByVin(suspendedVehiclesData.unknownVin);
        await expect(suspendedVehiclesPage.emptyMessage).toBeVisible();

        await suspendedVehiclesPage.reset();

        // The total itself is not compared: the Ready For Pricing spec may suspend or
        // reactivate a vehicle at the same time.
        await expect(page).toHaveURL(suspendedVehiclesUrls.unfiltered);
        await expect(suspendedVehiclesPage.vinInput).toHaveValue('');
        await expect(suspendedVehiclesPage.rows).toHaveCount(suspendedVehiclesData.pageSize);
        await expect(suspendedVehiclesPage.summary).toHaveText(gridSummary(1, pageSize));
      },
    );

    test(
      'Page 2 shows the next 20 vehicles',
      { tag: ['@functional'] },
      async ({ page, suspendedVehiclesPage }) => {
        await suspendedVehiclesPage.goToPage(2);

        await expect(page).toHaveURL(listPageUrl(2));
        await expect(suspendedVehiclesPage.activePage).toHaveText('2');
        await expect(suspendedVehiclesPage.summary).toHaveText(
          gridSummary(pageSize + 1, 2 * pageSize),
        );
        await expect(suspendedVehiclesPage.rows).toHaveCount(suspendedVehiclesData.pageSize);
      },
    );

    test(
      'Every suspended vehicle appears on exactly one page',
      { tag: ['@functional', '@known-bug'] },
      async ({ suspendedVehiclesPage }) => {
        // Known bug (found 2026-11-05): the default order is not stable, so pages repeat some
        // vehicles and never show others (866 rows listed, only 745 distinct vehicles).
        // Replace BUG-PENDING with the ticket ID; remove test.fail() once the list is ordered by a unique key.
        test.fail(true, 'BUG-PENDING: default list order repeats and hides vehicles across pages.');
        test.slow();

        const total = await suspendedVehiclesPage.totalCount();
        const pageCount = Math.ceil(total / suspendedVehiclesData.pageSize);
        const seen: string[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          await suspendedVehiclesPage.gotoPage(pageNumber);
          seen.push(...(await suspendedVehiclesPage.rowIds()));
        }

        expect(seen).toHaveLength(total);
        expect(new Set(seen).size, 'distinct vehicles across all pages').toBe(total);
      },
    );

    test(
      'Bulk Activate and Delete are enabled only while a vehicle is selected',
      { tag: ['@functional'] },
      async ({ suspendedVehiclesPage }) => {
        await suspendedVehiclesPage.filterBySuspendReason(suspendedVehiclesData.filterReason);
        const checkbox = suspendedVehiclesPage.rowCheckbox(
          suspendedVehiclesPage.activatableRows.first(),
        );

        await expect(suspendedVehiclesPage.bulkActivateButton).toHaveClass(/\bdisabled\b/);
        await expect(suspendedVehiclesPage.bulkDeleteButton).toHaveClass(/\bdisabled\b/);

        await checkbox.check();
        await expect(suspendedVehiclesPage.bulkActivateButton).not.toHaveClass(/\bdisabled\b/);
        await expect(suspendedVehiclesPage.bulkDeleteButton).not.toHaveClass(/\bdisabled\b/);

        await checkbox.uncheck();
        await expect(suspendedVehiclesPage.bulkActivateButton).toHaveClass(/\bdisabled\b/);
        await expect(suspendedVehiclesPage.bulkDeleteButton).toHaveClass(/\bdisabled\b/);
      },
    );

    test(
      'Cancelling the activate confirmation keeps the vehicle suspended',
      { tag: ['@functional'] },
      async ({ page, suspendedVehiclesPage }) => {
        await suspendedVehiclesPage.filterBySuspendReason(suspendedVehiclesData.filterReason);
        const row = suspendedVehiclesPage.activatableRows.first();
        const vehicleId = await suspendedVehiclesPage.rowId(row);
        const submissions = suspendedVehiclesPage.countActivateSubmissions(
          suspendedVehiclesUrls.activateEndpoint,
        );

        await suspendedVehiclesPage.openActivateConfirmation(row);
        await expect(suspendedVehiclesPage.confirmModalTitle).toHaveText(
          suspendedVehiclesText.activateConfirmTitle,
        );
        await expect(suspendedVehiclesPage.confirmModalMessage).toHaveText(
          suspendedVehiclesText.activateConfirmMessage,
        );
        await suspendedVehiclesPage.confirmCancelButton.click();

        await expect(suspendedVehiclesPage.confirmModal).toBeHidden();
        expect(submissions()).toBe(0);
        await page.reload();
        await expect(suspendedVehiclesPage.row(vehicleId)).toHaveCount(1);
      },
    );
  });

  test.describe('activation', { tag: ['@mutates'] }, () => {
    // Activates one suspended vehicle, then suspends it again with the same reason, so staging
    // ends as it started. Never retried: a retry would pick and change a second vehicle.
    test.describe.configure({ retries: 0 });

    /** Vehicle activated by the test and not yet suspended again. */
    let pendingRestore: { id: string; vin: string } | null = null;

    // If the test fails after activating, put the vehicle back in the suspended list.
    test.afterEach(async ({ readyForPricingPage }) => {
      if (!pendingRestore) return;
      const { id, vin } = pendingRestore;
      pendingRestore = null;
      await readyForPricingPage.goto();
      await readyForPricingPage.searchByVin(vin);
      if ((await readyForPricingPage.row(id).count()) === 0) return;
      await readyForPricingPage.suspend(id, suspendedVehiclesData.activationReason);
      await readyForPricingPage.resultAlertOkButton.click();
    });

    test(
      'Activating a vehicle moves it to Ready For Pricing, and suspending returns it',
      { tag: ['@functional'] },
      async ({ suspendedVehiclesPage, readyForPricingPage }) => {
        await suspendedVehiclesPage.filterBySuspendReason(suspendedVehiclesData.activationReason);
        const row = suspendedVehiclesPage.activatableRows.first();
        await expect(
          row,
          'No vehicle left to activate in this reason group; pick another group in the test data.',
        ).toBeVisible();
        const vehicleId = await suspendedVehiclesPage.rowId(row);
        const vin = (await suspendedVehiclesPage.rowVin(row).innerText()).trim();
        const totalBefore = await suspendedVehiclesPage.totalCount();

        await suspendedVehiclesPage.openActivateConfirmation(row);
        await expect(suspendedVehiclesPage.confirmModalTitle).toHaveText(
          suspendedVehiclesText.activateConfirmTitle,
        );
        await suspendedVehiclesPage.confirmYesButton.click();
        pendingRestore = { id: vehicleId, vin };

        await expect(suspendedVehiclesPage.resultAlertTitle).toHaveText(
          suspendedVehiclesText.changesSaved,
        );
        await expect(suspendedVehiclesPage.resultAlertSuccessIcon).toBeVisible();
        await suspendedVehiclesPage.resultAlertOkButton.click();

        await expect(suspendedVehiclesPage.row(vehicleId)).toHaveCount(0);
        await expect.poll(() => suspendedVehiclesPage.totalCount()).toBe(totalBefore - 1);

        // The vehicle is no longer suspended at all, not just hidden by the current filter.
        await suspendedVehiclesPage.reset();
        await suspendedVehiclesPage.searchByVin(vin);
        await expect(suspendedVehiclesPage.emptyMessage).toHaveText(
          suspendedVehiclesText.noResults,
        );

        // An activated vehicle goes to the Ready For Pricing auction list.
        await readyForPricingPage.goto();
        await readyForPricingPage.searchByVin(vin);
        await expect(readyForPricingPage.row(vehicleId)).toHaveCount(1);

        // Suspending it again with the same reason returns it to the suspended list.
        await readyForPricingPage.suspend(vehicleId, suspendedVehiclesData.activationReason);
        await expect(readyForPricingPage.resultAlertTitle).toHaveText(
          readyForPricingText.suspended,
        );
        await readyForPricingPage.resultAlertOkButton.click();
        pendingRestore = null;
        await expect(readyForPricingPage.row(vehicleId)).toHaveCount(0);

        await suspendedVehiclesPage.goto();
        await suspendedVehiclesPage.searchByVin(vin);
        const restoredRow = suspendedVehiclesPage.row(vehicleId);
        await expect(restoredRow).toHaveCount(1);
        await expect(suspendedVehiclesPage.suspendReasonCells).toHaveText([
          suspendedVehiclesData.activationReason,
        ]);
        await expect.poll(() => suspendedVehiclesPage.totalCount()).toBe(1);
      },
    );
  });
});
