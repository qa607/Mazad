import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import { languageOptions } from '@test-data/mobile-app.data';
import { endedAuctionsAppText, latestEndedCompared } from '@test-data/past-auctions.data';

// Ended (past) auctions in the Android app: the "Ended Auctions" button at the end of Home, its
// list (checked against the website's "Latest Ended Auctions"), an ended auction and one of its
// cars. Read-only: nothing is tapped but navigation. One device, so the tests run in order.
test.describe.configure({ mode: 'serial' });

const LANGUAGES = ['ar'] as const;

for (const lang of LANGUAGES) {
  const text = endedAuctionsAppText[lang];

  test.describe(`Past auctions - Android app (${lang})`, { tag: '@regression' }, () => {
    test.use({ language: lang });

    test.beforeEach(async ({ driver, appShell }) => {
      await restartApp(driver);
      await appShell.waitUntilReady();
      await appShell.dismissAnnouncement();
      await appShell.setLanguage(lang, languageOptions);
    });

    test(
      'Home ends with Ended Auctions, listing the latest ended auctions the website shows',
      { tag: '@functional' },
      async ({ endedAuctionsScreen, liveAuctionsPage }) => {
        await liveAuctionsPage.goto();
        await expect(liveAuctionsPage.endedAuctionNames.first()).toBeVisible();
        const website = (await liveAuctionsPage.endedAuctionNames.allTextContents())
          .map((name) => name.trim())
          .slice(0, latestEndedCompared);

        await endedAuctionsScreen.openFromHome(text.endedAuctions);

        await expect
          .poll(() => endedAuctionsScreen.byText(text.endedAuctions).isDisplayed())
          .toBe(true);
        await expect
          .poll(async () => (await endedAuctionsScreen.auctionNames()).slice(0, website.length), {
            timeout: 15_000,
          })
          .toEqual(website);
      },
    );

    test(
      'An ended auction shows that it ended, and its car shows when the auction was held',
      { tag: '@functional' },
      async ({ endedAuctionsScreen }) => {
        await endedAuctionsScreen.openFromHome(text.endedAuctions);
        await expect
          .poll(async () => (await endedAuctionsScreen.auctionNames()).length)
          .not.toBe(0);
        const [name] = await endedAuctionsScreen.auctionNames();

        await endedAuctionsScreen.auctionCard(name).click();

        await expect
          .poll(() => endedAuctionsScreen.byText(text.endedStatus).isDisplayed(), {
            timeout: 15_000,
          })
          .toBe(true);

        await endedAuctionsScreen.firstCarCard(text.mileageUnit).click();

        await expect
          .poll(() => endedAuctionsScreen.textStartingWith(text.heldOnPrefix).isDisplayed(), {
            timeout: 15_000,
          })
          .toBe(true);
      },
    );
  });
}
