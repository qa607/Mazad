import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import { ensureSignedOut } from '@mobile/ensure-signed-out';
import {
  ANDROID_TEST_INDIVIDUAL_MISSING_REASON,
  getAndroidTestIndividual,
} from '@config/credentials.config';
import { mobileAppText } from '@test-data/mobile-app.data';
import { registrationCityOption } from '@test-data/registration.data';
import {
  blockedBy,
  firstBlocked,
  OTP_REQUEST_BLOCKED,
  PASSWORD_RESET_BLOCKED,
} from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import { uniqueDigits } from '@utils/unique';
import type { Language } from '@typings';

// Same shared device/Appium session as the other Android specs: must not run concurrently with
// them (run this project with --workers=1).
test.describe.configure({ mode: 'serial' });

const SERVER_RESPONSE_TIMEOUT = 20_000;

async function expectResetAndLoginSucceeds(
  loginScreen: import('@mobile/screens/login.screen').MazadLoginScreen,
  accountScreen: import('@mobile/screens/account.screen').MazadAccountScreen,
  otpCode: string,
  account: import('@config/credentials.config').BackendAccount,
): Promise<void> {
  const text = mobileAppText.en;
  const newPassword = generateTestPassword();

  await loginScreen.openLoginForm(text.loginFlow.guestPrompt, text.loginFlow.entryChoiceLogin);
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(account.phone);
  await loginScreen.verifyOtp(otpCode);
  await loginScreen.setNewPassword(newPassword);
  await loginScreen.dismissUpdatedTermsIfPresent();
  await loginScreen.dismissPromptIfPresent(text.loginFlow.fingerprintPromptDismiss);

  // The reset logs the account in immediately, landing on the "More" tab.
  await expect
    .poll(() => accountScreen.logoutItem(text.loginFlow.logoutConfirm).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);

  // Log in again, independently, with the new password.
  await accountScreen.confirmLogout(text.loginFlow.logoutConfirm, text.loginFlow.logoutConfirm);
  await loginScreen.openLoginForm(text.loginFlow.guestPrompt, text.loginFlow.entryChoiceLogin);
  await loginScreen.login(account.phone, newPassword);
  await expect
    .poll(() => accountScreen.logoutItem(text.loginFlow.logoutConfirm).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);

  // Leave the account signed out and ready for the next run (its own password reset).
  // NOTE: this test changes the recorded account's password every time it runs (the same way the
  // existing Dealer complete-reset test does). Update ANDROID_TEST_INDIVIDUAL_PASSWORD in .env to
  // the generated value if you need to log in with this account again outside this test.
  await accountScreen.confirmLogout(text.loginFlow.logoutConfirm, text.loginFlow.logoutConfirm);
}

/**
 * Registration -> Forgot Password -> Login, Android Individual account (English). Confirmed live
 * on staging, 2026-11-11, by actually registering two Individual accounts, resetting each
 * password and logging in with the new one (once in English, once in Arabic during
 * investigation) — see docs/mobile-registration-progress.md for the full narrative.
 *
 * Deliberately NOT an automated "register a new account" regression test: unlike Forgot
 * Password, registration has no safe way to repeat itself (every successful run creates a new,
 * permanent account with no deletion tooling anywhere in this project). The confirmed English
 * account from that investigation is recorded in the gitignored `.env`
 * (ANDROID_TEST_INDIVIDUAL_PHONE/PASSWORD/IQAMA, read via `getAndroidTestIndividual()`) and reused
 * here, the same way the existing Dealer account is reused by forgot-password.spec.ts — this file
 * does not duplicate that suite; it exercises this specific registration-created account instead
 * of the back-office-discovered one.
 *
 * Personal (Individual) registration itself needs only the mobile OTP — confirmed to reach
 * "Your account has been successfully created!" with no further identity-verification step.
 * Company/Dealer registration is different: it requires Nafath identity verification after OTP,
 * which this suite cannot complete and must never attempt to bypass (see
 * docs/mobile-registration-progress.md and the class doc comment on MazadRegistrationScreen).
 * Nothing here ever touches Company/Dealer registration.
 */
