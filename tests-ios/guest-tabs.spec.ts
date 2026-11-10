import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations } from '@utils/test-category';
import {
  attachFailureEvidence,
  HOME_TABS,
  LANGUAGE_OPTIONS,
  LANGUAGES,
  MORE_TABS,
} from './ios-test-helpers';

/**
 * Mazad iOS guest tabs: what a signed-out user sees on the My Bids and My Actions tabs. One shared
 * scenario list for English and Arabic.
 *
 * Navigation and display only: the test taps a tab-bar button and reads the screen. It never taps the
 * login or create-account button, never signs in or out and sends nothing (the screen object has no
 * way to: src/mobile/ios/screens/guest-tabs.screen.ts). Guest state is required at the start.
 */
test.describe.configure({ mode: 'serial' });
// The suite may load once every gate except the FULL text gate is open: the narrow text gate
// (test-data/ios-verified-text.ts) covers only the guest display tests. Every other test is
// skipped at declaration while IOS_TEXT_VERIFIED is closed.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

const NOTIFICATION_ACTIONS_EXCLUDED =
  'Excluded from guest-only automation: tapping "Turn on notifications" or "Later" acts on the device notification permission and app state, and what they do is not recorded.';

for (const lang of LANGUAGES) {
  test.describe(
    `iOS guest tabs (${lang})`,
    allureLabels({
      feature: 'Guest tabs',
      story: 'Guest My Bids and My Actions',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      // A fresh app in guest state on the More tab; each test taps ONE tab and reads it.
      test.describe(() => {
        test.beforeEach(async ({ driver, iosConfig, appShell, text }) => {
          await restartIosApp(driver, iosConfig);
          await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
          await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
        });

        // Each text is the ONE element of its kind. The login button is only READ (never tapped).
        test(GUEST_FORM_TEST_TITLES[12], async ({ guestTabsScreen: screen, text }) => {
          await screen.openTab(text.bidsTab);
          expect(await (await screen.onlyText(text.bidsHeading)).isDisplayed()).toBe(true);
          for (const filter of [text.bidsLive, text.bidsClosed, text.bidsWon, text.bidsLost]) {
            expect(await (await screen.onlyText(filter)).isDisplayed(), filter).toBe(true);
          }
          expect(await (await screen.onlyText(text.bidsGuestMessage)).isDisplayed()).toBe(true);
          expect(await (await screen.onlyButton(text.bidsGuestLogin)).isDisplayed()).toBe(true);
        });

        test(GUEST_FORM_TEST_TITLES[13], async ({ guestTabsScreen: screen, text }) => {
          await screen.openTab(text.actionsTab);
          expect(await (await screen.onlyText(text.actionsHeading)).isDisplayed()).toBe(true);
          for (const section of [text.actionsNeeded, text.actionsPending]) {
            expect(await (await screen.onlyText(section)).isDisplayed(), section).toBe(true);
          }
          expect(await (await screen.onlyText(text.actionsGuestMessage)).isDisplayed()).toBe(true);
          expect(await (await screen.onlyButton(text.actionsGuestLogin)).isDisplayed()).toBe(true);
        });

        // The header icons of My Bids are the ONE Button with their accessible name. Notifications opens a
        // push-notification pitch (not a login prompt): it is only READ, neither of its buttons is tapped.
        // The pitch is what the app shows while notifications are not turned on for it on the device.
        test(GUEST_FORM_TEST_TITLES[14], async ({ guestTabsScreen: screen, text }) => {
          await screen.openTab(text.bidsTab);
          await screen.openHeaderIcon('notifications');
          expect(await (await screen.onlyText(text.notificationsHeading)).isDisplayed()).toBe(true);
          expect(await (await screen.onlyText(text.notificationsMessage)).isDisplayed()).toBe(true);
          expect(await (await screen.onlyButton(text.notificationsEnable)).isDisplayed()).toBe(
            true,
          );
          expect(await (await screen.onlyButton(text.notificationsLater)).isDisplayed()).toBe(true);
        });

        // Favorites asks the guest to log in; the login button is only READ (never tapped).
        test(GUEST_FORM_TEST_TITLES[15], async ({ guestTabsScreen: screen, text }) => {
          await screen.openTab(text.bidsTab);
          await screen.openHeaderIcon('favorites');
          expect(await (await screen.onlyText(text.favoritesHeading)).isDisplayed()).toBe(true);
          for (const section of [text.favoritesLive, text.favoritesUpcoming]) {
            expect(await (await screen.onlyText(section)).isDisplayed(), section).toBe(true);
          }
          expect(await (await screen.onlyText(text.favoritesGuestMessage)).isDisplayed()).toBe(
            true,
          );
          expect(await (await screen.onlyButton(text.favoritesGuestLogin)).isDisplayed()).toBe(
            true,
          );
        });

        // Everything below needs more than the narrow gate: declared skipped (no hook, no fixture, no
        // app action) while the full IOS_TEXT_VERIFIED gate is closed.
        test.describe(() => {
          test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

          test.fixme(
            'Guest Notifications buttons act on the notification permission',
            {
              annotation: categoryAnnotations({
                excluded: NOTIFICATION_ACTIONS_EXCLUDED,
                textGate: OTHER_TESTS_PROBLEM,
              }),
            },
            () => {
              // Declared only: no notification-permission action is part of guest-only automation.
            },
          );
        });
      });
    },
  );
}
