import { expect, test } from '@fixtures/test.fixture';
import {
  createAuctionText,
  upcomingData,
  upcomingText,
  upcomingUrls,
} from '@test-data/backend-upcoming.data';

// Pages open already signed in as Dev Root (logged in once per run by auth.setup.ts).
// Traces and videos would capture the session cookie and account details, so none are
// recorded; afterEach attaches a screenshot with account details masked instead.
test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

// Every test here is read-only: "Back to pricing done", "Add to Auction", Suspend and Create
// Auction are opened and then cancelled or stopped by validation, never submitted.

const summaryPattern = /^Showing 1-\d+ of [\d,]+ items?\.$/;
const disabled = /\bdisabled\b/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** "MMBMG35K3LH201464 #F1" -> "MMBMG35K3LH201464" (the grid appends a file suffix to some VINs). */
function baseVin(cellText: string): string {
  return cellText.trim().split(/\s+/)[0];
}

test.describe('Backend - Upcoming list', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, upcomingPage }) => {
    await upcomingPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(upcomingUrls.list);
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
      'Page shows the heading, filters, toolbar and the upcoming vehicles grid',
      { tag: ['@smoke', '@functional'] },
      async ({ page, upcomingPage }) => {
        await expect(page).toHaveTitle(upcomingText.pageTitle);
        await expect(upcomingPage.pageHeading).toHaveText(upcomingText.pageTitle);
        await expect(upcomingPage.breadcrumbCurrent).toHaveText(upcomingText.pageTitle);
        await expect(upcomingPage.sidebarLink).toBeVisible();

        await expect(upcomingPage.vinInput).toBeEditable();
        await expect(upcomingPage.titleInput).toBeEditable();
        await expect(upcomingPage.startingPriceInput).toBeEditable();
        await expect(upcomingPage.buyNowPriceInput).toBeEditable();
        await expect(upcomingPage.searchButton).toBeEnabled();
        await expect(upcomingPage.resetButton).toBeVisible();

        await expect(upcomingPage.columnHeaders).toHaveText([...upcomingText.columnHeaders]);
        await expect(upcomingPage.summary).toHaveText(summaryPattern);
        const total = await upcomingPage.totalCount();
        await expect(upcomingPage.rows).toHaveCount(Math.min(total, upcomingData.pageSize));

        // Create Auction is always available; the other actions need a selection.
        await expect(upcomingPage.createAuctionButton).not.toHaveClass(disabled);
        await expect(upcomingPage.bulkAddToAuctionButton).toHaveClass(disabled);
        await expect(upcomingPage.bulkBackToPricingDoneButton).toHaveClass(disabled);
        await expect(upcomingPage.bulkSuspendButton).toHaveClass(disabled);
      },
    );

    test(
      'Every row has View, Update and Suspend actions',
      { tag: '@functional' },
      async ({ upcomingPage }) => {
        const rowCount = await upcomingPage.rows.count();

        await expect(upcomingPage.rows.locator('a[title="View"]')).toHaveCount(rowCount);
        await expect(upcomingPage.rows.locator('a[title="Update"]')).toHaveCount(rowCount);
        await expect(upcomingPage.rows.locator('a.suspend-btn')).toHaveCount(rowCount);
      },
    );
  });

  test.describe('search', () => {
    test(
      'Searching by VIN shows only that vehicle',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const row = upcomingPage.rows.first();
        const rowKey = await upcomingPage.rowId(row);
        const vin = baseVin(await upcomingPage.rowVin(row).innerText());

        await upcomingPage.searchByVin(vin);

        await expect(page).toHaveURL(/UpcomingSearch%5Bvin_number%5D=/);
        await expect(upcomingPage.vinInput).toHaveValue(vin);
        await expect(upcomingPage.row(rowKey)).toHaveCount(1);
        await expect(upcomingPage.vinCells.filter({ hasNotText: vin })).toHaveCount(0);
      },
    );

    test(
      'Searching by part of a VIN shows every vehicle containing it',
      { tag: '@functional' },
      async ({ upcomingPage }) => {
        const row = upcomingPage.rows.first();
        const rowKey = await upcomingPage.rowId(row);
        const partialVin = baseVin(await upcomingPage.rowVin(row).innerText()).slice(
          0,
          upcomingData.partialVinLength,
        );

        await upcomingPage.searchByVin(partialVin);

        await expect(upcomingPage.row(rowKey)).toHaveCount(1);
        await expect(upcomingPage.vinCells.filter({ hasNotText: partialVin })).toHaveCount(0);
      },
    );

    test(
      'Searching for an unknown VIN shows no results',
      { tag: '@negative' },
      async ({ upcomingPage }) => {
        await upcomingPage.searchByVin(upcomingData.unknownVin);

        await expect(upcomingPage.emptyMessage).toHaveText(upcomingText.noResults);
        await expect(upcomingPage.rows).toHaveCount(0);
        await expect(upcomingPage.summary).toHaveCount(0);
      },
    );

    test(
      'Searching by title shows only matching vehicles',
      { tag: ['@functional', '@known-bug'] },
      async ({ upcomingPage }) => {
        // Known bug (found 2026-11-08): the Title filter matches nothing at all. "Toyota",
        // "Yaris", a full grid title, Arabic text and even "T" all return no results, while the
        // same search works on Pricing Done. Remove test.fail() once the Title filter works.
        test.fail(
          true,
          'BUG-PENDING: Known bug: the Upcoming Title filter never matches any vehicle.',
        );

        // The first row's make ("Toyota Yaris  2024" -> "Toyota") always has a match.
        const title = (await upcomingPage.rowTitle(upcomingPage.rows.first()).innerText())
          .trim()
          .split(/\s+/)[0];

        await upcomingPage.searchByTitle(title);

        await expect(upcomingPage.titleInput).toHaveValue(title);
        await expect(upcomingPage.titleCells.first()).toContainText(title);
        await expect(upcomingPage.titleCells.filter({ hasNotText: title })).toHaveCount(0);
      },
    );
  });

  test.describe('filters', () => {
    test(
      'Model is disabled until a make is chosen',
      { tag: '@functional' },
      async ({ upcomingPage }) => {
        await expect(upcomingPage.modelSelect).toBeDisabled();

        await upcomingPage.chooseMake(upcomingData.make);

        await expect(upcomingPage.modelSelect).toBeEnabled();
      },
    );

    test(
      'Filtering by make and model shows only that model',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const { make, model } = upcomingData;

        await upcomingPage.filterByMakeAndModel(make, model);

        await expect(page).toHaveURL(/UpcomingSearch%5Bmake_id%5D=\d+/);
        await expect(page).toHaveURL(/UpcomingSearch%5Bmodel_id%5D=\d+/);
        await expect(upcomingPage.makeValue).toHaveText(new RegExp(make));
        await expect(upcomingPage.modelValue).toHaveText(new RegExp(model));
        const makeAndModel = new RegExp(`^${make}\\s+${model}\\b`);
        await expect(upcomingPage.titleCells.first()).toHaveText(makeAndModel);
        await expect(upcomingPage.titleCells.filter({ hasNotText: makeAndModel })).toHaveCount(0);
      },
    );

    test(
      'Filtering by year shows only vehicles of that year',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        // The grid has no Year column; vehicle titles end with the year.
        const title = await upcomingPage.rowTitle(upcomingPage.rows.first()).innerText();
        const year = title.trim().split(/\s+/).pop() ?? '';
        const ofYear = new RegExp(`\\b${year}$`);

        await upcomingPage.filterByYear(year);

        await expect(page).toHaveURL(/UpcomingSearch%5Byear%5D=\d+/);
        await expect(upcomingPage.titleCells.first()).toHaveText(ofYear);
        await expect(upcomingPage.titleCells.filter({ hasNotText: ofYear })).toHaveCount(0);
      },
    );

    test(
      'Filtering by supplier shows only that supplier’s vehicles',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const supplier = (
          await upcomingPage.rowSupplier(upcomingPage.rows.first()).innerText()
        ).trim();
        // The option reads "<supplier name> - Supplier".
        const option = new RegExp(`^\\s*${escapeRegExp(supplier)} - Supplier\\s*$`);

        await upcomingPage.filterBySupplier(option);

        await expect(page).toHaveURL(/UpcomingSearch%5Bsupplier_id%5D=\d+/);
        await expect(upcomingPage.supplierValue).toContainText(supplier);
        await expect(upcomingPage.supplierCells.first()).toHaveText(supplier);
        await expect(upcomingPage.supplierCells.filter({ hasNotText: supplier })).toHaveCount(0);
      },
    );

    test(
      'Filtering by type shows only that type',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const type = upcomingData.auctionType;

        await upcomingPage.filterByType(type);

        await expect(page).toHaveURL(/UpcomingSearch%5Btype%5D=\w+/);
        await expect(upcomingPage.auctionSourceCells.first()).toHaveText(type);
        await expect(upcomingPage.auctionSourceCells.filter({ hasNotText: type })).toHaveCount(0);
      },
    );

    test(
      'Reset clears the filters and shows the full list again',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const total = await upcomingPage.totalCount();
        await upcomingPage.searchByVin(upcomingData.unknownVin);
        await expect(upcomingPage.emptyMessage).toBeVisible();

        await upcomingPage.reset();

        await expect(page).toHaveURL(/\/backend\/auction\/upcoming\/index$/);
        await expect(upcomingPage.vinInput).toHaveValue('');
        await expect(upcomingPage.summary).toHaveText(summaryPattern);
        expect(await upcomingPage.totalCount()).toBe(total);
      },
    );
  });

  test.describe('sorting', () => {
    test(
      'Starting Price header sorts ascending, then descending',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        await upcomingPage.sortByStartingPrice();

        await expect(page).toHaveURL(/[?&]sort=pricing\.starting_price(&|$)/);
        const ascending = await upcomingPage.startingPrices();
        expect(ascending.length).toBeGreaterThan(0);
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await upcomingPage.sortByStartingPrice();

        await expect(page).toHaveURL(/[?&]sort=-pricing\.starting_price(&|$)/);
        const descending = await upcomingPage.startingPrices();
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
        expect(descending[0]).toBeGreaterThanOrEqual(ascending[ascending.length - 1]);
      },
    );
  });

  test.describe('row and bulk actions', () => {
    test(
      'Bulk actions are enabled only while a vehicle is selected',
      { tag: '@functional' },
      async ({ upcomingPage }) => {
        const checkbox = upcomingPage.rowCheckbox(upcomingPage.rows.first());
        const bulkButtons = [
          upcomingPage.bulkAddToAuctionButton,
          upcomingPage.bulkBackToPricingDoneButton,
          upcomingPage.bulkSuspendButton,
        ];

        await checkbox.check();
        for (const button of bulkButtons) await expect(button).not.toHaveClass(disabled);

        await checkbox.uncheck();
        for (const button of bulkButtons) await expect(button).toHaveClass(disabled);
      },
    );

    test(
      'Select all selects every vehicle on the page',
      { tag: '@functional' },
      async ({ upcomingPage }) => {
        await upcomingPage.selectAllCheckbox.check();

        for (const checkbox of await upcomingPage.rowCheckboxes.all()) {
          await expect(checkbox).toBeChecked();
        }
        await expect(upcomingPage.bulkBackToPricingDoneButton).not.toHaveClass(disabled);

        await upcomingPage.selectAllCheckbox.uncheck();

        for (const checkbox of await upcomingPage.rowCheckboxes.all()) {
          await expect(checkbox).not.toBeChecked();
        }
        await expect(upcomingPage.bulkBackToPricingDoneButton).toHaveClass(disabled);
      },
    );

    test(
      'View opens the vehicle’s details in a new tab',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const row = upcomingPage.rows.first();
        const vehicleId = await upcomingPage.rowVehicleId(row);
        const vehicleTitle = await upcomingPage.rowTitle(row).innerText();

        const [viewPage] = await Promise.all([
          page.context().waitForEvent('page'),
          upcomingPage.rowViewLink(row).click(),
        ]);
        await viewPage.waitForLoadState();

        await expect(viewPage).toHaveURL(upcomingUrls.vehicleView(vehicleId));
        // The grid can show extra spaces inside a title ("Toyota Yaris  2024"); compare words only.
        expect(normalizeSpaces(await viewPage.title())).toBe(
          `${upcomingText.viewPageTitlePrefix}${normalizeSpaces(vehicleTitle)}`,
        );
        await expect(page).toHaveURL(upcomingUrls.list);
      },
    );

    test(
      'Update opens the vehicle’s edit form in a new tab',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const row = upcomingPage.rows.first();
        const vehicleId = await upcomingPage.rowVehicleId(row);

        const [updatePage] = await Promise.all([
          page.context().waitForEvent('page'),
          upcomingPage.rowUpdateLink(row).click(),
        ]);
        await updatePage.waitForLoadState();

        await expect(updatePage).toHaveURL(upcomingUrls.vehicleUpdate(vehicleId));
        await expect(updatePage).toHaveTitle(upcomingText.updatePageTitle);
      },
    );

    test(
      'Suspending without a reason is rejected, and Close keeps the vehicle',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const rowKey = await upcomingPage.rowId(upcomingPage.rows.first());

        await upcomingPage.openSuspendModal(rowKey);
        await expect(upcomingPage.modalTitle).toHaveText(upcomingText.suspendModalTitle);
        await expect(upcomingPage.suspendReasonLabels).toHaveText([...upcomingText.suspendReasons]);

        await upcomingPage.suspendModalSubmitButton.click();

        await expect(upcomingPage.suspendReasonError).toHaveText(upcomingText.reasonRequired);
        await expect(upcomingPage.modal).toBeVisible();
        await expect(upcomingPage.resultAlert).toHaveCount(0);

        await upcomingPage.closeSuspendModal();

        await expect(upcomingPage.modal).toBeHidden();
        await page.reload();
        await expect(upcomingPage.row(rowKey)).toHaveCount(1);
      },
    );

    test(
      'Cancelling "Back to pricing done" keeps the vehicle in Upcoming',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const rowKey = await upcomingPage.rowId(upcomingPage.rows.first());
        const submissions = upcomingPage.countPostRequests(upcomingUrls.backToPricingDoneEndpoint);

        await upcomingPage.openBackToPricingDoneConfirmation(rowKey);
        await expect(upcomingPage.modalTitle).toHaveText(upcomingText.backToPricingDoneTitle);
        await expect(upcomingPage.confirmModalMessage).toHaveText(
          upcomingText.backToPricingDoneMessage,
        );

        await upcomingPage.cancelConfirmation();

        await expect(upcomingPage.modal).toBeHidden();
        expect(submissions()).toBe(0);
        await page.reload();
        await expect(upcomingPage.row(rowKey)).toHaveCount(1);
      },
    );

    test(
      'Add to Auction opens the auction picker, and Close keeps the vehicle',
      { tag: '@functional' },
      async ({ page, upcomingPage }) => {
        const rowKey = await upcomingPage.rowId(upcomingPage.rows.first());

        await upcomingPage.openAddToAuction(rowKey);
        await expect(upcomingPage.addToAuctionModalTitle).toHaveText(
          upcomingText.addToAuctionTitle,
        );

        await upcomingPage.closeAddToAuction();

        await expect(upcomingPage.addToAuctionModal).toBeHidden();
        await page.reload();
        await expect(upcomingPage.row(rowKey)).toHaveCount(1);
      },
    );
  });

  test.describe('create auction', () => {
    test(
      'Create Auction opens the wizard at its configuration step',
      { tag: '@functional' },
      async ({ page, upcomingPage, createAuctionPage }) => {
        await upcomingPage.openCreateAuction();

        await expect(page).toHaveURL(upcomingUrls.createAuction);
        await expect(page).toHaveTitle(createAuctionText.pageTitle);
        await expect(createAuctionPage.pageHeading).toHaveText(createAuctionText.pageTitle);
        await expect(createAuctionPage.breadcrumbCurrent).toHaveText(createAuctionText.pageTitle);
        await expect(createAuctionPage.titleInput).toBeEditable();
        await expect(createAuctionPage.nextButton).toBeVisible();
        await expect(createAuctionPage.createAuctionButton).toBeHidden();
      },
    );
    // The wizard itself is covered by create-auction.spec.ts.
  });
});
