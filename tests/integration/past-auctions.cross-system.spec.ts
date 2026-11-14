import { expect, test } from '@fixtures/test.fixture';
import { pastApiPages, pastSaleType } from '@test-data/past-auctions.data';

// Which ended cars the apps' Past list (API home/past) shows, checked against the back office's
// newest Sold and Failed rows. Read-only on both sides.

// Signs in to the back office with real credentials: no trace, video or automatic screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Past auctions - back office and app API', { tag: '@regression' }, () => {
  /** Item IDs in the app's Past list. */
  let past: Set<number>;

  test.beforeEach(async ({ mazadApi }) => {
    past = new Set<number>();
    for (let page = 1; page <= pastApiPages; page++) {
      const { body } = await mazadApi.getAuctionList({
        section: 'home',
        tab: 'past',
        lang: 'en',
        page,
        perPage: 30,
      });
      for (const item of body.data.auction_list.data) past.add(item.id);
      if (page >= body.data.auction_list.pages_count) break;
    }
  });

  test(
    'Past lists every car sold at auction, and no car sold by Buy Now or direct sale',
    { tag: '@functional' },
    async ({ backendSession, mazadSoldListPage }) => {
      void backendSession;
      await mazadSoldListPage.goto();
      const rows = [];
      for (const row of await mazadSoldListPage.rows.all()) {
        rows.push(await mazadSoldListPage.readRow(row));
      }
      expect(rows.length, 'Sold rows in the back office').toBeGreaterThan(0);
      expect(
        rows.some((r) => r.saleType === pastSaleType),
        'a car sold at auction',
      ).toBe(true);

      for (const row of rows) {
        const atAuction = row.saleType === pastSaleType;
        expect
          .soft(
            past.has(row.auctionId),
            `Sold ${row.auctionId} (${row.saleType}) ${atAuction ? 'is' : 'is not'} in Past`,
          )
          .toBe(atAuction);
      }
    },
  );

  test(
    'Past does not list cars whose auction failed',
    { tag: '@functional' },
    async ({ backendSession, failedPage }) => {
      void backendSession;
      await failedPage.goto();
      const rows = [];
      for (const row of await failedPage.rows.all()) rows.push(await failedPage.readRow(row));
      expect(rows.length, 'Failed rows in the back office').toBeGreaterThan(0);

      for (const row of rows) {
        expect
          .soft(past.has(Number(row.itemId)), `Failed ${row.itemId} (${row.totalBids} bids)`)
          .toBe(false);
      }
    },
  );
});