test.describe(
  'Android registration E2E journey (en) - Individual account',
  allureLabels({
    feature: 'Registration',
    story: 'Registration -> Forgot Password -> Login (Individual, E2E)',
    severity: 'critical',
    platform: 'android',
    language: 'en',
  }),
  () => {
    test.use({ language: 'en' });

    test.afterEach(async ({ driver }, testInfo) => {
      if (testInfo.status === testInfo.expectedStatus) return;
      const screenshot = await driver.takeScreenshot().catch(() => null);
      if (screenshot) {
        await testInfo.attach('device screenshot', {
          body: Buffer.from(screenshot, 'base64'),
          contentType: 'image/png',
        });
      }
    });

    test.beforeEach(async ({ driver, appShell, loginScreen, accountScreen }) => {
      await restartApp(driver);
      await appShell.waitUntilReady();
      await appShell.setLanguage('en', {
        en: mobileAppText.en.languageOption,
        ar: mobileAppText.ar.languageOption,
      });
      await ensureSignedOut(
        appShell,
        loginScreen,
        accountScreen,
        mobileAppText.en.loginFlow.guestPrompt,
        mobileAppText.en.loginFlow.logoutConfirm,
      );
    });

    // Account-changing: resets the recorded account's password and logs it in. Blocked unless
    // approved (decided when this file loads: no hook, fixture or account lookup runs).
    const account = getAndroidTestIndividual();
    const RESET_GATE =
      firstBlocked(OTP_REQUEST_BLOCKED, PASSWORD_RESET_BLOCKED) ??
      (account ? undefined : ANDROID_TEST_INDIVIDUAL_MISSING_REASON);

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (RESET_GATE ? test.skip : test)(
      'Forgot Password resets the recorded Individual account and logs in with the new password',
      { annotation: blockedBy(RESET_GATE) },
      async ({ loginScreen, accountScreen, otpCode }) => {
        if (!account) return; // Not reached: RESET_GATE already skipped the test above.
        await expectResetAndLoginSucceeds(loginScreen, accountScreen, otpCode, account);
      },
    );
  },
);

const languages: Language[] = ['en', 'ar'];

/**
 * Registration OTP step — negative scenarios only (confirmed 2026-11-11). Each test opens a
 * fresh registration with its own unused phone number and taps Create Account (one real OTP
 * request per test, gated by OTP_REQUEST_BLOCKED) but never enters the correct code, so no
 * account is ever created here — safe to run repeatedly, unlike the journey above. New coverage:
 * tests/mobile/android/registration.spec.ts never reaches this screen.
 */
for (const lang of languages) {
  const text = mobileAppText[lang];

  test.describe(
    `Android registration OTP - negative scenarios (${lang})`,
    allureLabels({
      feature: 'Registration',
      story: 'Registration OTP validation',
      severity: 'normal',
      platform: 'android',
      language: lang,
    }),
    () => {
      test.use({ language: lang });
      test.skip(Boolean(OTP_REQUEST_BLOCKED), OTP_REQUEST_BLOCKED);

      test.afterEach(async ({ driver }, testInfo) => {
        if (testInfo.status === testInfo.expectedStatus) return;
        const screenshot = await driver.takeScreenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach('device screenshot', {
            body: Buffer.from(screenshot, 'base64'),
            contentType: 'image/png',
          });
        }
      });

      test.beforeEach(async ({ driver, appShell, loginScreen, accountScreen }) => {
        await restartApp(driver);
        await appShell.waitUntilReady();
        await appShell.setLanguage(lang, {
          en: mobileAppText.en.languageOption,
          ar: mobileAppText.ar.languageOption,
        });
        await ensureSignedOut(
          appShell,
          loginScreen,
          accountScreen,
          text.loginFlow.guestPrompt,
          text.loginFlow.logoutConfirm,
        );
      });

      /** Opens registration, Personal, fills Step 2 with a fresh phone, taps Create Account. */
      async function reachRegistrationOtpScreen(
        registrationScreen: import('@mobile/screens/registration.screen').MazadRegistrationScreen,
      ): Promise<void> {
        await registrationScreen.openFromGuestPrompt(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceCreateAccount,
        );
        await registrationScreen.choosePersonalAccount();
        await registrationScreen.continueToStep2();

        await registrationScreen.enterFullName('Test Automation User');
        await registrationScreen.enterIqama('1' + uniqueDigits(9));
        await registrationScreen.enterMobile('05' + uniqueDigits(8));
        await registrationScreen.enterPassword(generateTestPassword());
        await registrationScreen.selectCity(registrationCityOption[lang]);
        await registrationScreen.submitCreateAccount();
      }

      test('Empty OTP keeps Verify disabled', async ({ registrationScreen }) => {
        await reachRegistrationOtpScreen(registrationScreen);

        expect(await registrationScreen.isRegistrationOtpVerifyEnabled()).toBe(false);
      });

      test('Incorrect OTP is rejected', async ({ registrationScreen, t }) => {
        await reachRegistrationOtpScreen(registrationScreen);

        await registrationScreen.verifyRegistrationOtp('0000');
        await expect
          .poll(() => registrationScreen.message(t('incorrectOtp')).isDisplayed(), {
            timeout: SERVER_RESPONSE_TIMEOUT,
          })
          .toBe(true);
      });
    },
  );
}
