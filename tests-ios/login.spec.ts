import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { websiteLoginData } from '@test-data/website-login.data';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations } from '@utils/test-category';
import {
  baselineEstablishedNow,
  cleanupAccountState,
  isSignedInNow,
  INDIVIDUAL_EXCLUDED_REASON,
  LOGIN_PROBLEM,
  requireGuestAtStart,
  runCauses,
  UNREGISTERED_LOGIN_PROBLEM,
} from './ios-account-helpers';
import {
  attachFailureEvidence,
  isEnabled,
  LANGUAGES,
  openGuestLoginForm,
  PASSWORD_TOGGLE_PENDING,
  pendingDetails,
  SERVER_RESPONSE_TIMEOUT,
} from './ios-test-helpers';

/**
 * Mazad iOS login. Scenarios and expected results follow the web and Android suites; only the
 * iOS screen layer differs. One file covers both languages.
 *
 * Every gate is decided when this file loads (declaration-level skips), so a blocked test runs
 * no hook and no fixture: the app is not launched and no account is read.
 *
 * Account tests need, beyond the approval switches, the recorded backend limits, recovery
 * process and confirmed test account (config/ios-account-policy.ts), the dedicated dealer account
 * in .env (never in the back office), no open recovery journal, and an app that is in guest
 * state afterwards (cleanup runs after every account test, pass or fail). The Individual account
 * is excluded.
 */
test.describe.configure({ mode: 'serial' });
// The suite may load once every gate except the FULL text gate is open: the narrow text gate
// (test-data/ios-verified-text.ts) covers only the guest display test below. Every other test is
// skipped at declaration while IOS_TEXT_VERIFIED is closed.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

