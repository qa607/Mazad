import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem, stagingOriginOf } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import type { IosMoreScreen, MoreIcon } from '@mobile/ios/screens/more.screen';
import { type IosAppText, iosAppText, iosVersionLine } from '@test-data/ios-app.data';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations } from '@utils/test-category';
import {
  attachFailureEvidence,
  HOME_TABS,
  installedIosVersion,
  LANGUAGE_OPTIONS,
  LANGUAGES,
  MORE_HEADER_ICONS_PENDING,
  MORE_SOCIAL_ICONS_PENDING,
  MORE_TABS,
  pendingDetails,
} from './ios-test-helpers';

/**
 * Mazad iOS: the More tab as a guest, the same coverage as the Android suite
 * (tests/mobile/android/more.spec.ts), one scenario list for English and Arabic. Observed on the
 * device 2026-11-11 (build 8.3 (1491)).
 *
 * Contained in the app: About Us, Terms, Help Center and Privacy Policy (an in-app browser on iOS)
 * are opened; Rate us leaves the app and "Change Environment" changes the backend, so both are only
 * checked for presence (the screen object refuses to tap them). The header and social icons have no
 * accessible name, so their tests are declared pending until the iOS team adds accessibility ids.
 */
test.describe.configure({ mode: 'serial' });
// The guest display tests run on the narrow text gate (test-data/ios-verified-text.ts); every other
// test is skipped at declaration while IOS_TEXT_VERIFIED is closed.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

const HEADER_ICONS: readonly MoreIcon[] = ['favoritesIcon', 'notificationsIcon'];
const SOCIAL_ICONS: readonly MoreIcon[] = [
  'facebookIcon',
  'instagramIcon',
  'tiktokIcon',
  'linkedinIcon',
];

const otherLanguage = (lang: 'en' | 'ar') => (lang === 'en' ? 'ar' : 'en');

/**
 * Opens an in-app page from More (its title is the row's label), checks its title, content and
 * Back button, then goes Back and checks More is shown again.
 */
async function checkInAppPage(more: IosMoreScreen, text: IosAppText, title: string): Promise<void> {
  await more.openRow(title);
  expect(await (await more.onlyText(title)).isDisplayed(), 'page title').toBe(true);
  expect(await (await more.onlyButton(text.more.moreBack)).isDisplayed()).toBe(true);
  // Content: the page shows text beyond its title and its Back button.
  expect(await more.hasTextBesides([title, text.more.moreBack]), 'page content').toBe(true);

  await more.goBack(text.more.moreBack);
  expect(await (await more.onlyText(text.more.moreImportantLinks)).isDisplayed()).toBe(true);
}

