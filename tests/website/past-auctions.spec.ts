import { expect, test } from '@fixtures/website.fixture';
import { endedAuctionRules } from '@test-data/past-auctions.data';

// Ended (past) auctions on the website, as a guest: the "Latest Ended Auctions" section of the
// Live & Upcoming page, the full Ended Auctions list, an ended auction and one of its cars.
// Read-only: nothing is submitted.

test.describe('Past auctions - website', { tag: '@regression' }, () => {
  test(
    'Live Auctions shows the latest ended auctions with a link to all of them',
    { tag: '@functional' },
    async ({ liveAuctionsPage, t }) => {
      await liveAuctionsPage.goto();

      await expect(liveAuctionsPage.endedSectionTitle).toHaveText(t('latestEndedAuctions'));
      await expect(liveAuctionsPage.allEndedAuctionsLink).toHaveText(t('allEndedAuctions'));
      await expect(liveAuctionsPage.endedAuctionNames.first()).toBeVisible();
      expect(await liveAuctionsPage.endedAuctionNames.count()).toBeLessThanOrEqual(
        endedAuctionRules.latestSectionMax,
      );
    },
  );

  test(
    'All Ended Auctions opens the ended list, starting with the latest ended auctions',
    { tag: '@functional' },
    async ({ page, liveAuctionsPage, endedAuctionsPage, t }) => {
      await liveAuctionsPage.goto();
      await expect(liveAuctionsPage.endedAuctionNames.first()).toBeVisible();
      const latest = await liveAuctionsPage.endedAuctionNames.allTextContents();

      await liveAuctionsPage.allEndedAuctionsLink.click();

      await expect(page).toHaveURL(endedAuctionRules.listUrl);
      await expect(endedAuctionsPage.heading).toHaveText(t('endedAuctionsHeading'));
      await expect(endedAuctionsPage.auctionNames.first()).toBeVisible();
      const listed = await endedAuctionsPage.auctionNames.allTextContents();
      expect(listed.slice(0, latest.length).map((n) => n.trim())).toEqual(
        latest.map((n) => n.trim()),
      );
      await expect(endedAuctionsPage.pagination).toBeVisible();
    },
  );

  test(
    'An ended auction shows Ended Auction and lists as many cars as it counts',
    { tag: '@functional' },
    async ({ endedAuctionsPage, auctionDetailsPage, t }) => {
      await endedAuctionsPage.goto();
      const firstCard = endedAuctionsPage.auctionCards.first();
      await expect(firstCard).toBeVisible();
      const name = (await endedAuctionsPage.auctionNames.first().innerText()).trim();

      await firstCard.click();

      await expect(auctionDetailsPage.heading).toHaveText(name);
      await expect(auctionDetailsPage.status).toHaveText(t('endedAuctionStatus'));
      await expect(auctionDetailsPage.carCards.first()).toBeVisible();
      const count = Number((await auctionDetailsPage.carsCount.innerText()).trim());
      await expect(auctionDetailsPage.carCards).toHaveCount(count);
    },
  );

  test(
    'A car of an ended auction shows when the auction was held and offers only the app',
    { tag: '@functional' },
    async ({ endedAuctionsPage, auctionDetailsPage, carDetailsPage, t }) => {
      await endedAuctionsPage.goto();
      await endedAuctionsPage.auctionCards.first().click();
      await expect(auctionDetailsPage.carCards.first()).toBeVisible();
      const title = (await auctionDetailsPage.carTitles.first().innerText()).trim();

      await auctionDetailsPage.carCards.first().click();

      await expect(carDetailsPage.heading).toHaveText(title);
      await expect(carDetailsPage.auctionTime).toContainText(t('auctionHeldOn'));
      await expect(carDetailsPage.auctionTime).toHaveText(endedAuctionRules.heldOnPattern);
      await expect(carDetailsPage.getTheAppLink).toBeVisible();
    },
  );
});
