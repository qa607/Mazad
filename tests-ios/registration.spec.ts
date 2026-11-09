import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations } from '@utils/test-category';
import {
  attachFailureEvidence,
  HOME_TABS,
  isEnabled,
  LANGUAGE_OPTIONS,
  LANGUAGES,
  MORE_TABS,
} from './ios-test-helpers';

/**
 * Mazad iOS registration. One shared scenario list for English and Arabic.
 *
 * Runnable now: the guest ENTRY only (navigation and display). It opens the first registration step
 * from the welcome sheet and reads it; it selects no account type, types nothing, taps no Next and
 * submits nothing, so no account is created and no OTP is requested (the screen object has no way
 * to do any of that: src/mobile/ios/screens/registration.screen.ts).
 *
 * Declared only: submitting a registration CREATES an account and an OTP-path request; no run
 * kind, policy fact set, approved synthetic data or authorization exists for it, and the later
 * registration steps have never been inspected.
 */
test.describe.configure({ mode: 'serial' });
// The suite may load once every gate except the FULL text gate is open: the narrow text gate
// (test-data/ios-verified-text.ts) covers only the guest display tests. Every other test is
// skipped at declaration while IOS_TEXT_VERIFIED is closed.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

const SUBMIT_PENDING =
  'Pending: submitting creates an account and may send an OTP; it needs an approved synthetic identity, a run kind with its policy facts and switches, a cleanup route, and the later registration steps inspected.';

for (const lang of LANGUAGES) {
  test.describe(
    `iOS registration (${lang})`,
    allureLabels({
      feature: 'Registration',
      story: 'Registration',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      // Navigation and display only. Guest state is required (never signs in or out). Each text is
      // the ONE element of its kind, and Next is only READ (disabled until an account type is
      // chosen: observed on the device); no account type is chosen.
      test(
        GUEST_FORM_TEST_TITLES[11],
        async ({ driver, iosConfig, appShell, registrationScreen, text }) => {
          await restartIosApp(driver, iosConfig);
          await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
          await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
          await registrationScreen.openFromGuestPrompt(text.guestPrompt, text.createAccountChoice);
          expect(
            await (await registrationScreen.onlyText(text.registrationHeading)).isDisplayed(),
          ).toBe(true);
          expect(
            await (await registrationScreen.onlyText(text.chooseAccountType)).isDisplayed(),
          ).toBe(true);
          expect(await isEnabled(await registrationScreen.nextButton(text.registrationNext))).toBe(
            false,
          );
        },
      );

      // Everything below needs more than the narrow gate: declared skipped (no hook, no fixture, no
      // app action) while the full IOS_TEXT_VERIFIED gate is closed.
      test.describe(() => {
        test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

        test.fixme(
          'Registration with synthetic data creates an account',
          {
            annotation: categoryAnnotations({
              pending: SUBMIT_PENDING,
              textGate: OTHER_TESTS_PROBLEM,
            }),
          },
          () => {
            // Declared only: nothing to automate until the authorization exists.
          },
        );
      });
    },
  );
}
