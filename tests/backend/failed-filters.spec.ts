import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { type FailedRow, FailedPage } from '@pages/backend/auctions/failed.page';
import { failedData, failedText, failedUrls } from '@test-data/backend-failed.data';
import { escapeRegExp } from '@utils/text';
import { shownOption } from '@utils/widgets';

/** What a dropdown filter shows for a chosen option (Select2 puts a clear button in front). */
const shows = (text: string) => shownOption(escapeRegExp(text));

// Read-only checks of every filter on the Failed Auctions list, one by one and combined. Expected
// values are read from the list itself (never fixed), because the failed records change.
test.use(devRootSession);

/** Reads the current page and checks that it is not empty and that every row matches. */
async function everyRowMatches(
  failedPage: FailedPage,
  describe: string,
  predicate: (row: FailedRow) => boolean,
): Promise<FailedRow[]> {
  const rows = await failedPage.readRows();
  expect(rows.length, `rows for ${describe}`).toBeGreaterThan(0);
  const strangers = rows.filter((row) => !predicate(row));
  expect(
    strangers.map((row) => `${row.itemId} ${row.vin}`),
    `rows that do not match ${describe}`,
  ).toEqual([]);
  return rows;
}

test.describe('Backend - Failed List - filters', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, failedPage }) => {
    await failedPage.goto();
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
    'FL-FLT-00 Every filter is shown with its options',
    { tag: ['@smoke', '@functional'] },
    async ({ failedPage }) => {
      for (const filter of ['vin', 'itemTitle', 'startingPrice'] as const) {
        await expect(failedPage.textFilter(filter), `${filter} filter`).toBeEditable();
      }
      await expect(failedPage.filterOptions('type')).resolves.toEqual([...failedData.typeOptions]);
      await expect(failedPage.filterOptions('auctionType')).resolves.toEqual([
        ...failedData.auctionTypeOptions,
      ]);
      await expect(failedPage.filterOptions('bidType')).resolves.toEqual([
        ...failedData.bidTypeOptions,
      ]);
      await expect(failedPage.filterOptions('showAllFailed')).resolves.toEqual([
        ...failedData.showAllOptions,
      ]);
      await expect(failedPage.filterOptions('dateRangeType')).resolves.toEqual([
        ...failedData.dateRangeTypeOptions,
      ]);

      const reasons = await failedPage.filterOptions('failedReason');
      for (const reason of failedData.expectedFailedReasons) expect(reasons).toContain(reason);

      const suppliers = await failedPage.filterOptions('supplier');
      expect(suppliers.length).toBeGreaterThan(0);
      for (const supplier of suppliers) expect(supplier).toMatch(/ - Supplier$/);
      expect((await failedPage.filterOptions('auction')).length).toBeGreaterThan(0);
    },
  );

  test.describe('text filters', () => {
    test(
      'FL-FLT-01 VIN shows only that vehicle (every attempt of it is a separate row)',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const vin = FailedPage.baseVin(first.vin);

        await failedPage.searchBy('vin', vin);

        await expect(page).toHaveURL(/FailedListViewSearch%5Bvin_number%5D=/);
        await expect(failedPage.textFilter('vin')).toHaveValue(vin);
        await everyRowMatches(failedPage, `VIN ${vin}`, (row) => row.vin.startsWith(vin));
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-FLT-02 Part of a VIN matches every vehicle containing it',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const part = FailedPage.baseVin(first.vin).slice(0, failedData.partialVinLength);

        await failedPage.searchBy('vin', part);

        await everyRowMatches(failedPage, `VIN containing ${part}`, (row) =>
          row.vin.includes(part),
        );
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-FLT-03 Item title matches vehicles whose title contains the text',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const word = first.vehicleTitle.split(/\s+/)[0];

        await failedPage.searchBy('itemTitle', word);

        await everyRowMatches(failedPage, `title containing ${word}`, (row) =>
          row.vehicleTitle.toLowerCase().includes(word.toLowerCase()),
        );
      },
    );

    test(
      'FL-FLT-04 Starting price shows only items with exactly that starting price',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const price = String(first.startingPrice);

        await failedPage.searchBy('startingPrice', price);

        await everyRowMatches(
          failedPage,
          `starting price ${price}`,
          (row) => row.startingPrice === first.startingPrice,
        );
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );

    for (const [label, filter, value] of [
      ['an unknown VIN', 'vin', failedData.unknownVin],
      ['an unknown title', 'itemTitle', failedData.unknownTitle],
      ['an unused starting price', 'startingPrice', failedData.unknownStartingPrice],
    ] as const) {
      test(
        `FL-FLT-05 ${label} shows "No results found."`,
        { tag: ['@functional', '@negative'] },
        async ({ failedPage }) => {
          await failedPage.searchBy(filter, value);

          await expect(failedPage.emptyMessage).toHaveText(failedText.noResults);
          await expect(failedPage.rows).toHaveCount(0);
          await expect(failedPage.summary).toHaveCount(0);
        },
      );
    }

    test(
      'FL-FLT-06 Starting price keeps only digits as you type, and refuses a decimal',
      { tag: ['@functional', '@negative'] },
      async ({ page, failedPage }) => {
        const total = await failedPage.totalCount();

        // Letters and minus signs are removed while typing, so only whole numbers can be searched.
        await failedPage.fillFilter('startingPrice', 'abc');
        await expect(failedPage.textFilter('startingPrice')).toHaveValue('');
        await failedPage.fillFilter('startingPrice', '-5');
        await expect(failedPage.textFilter('startingPrice')).toHaveValue('5');

        // A decimal stays in the box, but the page refuses to search with it.
        await failedPage.fillFilter('startingPrice', '0.5');
        await failedPage.searchButton.click();
        await expect(failedPage.startingPriceError).toHaveText(
          'Starting Price must be an integer.',
        );
        await expect(page).toHaveURL(failedUrls.list);
        expect(await failedPage.totalCount()).toBe(total);
      },
    );
  });

  test.describe('dropdown filters', () => {
    test(
      'FL-FLT-07 Type shows only that type',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        for (const type of ['Vehicle', 'Bulk']) {
          await failedPage.goto();
          await failedPage.filterBy('type', type);

          await expect(page).toHaveURL(/FailedListViewSearch%5Btype%5D=\w+/);
          await expect(failedPage.selectFilterValue('type')).toHaveText(shows(type));
          await everyRowMatches(failedPage, `type ${type}`, (row) => row.type === type);
        }
      },
    );

    test(
      'FL-FLT-08 Auction type shows only that auction type',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        for (const type of failedData.auctionTypeOptions) {
          await failedPage.goto();
          await failedPage.filterBy('auctionType', type);

          await everyRowMatches(
            failedPage,
            `auction type ${type}`,
            (row) => row.auctionType === type,
          );
        }
      },
    );

    test(
      'FL-FLT-09 Bid type shows only that bidding type',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        for (const type of failedData.bidTypeOptions) {
          await failedPage.goto();
          await failedPage.filterBy('bidType', type);

          await everyRowMatches(failedPage, `bid type ${type}`, (row) => row.biddingType === type);
        }
      },
    );

    test(
      'FL-FLT-10 Failed reason shows only that reason',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        for (const reason of ['No Bids', 'Reserve Price']) {
          await failedPage.goto();
          await failedPage.filterBy('failedReason', reason);

          await everyRowMatches(
            failedPage,
            `reason ${reason}`,
            (row) => row.failedReason === reason,
          );
        }
      },
    );

    test(
      'FL-FLT-11 Supplier shows only that supplier’s items',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        const supplier = (await failedPage.readRow(failedPage.rows.first())).supplier;

        await failedPage.filterBy(
          'supplier',
          new RegExp(`^\\s*${escapeRegExp(supplier)} - Supplier\\s*$`),
        );

        await expect(page).toHaveURL(/FailedListViewSearch%5Bsupplier_id%5D=\d+/);
        await expect(failedPage.selectFilterValue('supplier')).toContainText(supplier);
        await everyRowMatches(
          failedPage,
          `supplier ${supplier}`,
          (row) => row.supplier === supplier,
        );
      },
    );

    test(
      'FL-FLT-12 Auction shows only that auction’s items',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const title = (await failedPage.readRow(failedPage.rows.first())).auctionTitle;

        await failedPage.filterBy('auction', title);

        await expect(failedPage.selectFilterValue('auction')).toHaveText(shows(title));
        await everyRowMatches(failedPage, `auction ${title}`, (row) => row.auctionTitle === title);
      },
    );

    test(
      'FL-FLT-13 Date range, by end date, shows only items ending on those days',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const day = first.endDate.slice(0, 10);

        await failedPage.gotoWithFilters({
          date_range_type: 'end',
          date_range: `${day} - ${day}`,
        });

        await everyRowMatches(failedPage, `end date ${day}`, (row) => row.endDate.startsWith(day));
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-FLT-14 Date range, by start date, shows only items starting on those days',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const day = first.startDate.slice(0, 10);

        await failedPage.gotoWithFilters({
          date_range_type: 'start',
          date_range: `${day} - ${day}`,
        });

        await everyRowMatches(failedPage, `start date ${day}`, (row) =>
          row.startDate.startsWith(day),
        );
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );
  });

  test.describe('Show All Failed', () => {
    test(
      'FL-FLT-15 Show All Failed = Yes lists at least everything the default list shows',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const defaultTotal = await failedPage.totalCount();

        await failedPage.filterBy('showAllFailed', 'Yes');
        const allTotal = await failedPage.totalCount();

        expect(allTotal).toBeGreaterThanOrEqual(defaultTotal);

        await failedPage.goto();
        await failedPage.filterBy('showAllFailed', 'No');
        expect(await failedPage.totalCount()).toBe(defaultTotal);
      },
    );

    test(
      'FL-FLT-16 The default list shows a vehicle’s latest failed attempt; Yes adds the earlier ones',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const repeated = (await failedPage.readRows()).find((row) => /#F[2-9]/.test(row.vin));
        test.skip(!repeated, 'No vehicle with a second failed attempt on page 1.');
        const vin = FailedPage.baseVin(repeated!.vin);
        const latest = Number(repeated!.vin.match(/#F(\d+)/)![1]);

        await failedPage.gotoByVin(vin);
        await expect(failedPage.rows).toHaveCount(1);

        await failedPage.gotoWithFilters({ vin_number: vin, show_all_failed: '1' });
        const marks = (await failedPage.readRows()).map((row) =>
          Number(row.vin.match(/#F(\d+)/)![1]),
        );
        expect(marks).toContain(latest);
        expect(marks.length).toBeGreaterThan(1);
        expect(Math.max(...marks)).toBe(latest);
      },
    );
  });

  test.describe('combined filters, reset and pagination', () => {
    test(
      'FL-FLT-17 Type, auction type and bid type together narrow the list',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        await failedPage.chooseFilter('type', 'Vehicle');
        await failedPage.chooseFilter('auctionType', 'Instant Auction');
        await failedPage.chooseFilter('bidType', 'Standard');
        await failedPage.search();

        const total = await failedPage.totalCount();
        await everyRowMatches(
          failedPage,
          'Vehicle + Instant Auction + Standard',
          (row) =>
            row.type === 'Vehicle' &&
            row.auctionType === 'Instant Auction' &&
            row.biddingType === 'Standard',
        );

        await failedPage.goto();
        await failedPage.filterBy('type', 'Vehicle');
        expect(total).toBeLessThanOrEqual(await failedPage.totalCount());
      },
    );

    test(
      'FL-FLT-18 Supplier and failed reason together show only matching items',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());

        await failedPage.chooseFilter(
          'supplier',
          new RegExp(`^\\s*${escapeRegExp(first.supplier)} - Supplier\\s*$`),
        );
        await failedPage.chooseFilter('failedReason', first.failedReason);
        await failedPage.search();

        await everyRowMatches(
          failedPage,
          `${first.supplier} + ${first.failedReason}`,
          (row) => row.supplier === first.supplier && row.failedReason === first.failedReason,
        );
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-FLT-19 Supplier, reason and VIN together find the one item',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());
        const vin = FailedPage.baseVin(first.vin);

        await failedPage.chooseFilter(
          'supplier',
          new RegExp(`^\\s*${escapeRegExp(first.supplier)} - Supplier\\s*$`),
        );
        await failedPage.chooseFilter('failedReason', first.failedReason);
        await failedPage.fillFilter('vin', vin);
        await failedPage.search();

        await everyRowMatches(
          failedPage,
          'supplier + reason + VIN',
          (row) =>
            row.supplier === first.supplier &&
            row.failedReason === first.failedReason &&
            row.vin.startsWith(vin),
        );
        await expect(failedPage.row(first.itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-FLT-20 Conflicting filters show no results',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage }) => {
        const first = await failedPage.readRow(failedPage.rows.first());

        await failedPage.chooseFilter('type', 'Sellit');
        await failedPage.fillFilter('vin', FailedPage.baseVin(first.vin));
        await failedPage.search();

        await expect(failedPage.emptyMessage).toHaveText(failedText.noResults);
      },
    );

    test(
      'FL-FLT-21 Reset clears every filter and restores the full list',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        const total = await failedPage.totalCount();
        await failedPage.chooseFilter('type', 'Bulk');
        await failedPage.fillFilter('vin', failedData.unknownVin);
        await failedPage.search();
        await expect(failedPage.emptyMessage).toBeVisible();

        await failedPage.reset();

        await expect(page).toHaveURL(failedUrls.list);
        await expect(failedPage.textFilter('vin')).toHaveValue('');
        await expect(failedPage.selectFilterValue('type')).not.toHaveText(shows('Bulk'));
        expect(await failedPage.totalCount()).toBe(total);
      },
    );

    test(
      'FL-FLT-22 A filter stays active across pages, and next and previous work',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        await failedPage.filterBy('failedReason', 'Reserve Price');
        const total = await failedPage.totalCount();
        test.skip(total <= failedData.pageSize, 'Fewer than two pages of Reserve Price items.');

        await failedPage.goToPage(2);

        await expect(page).toHaveURL(/FailedListViewSearch%5Bfailed_reason_id%5D=\d+/);
        await expect(page).toHaveURL(/[?&]page=2(&|$)/);
        await expect(failedPage.activePage).toHaveText('2');
        await expect(failedPage.selectFilterValue('failedReason')).toHaveText(
          shows('Reserve Price'),
        );
        await everyRowMatches(
          failedPage,
          'Reserve Price on page 2',
          (row) => row.failedReason === 'Reserve Price',
        );

        await failedPage.goToPreviousPage();
        await expect(failedPage.activePage).toHaveText('1');
        await failedPage.goToNextPage();
        await expect(failedPage.activePage).toHaveText('2');
      },
    );

    test(
      'FL-FLT-23 No item appears on two pages of the default list',
      { tag: ['@functional', '@known-bug'] },
      async ({ failedPage }) => {
        // Known defect DC-01 (found 2026-11-11): the list has no stable order, so an item can
        // appear on two pages while another is never shown. Walking pages 1 to 30 one after the
        // other returned 600 rows but only 592 distinct items, the same on two runs.
        // Remove test.fail() once pages never repeat an item.
        test.fail(true, 'Known defect DC-01: pagination repeats some items and skips others.');
        test.slow();

        const seen = new Set<string>();
        const repeated: string[] = [];
        for (let pageNumber = 1; pageNumber <= 30; pageNumber++) {
          await failedPage.gotoPage(pageNumber);
          for (const id of await failedPage.rowIds()) {
            if (seen.has(id)) repeated.push(id);
            seen.add(id);
          }
        }

        expect(repeated, 'items shown on more than one page').toEqual([]);
      },
    );
  });
});
