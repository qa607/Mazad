import { expect, test } from '@fixtures/ios.fixture';
import { iosAdvertisementBlocked, iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import {
  advertisementAppLanguages,
  advertisementBadge,
  advertisementShowTimeout,
  advertisementShown,
  advertisementTestTitles,
  newQaAdvertisement,
} from '@test-data/advertisement.data';
import { GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { firstBlocked } from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { attachFailureEvidence, HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * Advertisements end to end on iOS, the same scenario as the Android suite
 * (tests/mobile/android/advertisement.backoffice.spec.ts): the back office (as Dev Root) creates a
 * new QA-AUTO advertisement for mobile and publishes it; the app opens it at its next launch with
 * the advertisement's text, and tapping its button closes it and adds a click in the back office.
 * iOS 8.3 has no app update pending on stg-154, so App Versions is not touched here.
 *
 * While it is published EVERY staging app opens it, so the test runs only with
 * MAZAD_ALLOW_ADVERTISEMENT=true (its own approval, iosAdvertisementBlocked), under every device,
 * build and narrow-text gate the other iOS tests need. In the app it reads the sheet and taps only
 * the advertisement's button. advertisementCleanup unpublishes and deletes it after the test,
 * passed or failed, and publishes again the one published before, if any. Runs in the
 * ios-backoffice project, after its back-office sign-in, in Arabic only. Failure evidence is
 * non-visual (attachFailureEvidence).
 */
const GATE = firstBlocked(
  iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE }),
  iosAdvertisementBlocked(),
);

// The back-office tab is signed in as Dev Root: no trace or video.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device; a retry would publish a second advertisement while the first is cleaned up.
test.describe.configure({ mode: 'default', retries: 0 });

for (const lang of advertisementAppLanguages) {
  const labels = allureLabels({
    feature: 'Advertisements',
    story: 'Back office to app',
    severity: 'normal',
    platform: 'ios',
    language: lang,
  });

  test.describe(
    `Advertisements - iOS app (${lang}) - back office`,
    { tag: [...labels.tag, '@regression', '@mutates', '@crud'], annotation: labels.annotation },
    () => {
      // Decided when the file loads: no session, app launch or back-office change while blocked.
      test.skip(Boolean(GATE), GATE);
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      test(
        advertisementTestTitles.ios,
        { tag: '@functional' },
        async ({
          driver,
          iosConfig,
          appShell,
          advertisementSheet: sheet,
          devRootBackend,
          advertisementCleanup,
          mazadApi,
        }) => {
          const ad = newQaAdvertisement();
          const shown = advertisementShown(ad, lang);
          const ads = devRootBackend.advertisementPage;

          await test.step('the app is open in the language, with no advertisement yet', async () => {
            await restartIosApp(driver, iosConfig);
            // A sheet left open by an earlier, failed run would hide Home.
            await sheet.closeIfOpen();
            await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
          });

          const id =
            await test.step('the back office creates the advertisement and publishes it', async () => {
              advertisementCleanup.rememberPublished(await ads.publishedIds());
              const created = await ads.createAdvertisement(ad);
              advertisementCleanup.track(created);
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
            });
          });

          await test.step('the app opens it at launch, with its badge, title, sub title and button', async () => {
            await restartIosApp(driver, iosConfig);
            await sheet.waitForAdvertisement(shown.title, advertisementShowTimeout);
            expect(await sheet.visibleTexts()).toEqual([
              advertisementBadge[lang],
              shown.title,
              shown.subTitle,
            ]);
            expect(await (await sheet.onlyButton(shown.button)).isDisplayed()).toBe(true);
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
