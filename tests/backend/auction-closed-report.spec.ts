import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { parseCsv } from '@utils/csv';
import type {
  AuctionClosedReportPage,
  ClosedAuctionRow,
} from '@pages/backend/reports/auction-closed-report.page';
import {
  auctionClosedData,
  auctionClosedText,
  auctionClosedUrls,
} from '@test-data/backend-auction-closed-report.data';

// Report > Auction Closed (/backend/report/auction-closed-report/index): one row per closed
// auction with its item, view, viewer and bid counts. Read-only. The counts are checked against
// each other on the first page, and in detail against the QA live-test auctions, whose outcome is
// known (one vehicle, no bids).

test.use(devRootSession);

/** The newest QA live-test auction on the first page, or null when there is none. */
async function newestLiveTestAuction(
  report: AuctionClosedReportPage,
): Promise<ClosedAuctionRow | null> {
  const rows = await report.readRows();
  return rows.find((row) => row.title.startsWith(auctionClosedData.liveTestTitlePrefix)) ?? null;
}

test.describe('Backend - Auction Closed report', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, auctionClosedReportPage }) => {
    await auctionClosedReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(auctionClosedUrls.list);
  });

  test(
    'Report shows the heading, filters and the closed auctions grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, auctionClosedReportPage: report }) => {
      await expect(page).toHaveTitle(auctionClosedText.pageTitle);
      await expect(report.pageHeading).toHaveText(auctionClosedText.pageTitle);
      await expect(report.breadcrumbCurrent).toHaveText(auctionClosedText.pageTitle);
      await expect(report.sidebarLink).toHaveText(auctionClosedText.sidebarLabel);

      await expect(report.searchButton).toBeEnabled();
      await expect(report.resetButton).toBeVisible();
      await expect(report.exportAllButton).toBeVisible();

      await expect(report.columnHeaders).toHaveText([...auctionClosedText.columnHeaders]);
      await expect(report.summary).toHaveText(
        new RegExp(`^Showing 1-${auctionClosedData.pageSize} of [\\d,]+ items\\.$`),
      );
      await expect(report.rows).toHaveCount(auctionClosedData.pageSize);
    },
  );

  test.describe('counts add up (every auction on the first page)', () => {
    const rules: [string, (row: ClosedAuctionRow) => boolean][] = [
      ['Items = Sold + Failed', (row) => row.items === row.sold + row.failed],
      ['No Bid is at most Failed', (row) => row.noBid <= row.failed],
      ['Views = Before + During auction', (row) => row.views === row.viewsBefore + row.viewsDuring],
      [
        'Viewers = Before + During auction',
        (row) => row.viewers === row.viewersBefore + row.viewersDuring,
      ],
      ['Viewers are at most Views', (row) => row.viewers <= row.views],
      ['Bidders are at most Bids', (row) => row.bidders <= row.bids],
    ];

    for (const [rule, holds] of rules) {
      test(rule, { tag: '@functional' }, async ({ auctionClosedReportPage: report }) => {
        const rows = await report.readRows();

        const broken = rows.filter((row) => !holds(row)).map((row) => `#${row.id} ${row.title}`);
        expect(broken, `Auctions breaking "${rule}"`).toEqual([]);
      });
    }

    test(
      'End date is not before the start date',
      { tag: ['@functional', '@known-bug'] },
      async ({ auctionClosedReportPage: report }) => {
        // Known bug (found 2026-11-09): some auctions show an end date before their start date
        // (e.g. #1519 "shiraz": start 2026-11-02 17:59:00, end 17:04:42; #1509: start 11-06, end
        // 11-02). Remove test.fail() once closed auctions keep consistent dates.
        test.fail(true, 'BUG-PENDING: Known bug: some closed auctions end before they start.');
        const rows = await report.readRows();

        const broken = rows.filter((row) => row.endDate < row.startDate);
        expect(broken.map((row) => `#${row.id} ${row.startDate} > ${row.endDate}`)).toEqual([]);
      },
    );
  });

  test(
    'A QA live-test auction shows one vehicle that failed with no bids',
    { tag: '@functional' },
    async ({ auctionClosedReportPage: report }) => {
      const auction = await newestLiveTestAuction(report);
      test.skip(
        !auction,
        'Needs a QA live-test auction on the first page: run auction-live.spec.ts (opt-in) first.',
      );

      expect(auction).toMatchObject({
        items: 1,
        sold: 0,
        failed: 1,
        directSale: 0,
        buyNow: 0,
        noBid: 1,
        bids: 0,
        bidders: 0,
      });
      // It ran for three minutes (closed a few seconds after its scheduled end).
      expect(auction!.endDate > auction!.startDate).toBe(true);
    },
  );

  test.describe('filters', () => {
    test(
      'Auction title shows only that auction',
      { tag: '@functional' },
      async ({ auctionClosedReportPage: report }) => {
        // Any closed auction will do: the newest one on the first page.
        const [auction] = await report.readRows();

        await report.filterByAuctionTitle(auction.title);

        await expect(report.titleValue).toContainText(auction.title);
        await expect(report.rows).toHaveCount(1);
        await expect(report.row(auction.id)).toHaveCount(1);
      },
    );

    test(
      'Supplier shows that supplier’s auctions only',
      { tag: '@functional' },
      async ({ auctionClosedReportPage: report }) => {
        const auction = await newestLiveTestAuction(report);
        test.skip(
          !auction,
          'Needs a QA live-test auction on the first page: run auction-live.spec.ts (opt-in) first.',
        );
        const total = await report.totalCount();

        // The QA live-test vehicles belong to supplier 782 ...
        await report.filterBySupplier(auctionClosedData.liveTestSupplierOption);
        await expect(report.row(auction!.id)).toHaveCount(1);
        expect(await report.totalCount()).toBeLessThan(total);

        // ... so another supplier's report does not list them.
        await report.filterBySupplier(auctionClosedData.otherSupplierOption);
        await expect(report.row(auction!.id)).toHaveCount(0);
      },
    );

    for (const type of ['start', 'end'] as const) {
      test(
        `${type === 'start' ? 'Start' : 'End'} date range shows auctions of that day only`,
        { tag: '@functional' },
        async ({ auctionClosedReportPage: report }) => {
          // Any closed auction will do: the newest one on the first page.
          const [auction] = await report.readRows();
          const day = (type === 'start' ? auction.startDate : auction.endDate).slice(0, 10);

          await report.gotoDateRange(type, day, day);

          await expect(report.row(auction.id)).toHaveCount(1);
          const rows = await report.readRows();
          const dates = rows.map((row) => (type === 'start' ? row.startDate : row.endDate));
          expect(dates.filter((date) => !date.startsWith(day))).toEqual([]);
        },
      );
    }

    test(
      'Reset clears the filters',
      { tag: '@functional' },
      async ({ page, auctionClosedReportPage: report }) => {
        const total = await report.totalCount();
        await report.filterBySupplier(auctionClosedData.otherSupplierOption);
        expect(await report.totalCount()).toBeLessThan(total);

        await report.reset();

        await expect(page).toHaveURL(auctionClosedUrls.listUnfiltered);
        expect(await report.totalCount()).toBe(total);
      },
    );
  });

  test(
    'Page 2 shows the next 20 auctions',
    { tag: '@functional' },
    async ({ page, auctionClosedReportPage: report }) => {
      const firstPageIds = await report.rowIds();

      await report.goToPage(2);

      await expect(page).toHaveURL(/[?&]page=2(&|$)/);
      await expect(report.activePage).toHaveText('2');
      await expect(report.summary).toHaveText(/^Showing 21-40 of [\d,]+ items\.$/);
      const secondPageIds = await report.rowIds();
      expect(secondPageIds.filter((id) => firstPageIds.includes(id))).toEqual([]);
    },
  );

  test(
    'Export CSV downloads every auction with the same values',
    { tag: '@functional' },
    async ({ auctionClosedReportPage: report }) => {
      test.slow();
      const total = await report.totalCount();
      const [first] = await report.readRows();

      const download = await report.exportCsv();

      expect(download.suggestedFilename()).toMatch(auctionClosedUrls.csvFileName);
      // parseCsv drops the byte order mark and keeps quoted line breaks inside one record.
      const [headers, ...records] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));
      expect(headers).toEqual([...auctionClosedText.csvHeaders]);
      expect(records.length, 'auctions in the CSV').toBe(total);
      // The first CSV row is the first auction of the report.
      expect(records[0]).toEqual([
        first.title,
        ...[
          first.items,
          first.sold,
          first.failed,
          first.directSale,
          first.buyNow,
          first.noBid,
          first.views,
          first.viewsBefore,
          first.viewsDuring,
          first.viewers,
          first.viewersBefore,
          first.viewersDuring,
          first.bids,
          first.bidders,
        ].map(String),
        first.startDate,
        first.endDate,
      ]);
    },
  );
});
