import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { escapeRegExp } from '@utils/text';
import {
  waitingApprovalData,
  waitingApprovalEndpoints,
  waitingApprovalText,
  waitingApprovalUrls,
} from '@test-data/backend-waiting-approval.data';

// Under Review Auctions (/backend/auction/waiting-approval/index, "Waiting Approval" in the
// sidebar). The rows are real auctions from other people's testing, waiting for a decision, so
// every test is read-only: Accept, Decline and Failed are opened and closed, never confirmed.
// Each test reads its values from the rows listed at the time.

// Signed in as Dev Root with no trace or video; failures attach a masked screenshot (fixture).
test.use(devRootSession);

test.describe('Backend - Waiting Approval (Under Review Auctions)', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, waitingApprovalPage }) => {
    await waitingApprovalPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(waitingApprovalUrls.list);
    await expect(
      waitingApprovalPage.rows.first(),
      'No auction waiting for approval on staging right now: these tests need at least one.',
    ).toBeVisible();
  });

  test.describe('page', () => {
    test(
      'Page shows the heading, filters and the vehicles waiting for a decision',
      { tag: ['@smoke', '@functional'] },
      async ({ page, waitingApprovalPage }) => {
        await expect(page).toHaveTitle(waitingApprovalText.pageTitle);
        await expect(waitingApprovalPage.pageHeading).toHaveText(waitingApprovalText.pageTitle);
        await expect(waitingApprovalPage.breadcrumbCurrent).toHaveText(
          waitingApprovalText.pageTitle,
        );
        await expect(waitingApprovalPage.sidebarLink).toHaveText(waitingApprovalText.sidebarLabel);

        await expect(waitingApprovalPage.vinInput).toBeEditable();
        await expect(waitingApprovalPage.titleInput).toBeEditable();
        await expect(waitingApprovalPage.searchButton).toBeEnabled();
        await expect(waitingApprovalPage.resetButton).toBeVisible();

        await expect(waitingApprovalPage.columnHeaders).toHaveText([
          ...waitingApprovalText.columnHeaders,
        ]);
        await expect(waitingApprovalPage.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
      },
    );

    test(
      'Every row has Accept, Decline and Failed, and a bidders link',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const rows = waitingApprovalPage.rows;
        const rowCount = await rows.count();

        await expect(waitingApprovalPage.acceptLink(rows)).toHaveCount(rowCount);
        await expect(waitingApprovalPage.declineLink(rows)).toHaveCount(rowCount);
        await expect(waitingApprovalPage.failedLink(rows)).toHaveCount(rowCount);
        await expect(waitingApprovalPage.biddersLink(rows)).toHaveCount(rowCount);
      },
    );
  });

  test.describe('search and filters', () => {
    test(
      'Searching by VIN shows only that vehicle',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const itemId = await waitingApprovalPage.rowId(row);
        const vin = await waitingApprovalPage.rowVin(row);

        await waitingApprovalPage.searchByVin(vin);

        await expect(waitingApprovalPage.vinInput).toHaveValue(vin);
        await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
        await expect(waitingApprovalPage.itemInfoCells.filter({ hasNotText: vin })).toHaveCount(0);
      },
    );

    test(
      'Searching by part of a VIN shows every vehicle containing it',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const itemId = await waitingApprovalPage.rowId(row);
        const partialVin = (await waitingApprovalPage.rowVin(row)).slice(
          0,
          waitingApprovalData.partialVinLength,
        );

        await waitingApprovalPage.searchByVin(partialVin);

        await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
        await expect(
          waitingApprovalPage.itemInfoCells.filter({ hasNotText: partialVin }),
        ).toHaveCount(0);
      },
    );

    test(
      'Searching for an unknown VIN shows no results',
      { tag: '@negative' },
      async ({ waitingApprovalPage }) => {
        await waitingApprovalPage.searchByVin(waitingApprovalData.unknownVin);

        await expect(waitingApprovalPage.emptyMessage).toHaveText(waitingApprovalText.noResults);
        await expect(waitingApprovalPage.rows).toHaveCount(0);
      },
    );

    test(
      'Title searches the vehicle title',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const itemId = await waitingApprovalPage.rowId(row);
        // The vehicle's make, e.g. "Chery" from "Chery Arrizo 8 Pro 2023".
        const make = (await waitingApprovalPage.rowItemValue(row, 'Title')).split(' ')[0];

        await waitingApprovalPage.searchByTitle(make);

        await expect(waitingApprovalPage.titleInput).toHaveValue(make);
        await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
        await expect(waitingApprovalPage.itemInfoCells.filter({ hasNotText: make })).toHaveCount(0);
      },
    );

    test(
      'Bidding Type "Standard" shows only Standard auctions',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        await waitingApprovalPage.filterByBidType('Standard');

        await expect(waitingApprovalPage.bidTypeValue).toContainText('Standard');
        await expect(
          waitingApprovalPage.auctionCells.filter({ hasNotText: 'Bidding Type Standard' }),
        ).toHaveCount(0);
      },
    );

    test(
      'Bidding Type "Price Offering" shows no Standard auction',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        await waitingApprovalPage.filterByBidType('Price Offering');

        await expect(waitingApprovalPage.bidTypeValue).toContainText('Price Offering');
        await expect(
          waitingApprovalPage.auctionCells.filter({ hasText: 'Bidding Type Standard' }),
        ).toHaveCount(0);
      },
    );

    test(
      'Filtering by auction shows only that auction’s vehicles',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const itemId = await waitingApprovalPage.rowId(row);
        const auctionTitle = await waitingApprovalPage.rowAuctionTitle(row);

        await waitingApprovalPage.filterByAuction(auctionTitle);

        await expect(waitingApprovalPage.auctionValue).toContainText(auctionTitle);
        await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
        await expect(
          waitingApprovalPage.auctionCells.filter({ hasNotText: auctionTitle }),
        ).toHaveCount(0);
      },
    );

    test(
      'Filtering by supplier shows only that supplier’s vehicles',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const itemId = await waitingApprovalPage.rowId(row);
        const supplier = await waitingApprovalPage.rowItemValue(row, 'Supplier');

        await waitingApprovalPage.filterBySupplier(
          new RegExp(`^\\s*${escapeRegExp(supplier)} - Supplier\\s*$`),
        );

        await expect(waitingApprovalPage.supplierValue).toContainText(supplier);
        await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
        await expect(
          waitingApprovalPage.itemInfoCells.filter({ hasNotText: supplier }),
        ).toHaveCount(0);
      },
    );

    test(
      'Reset clears the filters and shows every vehicle again',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const total = await waitingApprovalPage.totalCount();
        await waitingApprovalPage.searchByVin(waitingApprovalData.unknownVin);
        await expect(waitingApprovalPage.emptyMessage).toBeVisible();

        await waitingApprovalPage.reset();

        await expect(waitingApprovalPage.vinInput).toHaveValue('');
        await expect.poll(() => waitingApprovalPage.totalCount()).toBe(total);
      },
    );
  });

  test.describe('sorting', () => {
    test(
      'Statistics sorts by total bids, ascending then descending',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        await waitingApprovalPage.gotoSortedByStatistics();
        const ascending = await waitingApprovalPage.totalBids();
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await waitingApprovalPage.gotoSortedByStatistics(true);
        const descending = await waitingApprovalPage.totalBids();
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
      },
    );
  });

  test.describe('decisions (opened and closed, never confirmed)', () => {
    for (const decision of ['accept', 'decline'] as const) {
      test(
        `Cancelling ${decision === 'accept' ? 'Accept' : 'Decline'} shows the net prices and decides nothing`,
        { tag: '@functional' },
        async ({ page, waitingApprovalPage }) => {
          const row = waitingApprovalPage.rows.first();
          const itemId = await waitingApprovalPage.rowId(row);
          const netWithVat = await waitingApprovalPage.rowPrice(row, 'Net Price (Vat Inclusive)');
          const netWithoutVat = await waitingApprovalPage.rowPrice(row, 'Net Price without VAT');
          // The decision endpoints are blocked for the whole test: a misclick on OK, or a dialog
          // that no longer asks, can never accept or decline a real auction.
          const submissions = await waitingApprovalPage.blockRequests(
            waitingApprovalEndpoints.accept,
            waitingApprovalEndpoints.decline,
            waitingApprovalEndpoints.failed,
          );
          const link =
            decision === 'accept'
              ? waitingApprovalPage.acceptLink(row)
              : waitingApprovalPage.declineLink(row);

          await link.click();

          await expect(waitingApprovalPage.confirmTitle).toHaveText(
            waitingApprovalText.confirmTitle,
          );
          await expect(waitingApprovalPage.confirmMessage).toContainText(
            decision === 'accept'
              ? waitingApprovalText.acceptMessage
              : waitingApprovalText.declineMessage,
          );
          // The dialog repeats the row's net prices, so the approver sees what they decide on.
          await expect(waitingApprovalPage.confirmMessage).toContainText(netWithVat);
          await expect(waitingApprovalPage.confirmMessage).toContainText(netWithoutVat);

          await waitingApprovalPage.closeDialog(waitingApprovalPage.confirmModal);

          await expect(waitingApprovalPage.confirmModal).toBeHidden();
          expect(submissions()).toBe(0);
          await page.reload();
          await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
        },
      );
    }

    test(
      'Failed asks for a penalty amount, and Close marks nothing failed',
      { tag: '@functional' },
      async ({ page, waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const itemId = await waitingApprovalPage.rowId(row);
        // Blocked for the whole test, so a real auction can never be marked failed.
        const submissions = await waitingApprovalPage.blockRequests(
          waitingApprovalEndpoints.accept,
          waitingApprovalEndpoints.decline,
          waitingApprovalEndpoints.failed,
        );

        await waitingApprovalPage.failedLink(row).click();

        await expect(waitingApprovalPage.failedTitle).toHaveText(waitingApprovalText.failedTitle);
        await expect(waitingApprovalPage.penaltyInput).toBeEditable();

        await waitingApprovalPage.closeDialog(waitingApprovalPage.failedModal);

        await expect(waitingApprovalPage.failedModal).toBeHidden();
        expect(submissions()).toBe(0);
        await page.reload();
        await expect(waitingApprovalPage.row(itemId)).toHaveCount(1);
      },
    );

    test(
      'Bidders dialog lists that vehicle’s bids, highest first',
      { tag: '@functional' },
      async ({ waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const vin = await waitingApprovalPage.rowVin(row);
        const totalBids = await waitingApprovalPage.rowTotalBids(row);
        const highest = await waitingApprovalPage.rowPrice(row, 'Highest Price');

        await waitingApprovalPage.biddersLink(row).click();

        await expect(waitingApprovalPage.biddersTitle).toHaveText(waitingApprovalText.biddersTitle);
        await expect(waitingApprovalPage.biddersModal).toContainText(vin);
        await expect(waitingApprovalPage.biddersModal).toContainText(
          new RegExp(`Total ${totalBids} items?\\.`),
        );
        await expect(waitingApprovalPage.bidderRows.first()).toContainText(highest);
        await waitingApprovalPage.closeDialog(waitingApprovalPage.biddersModal);
        await expect(waitingApprovalPage.biddersModal).toBeHidden();
      },
    );
  });

  test.describe('links', () => {
    test(
      'Vehicle title opens the vehicle, read-only while under review',
      { tag: '@functional' },
      async ({ page, waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const link = waitingApprovalPage.vehicleLink(row);
        const vehicleId = (await link.getAttribute('href'))?.match(/id=(\d+)/)?.[1];

        const [vehiclePage] = await Promise.all([
          page.context().waitForEvent('page'),
          link.click(),
        ]);
        await vehiclePage.waitForLoadState();

        // The link points to the edit page, but a vehicle under review cannot be edited: the
        // Backend redirects to its read-only view (seen 2026-11-09).
        await expect(vehiclePage).toHaveURL(waitingApprovalUrls.vehicleView(vehicleId!));
        await expect(vehiclePage).toHaveTitle(/^View Info: /);
      },
    );

    test(
      'Failure mark opens the failed report for that VIN in a new tab',
      { tag: '@functional' },
      async ({ page, waitingApprovalPage }) => {
        const row = waitingApprovalPage.rows.first();
        const vin = await waitingApprovalPage.rowVin(row);

        const [reportPage] = await Promise.all([
          page.context().waitForEvent('page'),
          waitingApprovalPage.failureMarkLink(row).click(),
        ]);
        await reportPage.waitForLoadState();

        await expect(reportPage).toHaveURL(waitingApprovalUrls.failedReport);
        await expect(reportPage).toHaveURL(new RegExp(vin));
      },
    );
  });
});
