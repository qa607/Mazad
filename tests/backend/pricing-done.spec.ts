import { expect, test } from '@fixtures/test.fixture';
import {
  pricingDoneData,
  pricingDoneText,
  pricingDoneUrls,
} from '@test-data/backend-pricing-done.data';

// Pages open already signed in as Dev Root (logged in once per run by auth.setup.ts).
// Traces and videos would capture the session cookie and account details, so none are
// recorded; afterEach attaches a screenshot with account details masked instead.
test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

// Every test here is read-only: "Move to upcoming" and Suspend are opened and then cancelled,
// never submitted, because no tested path returns a vehicle to Pricing Done afterwards.

const firstPageSummary = new RegExp(`^Showing 1-${pricingDoneData.pageSize} of [\\d,]+ items\\.$`);
const disabled = /\bdisabled\b/;

/** "MMBMG35K3LH201464 #F1" -> "MMBMG35K3LH201464" (the grid appends a file suffix to some VINs). */
function baseVin(cellText: string): string {
  return cellText.trim().split(/\s+/)[0];
}

function normalizeSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

test.describe('Backend - Pricing Done list', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, pricingDonePage }) => {
    await pricingDonePage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(pricingDoneUrls.list);
  });

  test.afterEach(async ({ page, mazadDashboardPage }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const screenshot = await page
      .screenshot({ mask: mazadDashboardPage.sensitiveAreas() })
      .catch(() => null);
    if (screenshot) {
      await testInfo.attach('screenshot (account details masked)', {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  });

  test.describe('page', () => {
    test(
      'Page shows the heading, filters and the priced vehicles grid',
      { tag: ['@smoke', '@functional'] },
      async ({ page, pricingDonePage }) => {
        await expect(page).toHaveTitle(pricingDoneText.pageTitle);
        await expect(pricingDonePage.pageHeading).toHaveText(pricingDoneText.pageTitle);
        await expect(pricingDonePage.breadcrumbCurrent).toHaveText(pricingDoneText.pageTitle);
        await expect(pricingDonePage.sidebarLink).toBeVisible();

        await expect(pricingDonePage.vinInput).toBeEditable();
        await expect(pricingDonePage.titleInput).toBeEditable();
        await expect(pricingDonePage.startingPriceInput).toBeEditable();
        await expect(pricingDonePage.buyNowPriceInput).toBeEditable();
        await expect(pricingDonePage.searchButton).toBeEnabled();
        await expect(pricingDonePage.resetButton).toBeVisible();

        await expect(pricingDonePage.columnHeaders).toHaveText([...pricingDoneText.columnHeaders]);
        await expect(pricingDonePage.summary).toHaveText(firstPageSummary);
        await expect(pricingDonePage.rows).toHaveCount(pricingDoneData.pageSize);
        await expect(pricingDonePage.activePage).toHaveText('1');
        await expect(pricingDonePage.bulkMoveToUpcomingButton).toHaveClass(disabled);
        await expect(pricingDonePage.bulkSuspendButton).toHaveClass(disabled);
      },
    );

    test(
      'Every row has View, Update and Suspend actions',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        const rowCount = await pricingDonePage.rows.count();

        await expect(pricingDonePage.rows.locator('a[title="View"]')).toHaveCount(rowCount);
        await expect(pricingDonePage.rows.locator('a[title="Update"]')).toHaveCount(rowCount);
        await expect(pricingDonePage.rows.locator('a.suspend-btn')).toHaveCount(rowCount);
      },
    );
  });

  test.describe('search', () => {
    test(
      'Searching by VIN shows only that vehicle',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        await pricingDonePage.gotoSortedById();
        const row = pricingDonePage.rows.first();
        const vehicleId = await pricingDonePage.rowId(row);
        const vin = baseVin(await pricingDonePage.rowVin(row).innerText());

        await pricingDonePage.searchByVin(vin);

        await expect(page).toHaveURL(/PricingDoneSearch%5Bvin_number%5D=/);
        await expect(pricingDonePage.vinInput).toHaveValue(vin);
        await expect(pricingDonePage.row(vehicleId)).toHaveCount(1);
        await expect(pricingDonePage.vinCells.filter({ hasNotText: vin })).toHaveCount(0);
      },
    );

    test(
      'Searching by part of a VIN shows every vehicle containing it',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        await pricingDonePage.gotoSortedById();
        const row = pricingDonePage.rows.first();
        const vehicleId = await pricingDonePage.rowId(row);
        const partialVin = baseVin(await pricingDonePage.rowVin(row).innerText()).slice(
          0,
          pricingDoneData.partialVinLength,
        );

        await pricingDonePage.searchByVin(partialVin);

        await expect(pricingDonePage.row(vehicleId)).toHaveCount(1);
        await expect(pricingDonePage.vinCells.filter({ hasNotText: partialVin })).toHaveCount(0);
      },
    );

    test(
      'Searching for an unknown VIN shows no results',
      { tag: '@negative' },
      async ({ pricingDonePage }) => {
        await pricingDonePage.searchByVin(pricingDoneData.unknownVin);

        await expect(pricingDonePage.emptyMessage).toHaveText(pricingDoneText.noResults);
        await expect(pricingDonePage.rows).toHaveCount(0);
        await expect(pricingDonePage.summary).toHaveCount(0);
      },
    );

    test(
      'Searching by title shows only matching vehicles',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        const title = pricingDoneData.titleSearch;

        await pricingDonePage.searchByTitle(title);

        await expect(pricingDonePage.titleInput).toHaveValue(title);
        await expect(pricingDonePage.titleCells.first()).toContainText(title);
        await expect(pricingDonePage.titleCells.filter({ hasNotText: title })).toHaveCount(0);
      },
    );

    test(
      'Searching by starting price shows only vehicles with that price',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        // The highest price on the list, so the search never matches the many unpriced (0) rows.
        await pricingDonePage.gotoSortedByStartingPriceDesc();
        const shownPrice = (
          await pricingDonePage.rowStartingPrice(pricingDonePage.rows.first()).innerText()
        ).trim();

        await pricingDonePage.searchByStartingPrice(shownPrice.replace(/,/g, ''));

        await expect(pricingDonePage.startingPriceCells.first()).toHaveText(shownPrice);
        await expect(
          pricingDonePage.startingPriceCells.filter({ hasNotText: shownPrice }),
        ).toHaveCount(0);
      },
    );

    test(
      'Searching by a non-numeric starting price shows no results',
      { tag: ['@negative', '@known-bug'] },
      async ({ pricingDonePage }) => {
        // Known bug (found 2026-11-08): text in the Starting Price filter is treated as 0, so
        // "abc" lists every vehicle with a starting price of 0 (42 on staging) instead of none.
        // Remove test.fail() once non-numeric prices are rejected or match nothing.
        test.fail(
          true,
          'BUG-PENDING: Known bug: a non-numeric starting price filter matches price 0.',
        );

        await pricingDonePage.searchByStartingPrice(pricingDoneData.invalidPrice);

        await expect(pricingDonePage.rows).toHaveCount(0);
      },
    );
  });

  test.describe('filters', () => {
    test(
      'Model is disabled until a make is chosen',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        await expect(pricingDonePage.modelSelect).toBeDisabled();

        await pricingDonePage.chooseMake(pricingDoneData.make);

        await expect(pricingDonePage.modelSelect).toBeEnabled();
      },
    );

    test(
      'Filtering by make and model shows only that model',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const { make, model } = pricingDoneData;

        await pricingDonePage.filterByMakeAndModel(make, model);

        await expect(page).toHaveURL(/PricingDoneSearch%5Bmake_id%5D=\d+/);
        await expect(page).toHaveURL(/PricingDoneSearch%5Bmodel_id%5D=\d+/);
        await expect(pricingDonePage.makeValue).toHaveText(new RegExp(make));
        await expect(pricingDonePage.modelValue).toHaveText(new RegExp(model));
        const makeAndModel = new RegExp(`^${make}\\s+${model}\\b`);
        await expect(pricingDonePage.titleCells.first()).toHaveText(makeAndModel);
        await expect(pricingDonePage.titleCells.filter({ hasNotText: makeAndModel })).toHaveCount(
          0,
        );
      },
    );

    test(
      'Filtering by year shows only vehicles of that year',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const year = pricingDoneData.year;
        // The grid has no Year column; vehicle titles end with the year.
        const ofYear = new RegExp(`\\b${year}$`);

        await pricingDonePage.filterByYear(year);

        await expect(page).toHaveURL(/PricingDoneSearch%5Byear%5D=\d+/);
        await expect(pricingDonePage.titleCells.first()).toHaveText(ofYear);
        await expect(pricingDonePage.titleCells.filter({ hasNotText: ofYear })).toHaveCount(0);
      },
    );

    test(
      'Filtering by supplier shows only that supplier’s vehicles',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const supplier = pricingDoneData.supplierName;

        await pricingDonePage.filterBySupplier(pricingDoneData.supplierOption);

        await expect(page).toHaveURL(/PricingDoneSearch%5Bsupplier_id%5D=\d+/);
        await expect(pricingDonePage.supplierValue).toHaveText(pricingDoneData.supplierOption);
        await expect(pricingDonePage.supplierCells.first()).toHaveText(supplier);
        await expect(pricingDonePage.supplierCells.filter({ hasNotText: supplier })).toHaveCount(0);
      },
    );

    test(
      'Filtering by auction type shows only that type',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const type = pricingDoneData.auctionType;

        await pricingDonePage.filterByAuctionType(type);

        await expect(page).toHaveURL(/PricingDoneSearch%5Bauction_type%5D=\w+/);
        await expect(pricingDonePage.auctionSourceCells.first()).toHaveText(type);
        await expect(pricingDonePage.auctionSourceCells.filter({ hasNotText: type })).toHaveCount(
          0,
        );
      },
    );

    test(
      'Each status filter shows only that status, and together they cover the list',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        const total = await pricingDonePage.totalCount();
        let sum = 0;

        for (const status of pricingDoneText.statuses) {
          await test.step(status, async () => {
            await pricingDonePage.filterByStatus(status);

            await expect(pricingDonePage.statusValue).toHaveText(new RegExp(status));
            await expect(pricingDonePage.statusCells.first()).toHaveText(status);
            await expect(pricingDonePage.statusCells.filter({ hasNotText: status })).toHaveCount(0);
            sum += await pricingDonePage.totalCount();
          });
        }

        expect(sum, 'vehicles across all status filters').toBe(total);
      },
    );

    test(
      'Reset clears the filters and shows the full list again',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        await pricingDonePage.filterByStatus(pricingDoneText.statuses[1]);
        await pricingDonePage.searchByVin(pricingDoneData.unknownVin);
        await expect(pricingDonePage.emptyMessage).toBeVisible();

        await pricingDonePage.reset();

        await expect(page).toHaveURL(/\/backend\/auction\/pricing-done\/index$/);
        await expect(pricingDonePage.vinInput).toHaveValue('');
        await expect(pricingDonePage.statusValue).toHaveText(/Select Status/);
        await expect(pricingDonePage.rows).toHaveCount(pricingDoneData.pageSize);
        await expect(pricingDonePage.summary).toHaveText(firstPageSummary);
      },
    );
  });

  test.describe('sorting and paging', () => {
    test(
      'Starting Price header sorts ascending, then descending',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        await pricingDonePage.sortByStartingPrice();

        await expect(page).toHaveURL(/[?&]sort=lastPricing\.starting_price(&|$)/);
        const ascending = await pricingDonePage.startingPrices();
        expect(ascending).toHaveLength(pricingDoneData.pageSize);
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await pricingDonePage.sortByStartingPrice();

        await expect(page).toHaveURL(/[?&]sort=-lastPricing\.starting_price(&|$)/);
        const descending = await pricingDonePage.startingPrices();
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
        expect(descending[0]).toBeGreaterThanOrEqual(ascending[ascending.length - 1]);
      },
    );

    test(
      'Page 2 shows the next 20 vehicles',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        await pricingDonePage.goToPage(2);

        await expect(page).toHaveURL(/[?&]page=2(&|$)/);
        await expect(pricingDonePage.activePage).toHaveText('2');
        await expect(pricingDonePage.summary).toHaveText(/^Showing 21-40 of [\d,]+ items\.$/);
        await expect(pricingDonePage.rows).toHaveCount(pricingDoneData.pageSize);
      },
    );

    test(
      'Every vehicle appears on exactly one page',
      { tag: ['@functional', '@known-bug'] },
      async ({ pricingDonePage }) => {
        // Known bug (found 2026-11-08), as on the other auction lists: the default order is not
        // stable, so pages repeat some vehicles and never show others (117 rows listed, only
        // 113 distinct vehicles). Remove test.fail() once the list is ordered by a unique key.
        test.fail(
          true,
          'BUG-PENDING: Known bug: default list order repeats and hides vehicles across pages.',
        );
        test.slow();

        const total = await pricingDonePage.totalCount();
        const pageCount = Math.ceil(total / pricingDoneData.pageSize);
        const seen: string[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          await pricingDonePage.gotoPage(pageNumber);
          seen.push(...(await pricingDonePage.rowIds()));
        }

        expect(seen).toHaveLength(total);
        expect(new Set(seen).size, 'distinct vehicles across all pages').toBe(total);
      },
    );
  });

  test.describe('row and bulk actions', () => {
    test(
      'Bulk actions are enabled only while a vehicle is selected',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        const checkbox = pricingDonePage.rowCheckbox(pricingDonePage.rows.first());

        await checkbox.check();
        await expect(pricingDonePage.bulkMoveToUpcomingButton).not.toHaveClass(disabled);
        await expect(pricingDonePage.bulkSuspendButton).not.toHaveClass(disabled);

        await checkbox.uncheck();
        await expect(pricingDonePage.bulkMoveToUpcomingButton).toHaveClass(disabled);
        await expect(pricingDonePage.bulkSuspendButton).toHaveClass(disabled);
      },
    );

    test(
      'Select all selects every vehicle on the page',
      { tag: '@functional' },
      async ({ pricingDonePage }) => {
        await pricingDonePage.selectAllCheckbox.check();

        for (const checkbox of await pricingDonePage.rowCheckboxes.all()) {
          await expect(checkbox).toBeChecked();
        }
        await expect(pricingDonePage.bulkMoveToUpcomingButton).not.toHaveClass(disabled);

        await pricingDonePage.selectAllCheckbox.uncheck();

        for (const checkbox of await pricingDonePage.rowCheckboxes.all()) {
          await expect(checkbox).not.toBeChecked();
        }
        await expect(pricingDonePage.bulkMoveToUpcomingButton).toHaveClass(disabled);
      },
    );

    test(
      'View opens the vehicle’s details in a new tab',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const row = pricingDonePage.rows.first();
        const vehicleId = await pricingDonePage.rowId(row);
        const vehicleTitle = await pricingDonePage.rowTitle(row).innerText();

        const [viewPage] = await Promise.all([
          page.context().waitForEvent('page'),
          pricingDonePage.rowViewLink(row).click(),
        ]);
        await viewPage.waitForLoadState();

        await expect(viewPage).toHaveURL(pricingDoneUrls.vehicleView(vehicleId));
        await expect(viewPage).toHaveTitle(pricingDoneText.viewPageTitle);
        // The grid can show extra spaces inside a title ("Toyota Camry  2024"); compare words only.
        expect(normalizeSpaces(await viewPage.title())).toBe(
          `${pricingDoneText.viewPageTitlePrefix}${normalizeSpaces(vehicleTitle)}`,
        );
        await expect(page).toHaveURL(pricingDoneUrls.list);
      },
    );

    test(
      'Update opens the vehicle’s edit form in a new tab',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const row = pricingDonePage.rows.first();
        const vehicleId = await pricingDonePage.rowId(row);

        const [updatePage] = await Promise.all([
          page.context().waitForEvent('page'),
          pricingDonePage.rowUpdateLink(row).click(),
        ]);
        await updatePage.waitForLoadState();

        await expect(updatePage).toHaveURL(pricingDoneUrls.vehicleUpdate(vehicleId));
        await expect(updatePage).toHaveTitle(pricingDoneText.updatePageTitle);
      },
    );

    test(
      'Suspending without a reason is rejected, and Close keeps the vehicle',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const vehicleId = await pricingDonePage.rowId(pricingDonePage.rows.first());

        await pricingDonePage.openSuspendModal(vehicleId);
        await expect(pricingDonePage.modalTitle).toHaveText(pricingDoneText.suspendModalTitle);
        await expect(pricingDonePage.suspendReasonLabels).toHaveText([
          ...pricingDoneText.suspendReasons,
        ]);

        await pricingDonePage.suspendModalSubmitButton.click();

        await expect(pricingDonePage.suspendReasonError).toHaveText(pricingDoneText.reasonRequired);
        await expect(pricingDonePage.modal).toBeVisible();
        await expect(pricingDonePage.resultAlert).toHaveCount(0);

        await pricingDonePage.closeSuspendModal();

        await expect(pricingDonePage.modal).toBeHidden();
        await page.reload();
        await expect(pricingDonePage.row(vehicleId)).toHaveCount(1);
      },
    );

    test(
      'Cancelling "Move to upcoming" keeps the vehicle in Pricing Done',
      { tag: '@functional' },
      async ({ page, pricingDonePage }) => {
        const vehicleId = await pricingDonePage.rowId(pricingDonePage.rows.first());
        const submissions = pricingDonePage.countPostRequests(
          pricingDoneUrls.moveToUpcomingEndpoint,
        );

        await pricingDonePage.openMoveToUpcomingConfirmation(vehicleId);
        await expect(pricingDonePage.modalTitle).toHaveText(pricingDoneText.moveToUpcomingTitle);
        await expect(pricingDonePage.confirmModalMessage).toHaveText(
          pricingDoneText.moveToUpcomingMessage,
        );

        await pricingDonePage.cancelConfirmation();

        await expect(pricingDonePage.modal).toBeHidden();
        expect(submissions()).toBe(0);
        await page.reload();
        await expect(pricingDonePage.row(vehicleId)).toHaveCount(1);
      },
    );
  });
});