for (const lang of LANGUAGES) {
  test.describe(
    `iOS login (${lang})`,
    allureLabels({
      feature: 'Login',
      story: 'Login',
      severity: 'critical',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      // Display and local-validation tests: a fresh app on the login form for each test.
      test.describe(() => {
        test.beforeEach(async ({ driver, iosConfig, appShell, loginScreen, text }) => {
          await restartIosApp(driver, iosConfig);
          await openGuestLoginForm(appShell, loginScreen, lang, text);
        });

        // Display only: types nothing, submits nothing. The Log In button has no accessibility
        // id yet, so it is not asserted here (see the pending test below). Each field is the ONE
        // element of its kind on the form (checked, never picked by order).
        test(GUEST_FORM_TEST_TITLES[0], async ({ loginScreen, text }) => {
          expect(await (await loginScreen.onlyPhoneInput()).isDisplayed()).toBe(true);
          expect(await (await loginScreen.onlyPasswordInput()).isDisplayed()).toBe(true);
          expect(
            await (await loginScreen.onlyForgotPasswordLink(text.forgotPassword)).isDisplayed(),
          ).toBe(true);
        });

        // Local validation (nothing is submitted; only synthetic values are typed). The Log In button
        // is the ONE Button of the screen without an accessible name (interim, until it has an id).
        test(GUEST_FORM_TEST_TITLES[3], async ({ loginScreen }) => {
          expect(await (await loginScreen.loginButton()).isDisplayed()).toBe(true);
        });

        test(GUEST_FORM_TEST_TITLES[4], async ({ loginScreen }) => {
          expect(await isEnabled(await loginScreen.loginButton())).toBe(false);
        });

        test(GUEST_FORM_TEST_TITLES[5], async ({ loginScreen }) => {
          await loginScreen.enterPassword(websiteLoginData.wrongPassword);
          await loginScreen.hideKeyboard();
          expect(await isEnabled(await loginScreen.loginButton())).toBe(false);
        });

        test(GUEST_FORM_TEST_TITLES[6], async ({ loginScreen }) => {
          await loginScreen.enterPhone(websiteLoginData.unregisteredPhone);
          await loginScreen.hideKeyboard();
          expect(await isEnabled(await loginScreen.loginButton())).toBe(false);
        });

        // The enabled side: made-up values are typed (never a real account), Log In is checked and
        // NEVER tapped, so nothing is submitted.
        test(GUEST_FORM_TEST_TITLES[8], async ({ loginScreen }) => {
          await loginScreen.enterPhone(websiteLoginData.unregisteredPhone);
          await loginScreen.enterPassword(websiteLoginData.wrongPassword);
          await loginScreen.hideKeyboard();
          expect(await isEnabled(await loginScreen.loginButton())).toBe(true);
        });

        // Everything below needs text beyond the narrow gate: declared skipped (no hook, no
        // fixture, no app action) while the full IOS_TEXT_VERIFIED gate is closed.
        test.describe(() => {
          test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

          // Pending test: declared fixme while the control's accessibility id is not recorded.
          /* eslint-disable @typescript-eslint/unbound-method, playwright/no-standalone-expect */
          (PASSWORD_TOGGLE_PENDING ? test.fixme : test)(
            'Password visibility toggles between hidden and shown',
            pendingDetails(PASSWORD_TOGGLE_PENDING, OTHER_TESTS_PROBLEM),
            async ({ loginScreen }) => {
              await loginScreen.enterPassword(websiteLoginData.wrongPassword);
              await loginScreen.hideKeyboard();
              const toggle = loginScreen.passwordVisibilityToggle;
              // A missing control is a failure, not a skip: it is a defect or a broken selector.
              expect(await toggle.isExisting(), 'password visibility control').toBe(true);
              await toggle.click();
              expect(await loginScreen.passwordInputShown.isDisplayed()).toBe(true);
              await toggle.click();
              expect(await (await loginScreen.onlyPasswordInput()).isDisplayed()).toBe(true);
              // Nothing was submitted: the phone is empty, so Log In stays disabled.
              expect(await isEnabled(await loginScreen.loginButton())).toBe(false);
            },
          );
          /* eslint-enable @typescript-eslint/unbound-method, playwright/no-standalone-expect */

          test.fixme(
            'Invalid phone number format',
            {
              annotation: categoryAnnotations({
                fixme: 'behaviour not recorded on any platform; not invented',
                textGate: OTHER_TESTS_PROBLEM,
              }),
            },
            () => {
              // Behaviour not recorded on any platform yet; not invented here.
            },
          );

          test.fixme(
            'Incorrect password for a registered account',
            {
              annotation: categoryAnnotations({
                fixme:
                  'repeated wrong passwords can lock the account: needs Q10 to Q12 and its own approval',
                textGate: OTHER_TESTS_PROBLEM,
              }),
            },
            () => {
              // Repeated wrong passwords can lock shared accounts. Needs the backend's lock
              // threshold and unlock route (config/ios-account-policy.ts) and its own approval.
            },
          );

          test.describe('server calls', () => {
            // An unregistered number: no account exists, so nothing can be locked or changed.
            test.skip(Boolean(UNREGISTERED_LOGIN_PROBLEM), UNREGISTERED_LOGIN_PROBLEM);

            test(
              'Invalid credentials are rejected with a validation message',
              {
                annotation: categoryAnnotations({
                  ...runCauses('unregistered-login'),
                  textGate: OTHER_TESTS_PROBLEM,
                }),
              },
              async ({ loginScreen, text }) => {
                await loginScreen.login(
                  websiteLoginData.unregisteredPhone,
                  websiteLoginData.wrongPassword,
                  { kind: 'unregistered-login' },
                );
                await expect
                  .poll(() => loginScreen.text(text.invalidCredentials).isDisplayed(), {
                    timeout: SERVER_RESPONSE_TIMEOUT,
                  })
                  .toBe(true);
              },
            );
          });
        });
      });

      // Dealer login and logout (the account's password from .env: the owner recorded it as the current
      // one). It needs no OTP and no password reset. The text it uses was verified on the device, so it
      // runs under the narrow text gate; everything account-related is guarded and authorized.
      test.describe('server calls', () => {
        test.skip(Boolean(LOGIN_PROBLEM), LOGIN_PROBLEM);

        test.afterEach(async ({ driver, iosConfig, appShell, accountScreen }) => {
          // Pass or fail: back to guest state, or the next account run is blocked (marker).
          await cleanupAccountState(driver, iosConfig, appShell, accountScreen);
        });

        test(
          GUEST_FORM_TEST_TITLES[10],
          { annotation: categoryAnnotations({ ...runCauses('login') }) },
          async ({
            driver,
            iosConfig,
            appShell,
            loginScreen,
            accountScreen,
            text,
            iosDealerAccount,
          }) => {
            test.skip(
              !baselineEstablishedNow(),
              "Precondition not met: no completed reset to the baseline is on record and the owner has not recorded that the .env password is the account's current password.",
            );
            await restartIosApp(driver, iosConfig);
            // 1. The initial state is asserted, never assumed: requireGuestAtStart fails unless the app is
            //    in the guest state (language-independent), and openGuestLoginForm requires it again once
            //    the language is set.
            await requireGuestAtStart(appShell, accountScreen);
            // 2. A genuine login through the central guard; then the signed-in state is asserted.
            await openGuestLoginForm(appShell, loginScreen, lang, text);
            await loginScreen.login(iosDealerAccount.phone, iosDealerAccount.password, {
              kind: 'login',
            });
            await expect
              .poll(() => isSignedInNow(appShell, text), { timeout: SERVER_RESPONSE_TIMEOUT })
              .toBe(true);
            // 3. Logout: exactly one control with the verified label, exactly one confirmation sheet
            //    ("Back" shown once) and exactly one visible confirmation button; any other count throws.
            await accountScreen.logout(text.logoutConfirm, text.logoutBack);
            // 4. The signed-out state is verified: the guest prompt is shown again.
            await expect
              .poll(() => isSignedInNow(appShell, text), { timeout: SERVER_RESPONSE_TIMEOUT })
              .toBe(false);
          },
        );
      });

      // Declared only: needs text beyond the narrow gate while the full IOS_TEXT_VERIFIED gate is closed.
      test.describe(() => {
        test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

        // The Individual account is excluded by the QA owner: declared, never run.
        test.describe('individual', () => {
          test.skip(true, INDIVIDUAL_EXCLUDED_REASON);

          test(
            'Successful login (individual) navigates to the account tab, and logout returns to guest',
            {
              annotation: categoryAnnotations({
                excluded: INDIVIDUAL_EXCLUDED_REASON,
                textGate: OTHER_TESTS_PROBLEM,
              }),
            },
            () => {
              // Excluded: no Individual account is used by iOS automation.
            },
          );
        });
      });
    },
  );
}
