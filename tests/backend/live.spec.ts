import { expect, test } from '@fixtures/test.fixture';
import { liveData, liveEndpoints, liveText, liveUrls } from '@test-data/backend-live.data';

// Live Auctions list (/backend/auction/live/index). The vehicles here are in real running
// auctions, created by other people on staging, so every test is read-only: dialogs are opened
// and closed, and no Disable, Extend, Auto Extend, price or auction change is ever sent. Each
// test reads its values from the rows that are live at the time.

test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

const disabled = /\bdisabled\b/;

test.describe('Backend - Live Auctions list', () => {
  test.beforeEach(async ({ page, livePage }) => {
    await livePage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(liveUrls.list);
    await expect(
      livePage.rows.first(),
      'No live auction on staging right now: these tests need at least one.',
    ).toBeVisible();
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
    test('Page shows the heading, filters and the live vehicles grid', async ({
      page,
      livePage,
    }) => {
      await expect(page).toHaveTitle(liveText.pageTitle);
      await expect(livePage.pageHeading).toHaveText(liveText.pageTitle);
      await expect(livePage.breadcrumbCurrent).toHaveText(liveText.pageTitle);
      await expect(livePage.sidebarLink).toBeVisible();

      await expect(livePage.titleInput).toBeEditable();
      await expect(livePage.vinInput).toBeEditable();
      await expect(livePage.searchButton).toBeEnabled();
      await expect(livePage.resetButton).toBeVisible();

      await expect(livePage.columnHeaders).toHaveText([...liveText.columnHeaders]);
      await expect(livePage.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
      await expect(livePage.bulkExtendButton).toBeVisible();
    });

    test('Every row has a View action', async ({ livePage }) => {
      const rowCount = await livePage.rows.count();

      // Disable is on most rows but not all (on 2026-11-09 one Standard auction with bids had
      // none), so only View is checked on every row.
      await expect(livePage.rows.locator('a[title="View"]')).toHaveCount(rowCount);
    });
  });

  test.describe('search and filters', () => {
    test('Searching by VIN shows only that vehicle', async ({ livePage }) => {
      const row = livePage.rows.first();
      const itemId = await livePage.rowId(row);
      const vin = await livePage.rowVin(row);

      await livePage.searchByVin(vin);

      await expect(livePage.vinInput).toHaveValue(vin);
      await expect(livePage.row(itemId)).toHaveCount(1);
      await expect(livePage.itemInfoCells.filter({ hasNotText: vin })).toHaveCount(0);
    });

    test('Searching by part of a VIN shows every vehicle containing it', async ({ livePage }) => {
      const row = livePage.rows.first();
      const itemId = await livePage.rowId(row);
      const partialVin = (await livePage.rowVin(row)).slice(0, liveData.partialVinLength);

      await livePage.searchByVin(partialVin);

      await expect(livePage.row(itemId)).toHaveCount(1);
      await expect(livePage.itemInfoCells.filter({ hasNotText: partialVin })).toHaveCount(0);
    });

    test('Searching for an unknown VIN shows no results', async ({ livePage }) => {
      await livePage.searchByVin(liveData.unknownVin);

      await expect(livePage.emptyMessage).toHaveText(liveText.noResults);
      await expect(livePage.rows).toHaveCount(0);
    });

    test('Title searches the vehicle title (not the auction title)', async ({ livePage }) => {
      const row = livePage.rows.first();
      const itemId = await livePage.rowId(row);
      // The vehicle's make, e.g. "Toyota" from "Toyota Camry 2025".
      const make = (await livePage.rowItemValue(row, 'Title')).split(/\s+/)[0];

      await livePage.searchByTitle(make);

      await expect(livePage.titleInput).toHaveValue(make);
      await expect(livePage.row(itemId)).toHaveCount(1);
      await expect(livePage.itemInfoCells.filter({ hasNotText: make })).toHaveCount(0);
    });

    for (const type of ['Standard', 'Price Offering'] as const) {
      test(`Bidding Type "${type}" shows only ${type} auctions`, async ({ livePage }) => {
        await livePage.filterByBidType(type);

        await expect(livePage.bidTypeValue).toContainText(type);
        await expect(
          livePage.auctionCells.filter({ hasNotText: `Bidding Type ${type}` }),
        ).toHaveCount(0);
      });
    }

    for (const type of ['Instant Auction', 'Approval Required Auction'] as const) {
      test(`Auction Type "${type}" shows only ${type}s`, async ({ livePage }) => {
        await livePage.filterByAuctionType(type);

        await expect(livePage.auctionTypeValue).toContainText(type);
        await expect(
          livePage.auctionCells.filter({ hasNotText: `Auction Type ${type}` }),
        ).toHaveCount(0);
      });
    }

    test('Filtering by supplier shows only that supplier’s vehicles', async ({ livePage }) => {
      const row = livePage.rows.first();
      const itemId = await livePage.rowId(row);
      const supplier = await livePage.rowItemValue(row, 'Supplier');

      await livePage.filterBySupplier(new RegExp(`^\\s*${supplier} - Supplier\\s*$`));

      await expect(livePage.row(itemId)).toHaveCount(1);
      await expect(livePage.itemInfoCells.filter({ hasNotText: supplier })).toHaveCount(0);
    });

    test('Reset clears the filters and shows every live vehicle again', async ({
      page,
      livePage,
    }) => {
      const total = await livePage.totalCount();
      await livePage.searchByVin(liveData.unknownVin);
      await expect(livePage.emptyMessage).toBeVisible();

      await livePage.reset();

      await expect(page).toHaveURL(/\/backend\/auction\/live\/index$/);
      await expect(livePage.vinInput).toHaveValue('');
      expect(await livePage.totalCount()).toBe(total);
    });
  });

  test.describe('auto extend', () => {
    test('Standard auctions show an Auto Extend switch', async ({ livePage }) => {
      await livePage.filterByBidType('Standard');
      const rowCount = await livePage.rows.count();
      test.skip(rowCount === 0, 'No live Standard auction right now.');

      await expect(livePage.rows.locator('input.auto-extend')).toHaveCount(rowCount);
    });

    test('Price Offering auctions have no Auto Extend switch', async ({ livePage }) => {
      await livePage.filterByBidType('Price Offering');
      const rowCount = await livePage.rows.count();
      test.skip(rowCount === 0, 'No live Price Offering auction right now.');

      await expect(livePage.rows.locator('input.auto-extend')).toHaveCount(0);
    });
  });

  test.describe('dialogs (opened and closed, nothing sent)', () => {
    test('Cancelling Disable keeps the vehicle live', async ({ page, livePage }) => {
      const row = livePage.rows.filter({ has: page.locator('a.failed-btn') }).first();
      await expect(row, 'No live row with a Disable action right now.').toBeVisible();
      const itemId = await livePage.rowId(row);
      const submissions = livePage.countPostRequests(liveEndpoints.disable);

      await livePage.disableLink(row).click();
      await expect(livePage.confirmMessage).toHaveText(liveText.disableConfirm);
      await livePage.closeDialog(livePage.confirmModal);

      await expect(livePage.confirmModal).toBeHidden();
      expect(submissions()).toBe(0);
      await page.reload();
      await expect(livePage.row(itemId)).toHaveCount(1);
    });

    test('Bidders dialog shows the bidding details of that vehicle', async ({ livePage }) => {
      const row = livePage.rows.first();
      const vin = await livePage.rowVin(row);

      await livePage.dialogLink(row, liveEndpoints.bidders).click();

      await expect(livePage.extraLargeModal.locator('.modal-title')).toHaveText(
        liveText.biddersTitle,
      );
      await expect(livePage.extraLargeModal).toContainText(vin);
      await livePage.closeDialog(livePage.extraLargeModal);
      await expect(livePage.extraLargeModal).toBeHidden();
    });

    test('Supplier link shows the owner’s details', async ({ livePage }) => {
      const row = livePage.rows.first();

      await livePage.dialogLink(row, liveEndpoints.supplier).click();

      await expect(livePage.largeModal.locator('.modal-title')).toHaveText(liveText.supplierTitle);
      await livePage.closeDialog(livePage.largeModal);
      await expect(livePage.largeModal).toBeHidden();
    });

    test('Cancelling the price dialog changes nothing', async ({ livePage }) => {
      const row = livePage.rows.first();
      const submissions = livePage.countPostRequests(liveEndpoints.reservePrice);

      await livePage.dialogLink(row, liveEndpoints.reservePriceDialog).click();
      await expect(livePage.largeModal.locator('.modal-title')).toHaveText(
        liveText.reservePriceTitle,
      );
      await livePage.closeDialog(livePage.largeModal);

      await expect(livePage.largeModal).toBeHidden();
      expect(submissions()).toBe(0);
    });

    test('Cancelling the auction update dialog changes nothing', async ({ livePage }) => {
      const row = livePage.rows.first();
      const auctionTitle = await livePage.rowAuctionTitle(row);
      const submissions = livePage.countPostRequests(liveEndpoints.updateAuction);

      await livePage.dialogLink(row, liveEndpoints.updateAuctionDialog).click();
      await expect(livePage.extraLargeModal.locator('.modal-title')).toHaveText(
        `${liveText.updateAuctionTitle} ${auctionTitle}`,
      );
      await livePage.closeDialog(livePage.extraLargeModal);

      await expect(livePage.extraLargeModal).toBeHidden();
      expect(submissions()).toBe(0);
    });

    test('Extend Auction lists the selected vehicle, and Cancel extends nothing', async ({
      livePage,
    }) => {
      const row = livePage.rows.first();
      const vin = await livePage.rowVin(row);
      const submissions = livePage.countPostRequests(liveEndpoints.extend);

      await livePage.rowCheckbox(row).check();
      await expect(livePage.bulkExtendButton).not.toHaveClass(disabled);
      await livePage.bulkExtendButton.click();

      await expect(livePage.extraLargeModal.locator('.modal-title')).toHaveText(
        liveText.extendTitle,
      );
      await expect(livePage.extraLargeModal).toContainText(vin);
      await livePage.closeDialog(livePage.extraLargeModal);

      await expect(livePage.extraLargeModal).toBeHidden();
      expect(submissions()).toBe(0);
    });
  });

  test('View opens the auction details of that vehicle in a new tab', async ({
    page,
    livePage,
  }) => {
    const row = livePage.rows.first();
    const itemId = await livePage.rowId(row);
    const vin = await livePage.rowVin(row);
    const auctionTitle = await livePage.rowAuctionTitle(row);

    const [viewPage] = await Promise.all([
      page.context().waitForEvent('page'),
      livePage.viewLink(row).click(),
    ]);
    await viewPage.waitForLoadState();

    await expect(viewPage).toHaveURL(liveUrls.view(itemId));
    await expect(viewPage).toHaveTitle(liveText.viewPageTitle);
    await expect(viewPage.getByText(vin).first()).toBeVisible();
    await expect(viewPage.getByText(auctionTitle).first()).toBeVisible();
    await expect(page).toHaveURL(liveUrls.list);
  });
});
