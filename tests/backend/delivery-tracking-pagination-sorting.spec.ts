import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { DeliveryTrackingPage } from '@pages/backend/delivery/delivery-tracking.page';
import { trackingData } from '@test-data/backend-delivery.data';

// Delivery Tracking paging and sorting, read-only, as Dev Root. The page count is worked out from
// the grid's own total, so the test follows the data. Sorting is checked on the delivery dates
// shown. Only "Date of delivery" is sortable, and there is no page-size control (the address
// accepts one; that is noted, not relied on).
test.use(devRootSession);

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

test.describe('Backend - Delivery Tracking - paging', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ deliveryTrackingPage }) => {
    await deliveryTrackingPage.goto();
  });

  test(
    'TRK-PAG-01 Walking every page shows each shipment once: no repeats and none missing',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      test.slow();
      const { total } = await deliveryTrackingPage.summaryCounts();
      const pages = Math.ceil(total / trackingData.pageSize);
      expect(pages, 'pages in the dataset').toBeGreaterThan(1);

      const seen = new Map<string, number>();
      for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
        await deliveryTrackingPage.gotoPage(pageNumber);
        const expectedRows =
          pageNumber < pages ? trackingData.pageSize : total - trackingData.pageSize * (pages - 1);
        await expect(deliveryTrackingPage.rows, `rows on page ${pageNumber}`).toHaveCount(
          expectedRows,
        );
        for (const id of await deliveryTrackingPage.rowIds()) seen.set(id, (seen.get(id) ?? 0) + 1);
      }

      const repeated = [...seen].filter(([, times]) => times > 1).map(([id]) => id);
      expect(repeated, 'shipments shown on more than one page').toEqual([]);
      expect(seen.size, 'distinct shipments shown across all pages').toBe(total);
    },
  );

  test(
    'TRK-PAG-02 The pager moves to the next, previous, first and last page',
    { tag: ['@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      const { total } = await deliveryTrackingPage.summaryCounts();
      const pages = Math.ceil(total / trackingData.pageSize);
      await expect(deliveryTrackingPage.activePage).toHaveText('1');
      await expect(deliveryTrackingPage.previousPage).toHaveClass(/disabled/);

      await deliveryTrackingPage.goToNextPage();
      await expect(deliveryTrackingPage.activePage).toHaveText('2');
      await expect(page).toHaveURL(/[?&]page=2(&|$)/);

      await deliveryTrackingPage.goToPreviousPage();
      await expect(deliveryTrackingPage.activePage).toHaveText('1');

      await deliveryTrackingPage.goToPage(pages);
      await expect(deliveryTrackingPage.activePage).toHaveText(String(pages));
      await expect(deliveryTrackingPage.nextPage).toHaveClass(/disabled/);
      await expect(deliveryTrackingPage.summary).toHaveText(
        new RegExp(
          `^Showing ${trackingData.pageSize * (pages - 1) + 1}-${total} of ${total} items?[.]$`,
        ),
      );

      await deliveryTrackingPage.goToPage(1);
      await expect(deliveryTrackingPage.activePage).toHaveText('1');
    },
  );

  test(
    'TRK-PAG-03 A page number past the last page shows the last page',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      const { total } = await deliveryTrackingPage.summaryCounts();
      const pages = Math.ceil(total / trackingData.pageSize);

      await deliveryTrackingPage.gotoPage(pages + 50);

      await expect(deliveryTrackingPage.activePage).toHaveText(String(pages));
      await expect(deliveryTrackingPage.summary).toHaveText(
        new RegExp(
          `^Showing ${trackingData.pageSize * (pages - 1) + 1}-${total} of ${total} items?[.]$`,
        ),
      );
    },
  );

  test(
    'TRK-PAG-04 A page number of 0 or text shows the first page',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      for (const value of ['0', 'abc', '-1']) {
        await deliveryTrackingPage.gotoWithQuery(`page=${value}`);

        await expect(deliveryTrackingPage.activePage, `page=${value}`).toHaveText('1');
        await expect(deliveryTrackingPage.rows, `page=${value}`).toHaveCount(trackingData.pageSize);
      }
    },
  );

  test(
    'TRK-PAG-05 The address accepts a page size, though the page has no control for it',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.gotoWithQuery('per-page=5');

      await expect(deliveryTrackingPage.rows).toHaveCount(5);
      await expect(deliveryTrackingPage.summary).toHaveText(/^Showing 1-5 of \d+ items?[.]$/);
    },
  );
});

test.describe('Backend - Delivery Tracking - sorting', { tag: ['@regression'] }, () => {
  const dates = async (page: DeliveryTrackingPage) =>
    (await page.readRows()).map((row) => row.deliveryDate);

  test(
    'TRK-SRT-01 Without a choice, the newest deliveries come first',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.goto();

      const shown = await dates(deliveryTrackingPage);

      expect(shown).toEqual([...shown].sort().reverse());
    },
  );

  test(
    'TRK-SRT-02 Date of delivery sorts oldest first, then newest first',
    { tag: ['@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      await deliveryTrackingPage.goto();

      await deliveryTrackingPage.sortByDate();
      await expect(page).toHaveURL(/[?&]sort=delivery_date(&|$)/);
      const ascending = await dates(deliveryTrackingPage);
      expect(ascending).toEqual([...ascending].sort());

      await deliveryTrackingPage.sortByDate();
      await expect(page).toHaveURL(/[?&]sort=-delivery_date(&|$)/);
      const descending = await dates(deliveryTrackingPage);
      expect(descending).toEqual([...descending].sort().reverse());
      expect(descending[0] >= ascending[ascending.length - 1]).toBe(true);
    },
  );

  test(
    'TRK-SRT-03 The sort order carries over to the next page',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.gotoWithQuery('sort=delivery_date');
      const first = await dates(deliveryTrackingPage);

      await deliveryTrackingPage.goToNextPage();
      const second = await dates(deliveryTrackingPage);

      expect(second).toEqual([...second].sort());
      expect(second[0] >= first[first.length - 1], 'page 2 continues after page 1').toBe(true);
    },
  );

  test(
    'TRK-SRT-04 Only Date of delivery is sortable',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.goto();

      await expect(deliveryTrackingPage.columnHeaders.locator('a')).toHaveText([
        'Date of delivery',
      ]);
    },
  );
});