for (const lang of LANGUAGES) {
  test.describe(
    `iOS More (${lang})`,
    allureLabels({
      feature: 'More',
      story: 'Guest More tab',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      // A fresh app in guest state, on More in its language.
      test.describe(() => {
        test.beforeEach(async ({ driver, iosConfig, appShell, text }) => {
          await restartIosApp(driver, iosConfig);
          await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
          await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
        });

        test(GUEST_FORM_TEST_TITLES[25], async ({ moreScreen: more, text }) => {
          const m = text.more;
          for (const label of [
            m.moreTitle,
            m.moreSettings,
            m.moreLanguage,
            m.moreSocialHeading,
            m.moreImportantLinks,
          ]) {
            expect.soft(await (await more.onlyText(label)).isDisplayed(), label).toBe(true);
          }
          for (const label of [
            text.guestPrompt,
            LANGUAGE_OPTIONS.en,
            LANGUAGE_OPTIONS.ar,
            m.moreAboutUs,
            text.contactUs.contactHelpCenter,
            m.moreTerms,
            m.morePrivacy,
            // Present but never tapped: Rate us leaves the app, Change Environment changes the backend.
            m.moreRateUs,
            m.moreChangeEnvironment,
          ]) {
            expect.soft(await (await more.onlyButton(label)).isDisplayed(), label).toBe(true);
          }
        });

        test(GUEST_FORM_TEST_TITLES[26], async ({ moreScreen: more, text }) => {
          expect(await more.isTabSelected(text.tabs.more)).toBe(true);
          expect(await more.isTabSelected(text.tabs.home)).toBe(false);
        });

        test(GUEST_FORM_TEST_TITLES[27], async ({ moreScreen: more, text }) => {
          await checkInAppPage(more, text, text.more.moreAboutUs);
        });

        test(GUEST_FORM_TEST_TITLES[28], async ({ moreScreen: more, text }) => {
          await checkInAppPage(more, text, text.more.moreTerms);
        });

        test(GUEST_FORM_TEST_TITLES[29], async ({ moreScreen: more, text }) => {
          await more.openRow(text.contactUs.contactHelpCenter);
          // The category recorded on the device (served by GET /v1/faq-list).
          expect(await (await more.onlyText(text.contactUs.contactCategory)).isDisplayed()).toBe(
            true,
          );
        });

        test(GUEST_FORM_TEST_TITLES[30], async ({ moreScreen: more, iosConfig, text }) => {
          await more.openRow(text.more.morePrivacy);
          // An in-app browser (not Safari): the app stays in front, showing the staging site.
          await expect
            .poll(() => more.inAppBrowserAddress(), { timeout: 20_000 })
            .toContain(new URL(stagingOriginOf(iosConfig)).hostname);
          // The next test restarts the app, which closes the in-app browser.
        });

        test(GUEST_FORM_TEST_TITLES[31], async ({ moreScreen: more, iosConfig, text }) => {
          const expected = iosVersionLine(
            lang,
            await installedIosVersion(iosConfig),
            text.more.moreVersionLabel,
          );
          await more.scrollDown();
          expect(await (await more.onlyText(expected)).isDisplayed(), expected).toBe(true);
        });

        test(
          GUEST_FORM_TEST_TITLES[32],
          async ({ driver, iosConfig, appShell, moreScreen: more }) => {
            const other = otherLanguage(lang);
            const otherText = iosAppText(other);
            await test.step(`switch to ${other}`, async () => {
              await appShell.setLanguage(other, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
              await appShell.openMore(MORE_TABS[other], HOME_TABS[other]);
              expect(
                await (await more.onlyText(otherText.more.moreImportantLinks)).isDisplayed(),
              ).toBe(true);
            });

            await test.step('restart the app: the language is kept', async () => {
              await restartIosApp(driver, iosConfig);
              expect(await appShell.waitUntilReady(HOME_TABS)).toBe(other);
            });
            // The next test's setup sets its own language again.
          },
        );

        // Needs more than the narrow gate: declared skipped (no hook, no fixture, no app action)
        // while the full IOS_TEXT_VERIFIED gate is closed, and pending until the icons have ids.
        test.describe(() => {
          test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

          /* eslint-disable @typescript-eslint/unbound-method, playwright/no-standalone-expect */
          (MORE_HEADER_ICONS_PENDING ? test.fixme : test)(
            'More shows the Favorites and Notifications header icons',
            pendingDetails(MORE_HEADER_ICONS_PENDING, OTHER_TESTS_PROBLEM),
            async ({ moreScreen: more }) => {
              for (const icon of HEADER_ICONS) {
                expect(await (await more.icon(icon)).isDisplayed(), icon).toBe(true);
              }
            },
          );

          (MORE_SOCIAL_ICONS_PENDING ? test.fixme : test)(
            'More shows the four social media icons',
            pendingDetails(MORE_SOCIAL_ICONS_PENDING, OTHER_TESTS_PROBLEM),
            async ({ moreScreen: more }) => {
              // Presence only: each icon leaves the app.
              for (const icon of SOCIAL_ICONS) {
                expect(await (await more.icon(icon)).isDisplayed(), icon).toBe(true);
              }
            },
          );
          /* eslint-enable @typescript-eslint/unbound-method, playwright/no-standalone-expect */

          test.fixme(
            'Signed-in More shows the account and Log out',
            {
              annotation: categoryAnnotations({
                excluded:
                  'Signed-in state is out of scope for now (QA owner, 2026-11-11): needs an approved account.',
                textGate: OTHER_TESTS_PROBLEM,
              }),
            },
            () => {
              // Declared only.
            },
          );
        });
      });
    },
  );
}
