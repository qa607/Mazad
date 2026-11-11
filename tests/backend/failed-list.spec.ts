import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { FailedPage } from '@pages/backend/auctions/failed.page';
import { gridSummary } from '@test-data/backend-common.data';
import { arabicLetters, failedData, failedText, failedUrls } from '@test-data/backend-failed.data';

// Read-only checks of the Failed Auctions list (Auction → Failed List), signed in as Dev Root.
// Nothing here changes data: popups and the confirmation are opened and closed, never submitted.
test.use(devRootSession);

const disabled = /\bdisabled\b/;

test.describe('Backend - Failed List - page', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, failedPage }) => {
    await failedPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(failedUrls.list);
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

  test(
    'FL-PAGE-01 Page shows the heading, filters, toolbar and the failed auctions grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, failedPage }) => {
      await expect(page).toHaveTitle(failedText.pageTitle);
      await expect(failedPage.pageHeading).toHaveText(failedText.pageTitle);
      await expect(failedPage.breadcrumbCurrent).toHaveText(failedText.pageTitle);
      await expect(failedPage.sidebarLink).toBeVisible();

      await expect(failedPage.textFilter('vin')).toBeEditable();
      await expect(failedPage.textFilter('itemTitle')).toBeEditable();
      await expect(failedPage.textFilter('startingPrice')).toBeEditable();
      await expect(failedPage.searchButton).toBeEnabled();
      await expect(failedPage.resetButton).toBeVisible();

      await expect(failedPage.columnHeaders).toHaveText([...failedText.columnHeaders]);
      await expect(failedPage.summary).toHaveText(gridSummary(1, failedData.pageSize));
      await expect(failedPage.rows).toHaveCount(failedData.pageSize);
      await expect(failedPage.activePage).toHaveText('1');
    },
  );

  test(
    'FL-PAGE-02 Toolbar: Create Auction is always on, Add to Auction needs a selection',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await expect(failedPage.createAuctionButton).not.toHaveClass(disabled);
      await expect(failedPage.addToAuctionButton).toHaveClass(disabled);

      const checkbox = failedPage.rowCheckbox(failedPage.rows.first());
      await checkbox.check();
      await expect(failedPage.addToAuctionButton).not.toHaveClass(disabled);

      await checkbox.uncheck();
      await expect(failedPage.addToAuctionButton).toHaveClass(disabled);
    },
  );

  test(
    'FL-PAGE-02b Select all selects every row on the page, and clearing it deselects them',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.selectAllCheckbox.check();
      for (const checkbox of await failedPage.rowCheckboxes.all()) {
        await expect(checkbox).toBeChecked();
      }
      await expect(failedPage.addToAuctionButton).not.toHaveClass(disabled);

      await failedPage.selectAllCheckbox.uncheck();
      for (const checkbox of await failedPage.rowCheckboxes.all()) {
        await expect(checkbox).not.toBeChecked();
      }
      await expect(failedPage.addToAuctionButton).toHaveClass(disabled);
    },
  );

  test(
    'FL-PAGE-03 Every row has Repricing, Upload Invoice and Suspend; Direct Sale only where there are bids',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      const rows = await failedPage.readRows();
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        expect(row.actions, `item ${row.itemId} always offers these`).toEqual(
          expect.arrayContaining(['Repricing', 'Upload Invoice', 'Suspend']),
        );
      }
      // Bids are necessary for Direct Sale (confirmed 2026-11-11 on every row of the list);
      // they are not sufficient, so rows with bids but no button are legacy data, not failures.
      for (const row of rows.filter((r) => r.actions.includes('Direct Sale'))) {
        expect(row.totalBids, `item ${row.itemId} offers Direct Sale`).toBeGreaterThan(0);
        expect(row.customer, `item ${row.itemId} has a customer`).not.toBe(
          failedText.customerNotSet,
        );
        expect(row.highestPrice ?? 0, `item ${row.itemId} has a highest price`).toBeGreaterThan(0);
      }
      for (const row of rows.filter((r) => r.totalBids === 0)) {
        expect(row.actions, `item ${row.itemId} has no bids`).not.toContain('Direct Sale');
      }
    },
  );

  test(
    'FL-PAGE-04 Each row shows consistent auction, vehicle, price and date details',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      for (const row of await failedPage.readRows()) {
        expect(row.auctionId, 'auction ID equals the item ID').toBe(row.itemId);
        expect(row.vehicleId).toMatch(/^\d+$/);
        expect(row.vin).toMatch(/^[A-Z0-9]{17} #F\d+$/);
        expect(row.supplier).not.toBe('');
        expect(row.failedReason).not.toBe('');
        expect(row.startingPrice, `item ${row.itemId} starting price`).not.toBeNull();
        expect(row.endDate >= row.startDate, `item ${row.itemId} ends after it starts`).toBe(true);
        expect(row.totalBidders).toBeLessThanOrEqual(row.totalBids);
      }
    },
  );

  test(
    'FL-PAGE-05 Links open the vehicle page and the statistics popups',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      const row = failedPage.rows.first();
      const vehicleId = await failedPage.rowVehicleId(row);

      const tab = await failedPage.openInNewTab(failedPage.rowVehicleLink(row));
      await expect(tab).toHaveURL(failedUrls.vehicleView(vehicleId));
      await tab.close();

      await failedPage.rowModalLinks(row).first().click();
      await expect(failedPage.infoModal.first()).toBeVisible();
    },
  );

  test(
    'FL-PAGE-06 Arabic supplier names and plates show in the grid',
    { tag: ['@functional', '@ui'] },
    async ({ failedPage }) => {
      const suppliers = await failedPage.cells('itemInfo').allInnerTexts();
      expect(suppliers.some((text) => arabicLetters.test(text))).toBe(true);
    },
  );

  test(
    'FL-PAGE-07 Repricing asks for confirmation, and Cancel keeps the vehicle in Failed',
    { tag: ['@functional'] },
    async ({ page, failedPage }) => {
      const itemId = await failedPage.rowId(failedPage.rows.first());

      await failedPage.startRepricing(failedPage.row(itemId));
      await expect(failedPage.confirmDialog.message).toHaveText(failedText.repricingConfirmMessage);

      await failedPage.confirmDialog.cancel();

      await expect(failedPage.confirmDialog.dialog).toBeHidden();
      await expect(page).toHaveURL(failedUrls.list);
      await page.reload();
      await expect(failedPage.row(itemId)).toHaveCount(1);
    },
  );

  test(
    'FL-PAGE-08 Ok on the Repricing question only opens the pricing form: the vehicle stays in Failed until it is saved',
    { tag: ['@functional'] },
    async ({ page, failedPage, pricingUpdatePage }) => {
      const row = failedPage.rows.first();
      const itemId = await failedPage.rowId(row);
      const vehicleId = await failedPage.rowVehicleId(row);
      const vin = FailedPage.baseVin(await failedPage.readRow(row).then((r) => r.vin));
      const saves = pricingUpdatePage.countSaves();

      await failedPage.startRepricing(row);
      await failedPage.confirmRepricing();

      await expect(page).toHaveURL(failedUrls.pricingUpdate(vehicleId));
      await expect(page).toHaveTitle(new RegExp(`^${failedText.pricingUpdateTitlePrefix}`));
      await expect(pricingUpdatePage.reservePriceInput).toHaveAttribute('readonly', '');
      expect(saves(), 'opening the form saves nothing').toBe(0);

      // Leaving without saving: the vehicle is still in Failed.
      await failedPage.gotoByVin(vin);
      await expect(failedPage.row(itemId)).toHaveCount(1);
    },
  );

  test(
    'FL-PAGE-09 Create Auction opens the wizard for Failed vehicles',
    { tag: ['@functional'] },
    async ({ page, failedPage, createAuctionPage }) => {
      await failedPage.openCreateAuction();

      await expect(page).toHaveURL(failedUrls.createAuction);
      await expect(page).toHaveTitle(failedText.createAuctionTitle);
      await expect(createAuctionPage.titleInput).toBeEditable();
      await expect(createAuctionPage.nextButton).toBeVisible();
      await expect(createAuctionPage.createAuctionButton).toBeHidden();
    },
  );
});
