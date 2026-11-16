import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { endedAuctionsAppText, latestEndedCompared } from '@test-data/past-auctions.data';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { attachFailureEvidence, HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * Ended (past) auctions in the iOS app: the "Ended Auctions" button at the end of Home, its list
 * (checked against the website's "Latest Ended Auctions"), an ended auction and one of its cars
 * (the car the website lists first for that auction).
 *
 * Navigation and display only: it taps the button, an auction card and a car, and reads the
 * screens. It never bids, signs in or out, or sends anything (the screen object has no way to:
 * src/mobile/ios/screens/ended-auctions.screen.ts). Arabic only (text recorded in Arabic).
 */
test.describe.configure({ mode: 'serial' });
// Runs under the narrow text gate (test-data/ios-verified-text.ts), like the guest display tests.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

const IOS_LANGUAGES = ['ar'] as const;

for (const lang of IOS_LANGUAGES) {
  const words = endedAuctionsAppText[lang];

  test.describe(`iOS past auctions (${lang})`, { tag: ['@ios', `@${lang}`, '@regression'] }, () => {
    test.use({ language: lang });

    test.beforeEach(async ({ driver, iosConfig, appShell }) => {
      await restartIosApp(driver, iosConfig);
      await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
    });

    test.afterEach(async ({ driver }, testInfo) => {
      await attachFailureEvidence(driver, testInfo);
    });

    test(
      GUEST_FORM_TEST_TITLES[41],
      { tag: '@functional' },
      async ({ endedAuctionsScreen: screen, appShell, liveAuctionsPage }) => {
        await liveAuctionsPage.goto();
        await expect(liveAuctionsPage.endedAuctionNames.first()).toBeVisible();
        const website = (await liveAuctionsPage.endedAuctionNames.allTextContents())
          .map((name) => name.trim())
          .slice(0, latestEndedCompared);

        await appShell.waitUntilReady(HOME_TABS);
        await screen.openFromHome(words.endedAuctions);

        expect(await (await screen.onlyText(words.endedAuctions)).isDisplayed()).toBe(true);
        await expect
          .poll(async () => (await screen.auctionNames()).slice(0, website.length), {
            timeout: 15_000,
          })
          .toEqual(website);
      },
    );

    test(
      GUEST_FORM_TEST_TITLES[42],
      { tag: '@functional' },
      async ({ endedAuctionsScreen: screen, appShell, endedAuctionsPage, auctionDetailsPage }) => {
        await endedAuctionsPage.goto();
        await expect(endedAuctionsPage.auctionNames.first()).toBeVisible();
        const name = ((await endedAuctionsPage.auctionNames.first().textContent()) ?? '').trim();
        await endedAuctionsPage.auctionCards.first().click();
        await expect(auctionDetailsPage.carTitles.first()).toBeVisible();
        const car = ((await auctionDetailsPage.carTitles.first().textContent()) ?? '').trim();

        await appShell.waitUntilReady(HOME_TABS);
        await screen.openFromHome(words.endedAuctions);
        await screen.openAuction(name);

        expect(await (await screen.onlyText(words.endedStatus)).isDisplayed()).toBe(true);

        await screen.openCar(car);

        expect(await (await screen.onlyTextStartingWith(words.heldOnPrefix)).isDisplayed()).toBe(
          true,
        );
      },
    );
  });
}
