import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import {
  advertisementAppLanguages,
  advertisementBadge,
  advertisementShowTimeout,
  advertisementShown,
  androidFirstLaunchWait,
  androidPendingUpdateRow,
  newQaAdvertisement,
} from '@test-data/advertisement.data';
import { languageOptions } from '@test-data/mobile-app.data';
import { ADVERTISEMENT_BLOCKED } from '@utils/account-actions';

/**
 * Advertisements end to end on Android: what the back office publishes opens in the app at launch.
 *
 * The back office (a tab signed in as Dev Root, devRootBackend) creates a new QA-AUTO advertisement
 * for mobile and publishes it; the app opens it at its next launch with the advertisement's text,
 * and tapping its button closes it and adds a click in the back office. While it is published,
 * EVERY staging app opens it, so the test runs only with MAZAD_ALLOW_ADVERTISEMENT=true and keeps
 * that window short. On stg-154 the Android test build always has an app update pending, which
 * hides advertisements, so the App Versions row behind it is set In Active while the app opens, then
 * back to Active (see test-data/advertisement.data.ts).
 *
 * Clean-up, passed or failed: advertisementCleanup unpublishes and deletes the advertisement and
 * publishes again the one published before, if any; appVersionPause puts the row back.
 * Runs in the android-backoffice project (after backend-setup saves the Dev Root session).
 */

// The back-office tab is signed in as Dev Root: no trace or video (see website.fixture's
// devRootBackend, which attaches a masked screenshot on failure instead).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device; a retry would publish a second advertisement while the first is cleaned up.
test.describe.configure({ mode: 'serial', retries: 0 });

// Decided when the file loads: no session, app launch or back-office change while blocked.
test.skip(Boolean(ADVERTISEMENT_BLOCKED), ADVERTISEMENT_BLOCKED);

for (const lang of advertisementAppLanguages) {
  test.describe(
    `Advertisements - Android app (${lang}) - back office`,
    { tag: ['@regression', '@mutates', '@crud'] },
    () => {
      test(
        'A published advertisement opens at launch with its text, and its button counts a click',
        { tag: '@functional' },
        async ({
          driver,
          appShell,
          advertisementSheet: sheet,
          devRootBackend,
          advertisementCleanup,
          appVersionPause,
          mazadApi,
        }) => {
          const ad = newQaAdvertisement();
          const shown = advertisementShown(ad, lang);
          const ads = devRootBackend.advertisementPage;

          await test.step('the app is open in the language, with no advertisement yet', async () => {
            await restartApp(driver);
            // A sheet left open by an earlier, failed run would hide Home: it is closed unchosen.
            await appShell.waitUntilReadyClosingSheet();
            await appShell.setLanguage(lang, languageOptions);
            await appShell.dismissAnnouncement();
          });

          const id =
            await test.step('the back office creates the advertisement and publishes it', async () => {
              advertisementCleanup.rememberPublished(await ads.publishedIds());
              const created = await ads.createAdvertisement(ad);
              advertisementCleanup.track(created);
              expect((await ads.readAdvertisement(created)).isPublished, 'saved unpublished').toBe(
                false,
              );
              await ads.setPublished(created, true);
              expect((await ads.readAdvertisement(created)).isPublished, 'published').toBe(true);
              return created;
            });

          await test.step('the apps configuration carries it, in the language', async () => {
            const { body } = await mazadApi.getConfiguration(lang);
            expect(body.data.advertisement).toMatchObject({
              id: Number(id),
              title: shown.title,
              subTitle: shown.subTitle,
              btnText: shown.button,
              btnLink: shown.link,
              linkType: ad.linkType,
            });
          });

          await test.step('the app opens it at launch, with its badge, title, sub title and button', async () => {
            await appVersionPause.pause(androidPendingUpdateRow);
            try {
              // The app decides at launch from the configuration it loaded at its previous launch
              // (seen 2026-11-15), so the advertisement may first open at the second launch.
              await restartApp(driver);
              if (!(await sheet.showsWithin(shown.title, androidFirstLaunchWait))) {
                await restartApp(driver);
                await sheet.waitForAdvertisement(shown.title, advertisementShowTimeout);
              }
            } finally {
              // Back to Active as soon as the app has decided; the fixture does it too.
              await appVersionPause.restore();
            }
            expect(await sheet.texts()).toEqual([
              advertisementBadge[lang],
              shown.title,
              shown.subTitle,
              shown.button,
            ]);
          });

          await test.step('its button closes it, and the back office counts the click', async () => {
            await sheet.tapButton(shown.button);
            await expect
              .poll(async () => (await ads.readAdvertisement(id)).clickCount, { timeout: 15_000 })
              .toBe(1);
          });

          await test.step('unpublished, it leaves the apps configuration', async () => {
            await ads.setPublished(id, false);
            const { body } = await mazadApi.getConfiguration(lang);
            expect(body.data.advertisement?.id).not.toBe(Number(id));
          });
        },
      );
    },
  );
}
