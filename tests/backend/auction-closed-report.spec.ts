import fs from 'node:fs';
import { expect, test } from '@fixtures/test.fixture';
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

test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

/** The newest QA live-test auction on the first page, or null when there is none. */
async function newestLiveTestAuction(
  report: AuctionClosedReportPage,
): Promise<ClosedAuctionRow | null> {
  const rows = await report.readRows();
  return rows.find((row) => row.title.startsWith(auctionClosedData.liveTestTitlePrefix)) ?? null;
}

/** Splits one CSV line of double-quoted fields ("a","b ""c""") into its values. */
function csvFields(line: string): string[] {
  return [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'));
}

test.describe('Backend - Auction Closed report', () => {
  test.beforeEach(async ({ page, auctionClosedReportPage }) => {
    await auctionClosedReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(auctionClosedUrls.list);
  });

  test('Report shows the heading, filters and the closed auctions grid', async ({
    page,
    auctionClosedReportPage: report,
  }) => {
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
  });

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
      test(rule, async ({ auctionClosedReportPage: report }) => {
        const rows = await report.readRows();

        const broken = rows.filter((row) => !holds(row)).map((row) => `#${row.id} ${row.title}`);
        expect(broken, `Auctions breaking "${rule}"`).toEqual([]);
      });
    }

    test('End date is not before the start date', async ({ auctionClosedReportPage: report }) => {
      // Known bug (found 2026-11-09): some auctions show an end date before their start date
      // (e.g. #1519 "shiraz": start 2026-11-02 17:59:00, end 17:04:42; #1509: start 11-06, end
      // 11-02). Remove test.fail() once closed auctions keep consistent dates.
      test.fail(true, 'Known bug: some closed auctions end before they start.');
      const rows = await report.readRows();

      const broken = rows.filter((row) => row.endDate < row.startDate);
      expect(broken.map((row) => `#${row.id} ${row.startDate} > ${row.endDate}`)).toEqual([]);
    });
  });

  test('A QA live-test auction shows one vehicle that failed with no bids', async ({
    auctionClosedReportPage: report,
  }) => {
    const auction = await newestLiveTestAuction(report);
    test.skip(!auction, 'No QA live-test auction on the first page (run auction-live.spec.ts).');

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
  });

  test.describe('filters', () => {
    test('Auction title shows only that auction', async ({ auctionClosedReportPage: report }) => {
      const auction = await newestLiveTestAuction(report);
      test.skip(!auction, 'No QA live-test auction on the first page (run auction-live.spec.ts).');

      await report.filterByAuctionTitle(auction!.title);

      await expect(report.titleValue).toContainText(auction!.title);
      await expect(report.rows).toHaveCount(1);
      await expect(report.row(auction!.id)).toHaveCount(1);
    });

    test('Supplier shows that supplier’s auctions only', async ({
      auctionClosedReportPage: report,
    }) => {
      const auction = await newestLiveTestAuction(report);
      test.skip(!auction, 'No QA live-test auction on the first page (run auction-live.spec.ts).');
      const total = await report.totalCount();

      // The QA live-test vehicles belong to supplier 782 ...
      await report.filterBySupplier(auctionClosedData.liveTestSupplierOption);
      await expect(report.row(auction!.id)).toHaveCount(1);
      expect(await report.totalCount()).toBeLessThan(total);

      // ... so another supplier's report does not list them.
      await report.filterBySupplier(auctionClosedData.otherSupplierOption);
      await expect(report.row(auction!.id)).toHaveCount(0);
    });

    for (const type of ['start', 'end'] as const) {
      test(`${type === 'start' ? 'Start' : 'End'} date range shows auctions of that day only`, async ({
        auctionClosedReportPage: report,
      }) => {
        const auction = await newestLiveTestAuction(report);
        test.skip(
          !auction,
          'No QA live-test auction on the first page (run auction-live.spec.ts).',
        );
        const day = (type === 'start' ? auction!.startDate : auction!.endDate).slice(0, 10);

        await report.gotoDateRange(type, day, day);

        await expect(report.row(auction!.id)).toHaveCount(1);
        const rows = await report.readRows();
        const dates = rows.map((row) => (type === 'start' ? row.startDate : row.endDate));
        expect(dates.filter((date) => !date.startsWith(day))).toEqual([]);
      });
    }

    test('Reset clears the filters', async ({ page, auctionClosedReportPage: report }) => {
      const total = await report.totalCount();
      await report.filterBySupplier(auctionClosedData.otherSupplierOption);
      expect(await report.totalCount()).toBeLessThan(total);

      await report.reset();

      await expect(page).toHaveURL(/\/backend\/report\/auction-closed-report\/index$/);
      expect(await report.totalCount()).toBe(total);
    });
  });

  test('Page 2 shows the next 20 auctions', async ({ page, auctionClosedReportPage: report }) => {
    const firstPageIds = await report.rowIds();

    await report.goToPage(2);

    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(report.activePage).toHaveText('2');
    await expect(report.summary).toHaveText(/^Showing 21-40 of [\d,]+ items\.$/);
    const secondPageIds = await report.rowIds();
    expect(secondPageIds.filter((id) => firstPageIds.includes(id))).toEqual([]);
  });

  test('Export CSV downloads every auction with the same values', async ({
    auctionClosedReportPage: report,
  }) => {
    test.slow();
    const total = await report.totalCount();
    const [first] = await report.readRows();

    const download = await report.exportCsv();

    expect(download.suggestedFilename()).toMatch(auctionClosedUrls.csvFileName);
    const content = fs.readFileSync(await download.path(), 'utf8');
    // The file starts with a byte order mark (U+FEFF) for Excel; drop it before parsing.
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const lines = text.split(/\r?\n/).filter(Boolean);
    expect(csvFields(lines[0])).toEqual([...auctionClosedText.csvHeaders]);
    expect(lines.length - 1, 'auctions in the CSV').toBe(total);
    // The first CSV row is the first auction of the report.
    expect(csvFields(lines[1])).toEqual([
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
  });
});
