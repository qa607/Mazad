import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import { ensureSignedOut } from '@mobile/ensure-signed-out';
import type { DirectoryAccount } from '@pages/backend/mazad-user-directory.page';
import { MazadAccountScreen } from '@mobile/screens/account.screen';
import { MazadLoginScreen } from '@mobile/screens/login.screen';
import { mobileAppText } from '@test-data/mobile-app.data';
import { websiteLoginData } from '@test-data/website-login.data';
import {
  blockedBy,
  firstBlocked,
  OTP_REQUEST_BLOCKED,
  PASSWORD_RESET_BLOCKED,
} from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import type { Language } from '@typings';

/** Account-changing operations are blocked unless approved for the run (src/utils/account-actions.ts). */
const RESET_GATE = firstBlocked(OTP_REQUEST_BLOCKED, PASSWORD_RESET_BLOCKED);

// Same device/session constraint as login.spec.ts: run this project with --workers=1, and
// never alongside login.spec.ts or app-tabs.spec.ts. No trace/report captures real credentials
// or OTPs here — Appium step logs do not record setValue() arguments by default.
test.describe.configure({ mode: 'serial' });

/**
 * Upper bound for a message that appears only after staging responds. Staging over NetBird
 * can take longer than Playwright's 5 s default; the wait is bounded, so a backend that never
 * answers still fails the test.
 */
const SERVER_RESPONSE_TIMEOUT = 20_000;

const languages: Language[] = ['en', 'ar'];

/** See login.spec.ts: the Individual account is rate-limited from earlier testing. */
const INDIVIDUAL_ON_COOLDOWN = true;

async function expectUnregisteredPhoneRejected(
  loginScreen: MazadLoginScreen,
  unregisteredPhoneText: string,
): Promise<void> {
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(websiteLoginData.unregisteredPhone);
  await expect
    .poll(() => loginScreen.message(unregisteredPhoneText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
}

async function expectEmptyPhoneKeepsSendDisabled(loginScreen: MazadLoginScreen): Promise<void> {
  await loginScreen.openForgotPassword();
  // WebdriverIO element, not a Playwright Locator: toBeDisabled() does not apply here.
  // eslint-disable-next-line playwright/prefer-web-first-assertions
  expect(await loginScreen.sendButton.isEnabled()).toBe(false);
}

async function expectEmptyOtpKeepsVerifyDisabled(
  loginScreen: MazadLoginScreen,
  otpHeadingText: string,
  account: DirectoryAccount,
): Promise<void> {
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(account.phone);
  await expect
    .poll(() => loginScreen.message(otpHeadingText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
  // WebdriverIO element, not a Playwright Locator: toBeDisabled() does not apply here.
  // eslint-disable-next-line playwright/prefer-web-first-assertions
  expect(await loginScreen.verifyButton.isEnabled()).toBe(false);
}

async function expectIncorrectOtpRejected(
  loginScreen: MazadLoginScreen,
  incorrectOtpText: string,
  otpHeadingText: string,
  account: DirectoryAccount,
): Promise<void> {
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(account.phone);
  await expect
    .poll(() => loginScreen.message(otpHeadingText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);

  await loginScreen.verifyOtp(websiteLoginData.wrongOtp);

  await expect
    .poll(() => loginScreen.message(incorrectOtpText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
  // Still on the OTP step: a wrong code does not change the account's password.
  await expect
    .poll(() => loginScreen.message(otpHeadingText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
}

async function expectTooShortPasswordRejected(
  loginScreen: MazadLoginScreen,
  passwordTooShortText: string,
  newPasswordHeadingText: string,
  otpCode: string,
  account: DirectoryAccount,
): Promise<void> {
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(account.phone);
  await loginScreen.verifyOtp(otpCode);
  await expect
    .poll(() => loginScreen.message(newPasswordHeadingText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);

  await loginScreen.setNewPassword(websiteLoginData.tooShortPassword);

  await expect
    .poll(() => loginScreen.message(passwordTooShortText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
}

async function expectEmptyNewPasswordKeepsSaveDisabled(
  loginScreen: MazadLoginScreen,
  otpCode: string,
  account: DirectoryAccount,
): Promise<void> {
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(account.phone);
  await loginScreen.verifyOtp(otpCode);

  // WebdriverIO element, not a Playwright Locator: toBeDisabled() does not apply here.
  // eslint-disable-next-line playwright/prefer-web-first-assertions
  expect(await loginScreen.saveAndLoginButton.isEnabled()).toBe(false);
}

async function expectCompleteResetFlowSucceeds(
  loginScreen: MazadLoginScreen,
  accountScreen: MazadAccountScreen,
  otpCode: string,
  account: DirectoryAccount,
  text: (typeof mobileAppText)[Language],
): Promise<void> {
  await loginScreen.openForgotPassword();
  await loginScreen.requestPasswordReset(account.phone);

  const newPassword = generateTestPassword();
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

  // Log in again, independently, with the new password, and confirm the landing state.
  await accountScreen.confirmLogout(text.loginFlow.logoutConfirm, text.loginFlow.logoutConfirm);
  await loginScreen.openLoginForm(text.loginFlow.guestPrompt, text.loginFlow.entryChoiceLogin);
  await loginScreen.login(account.phone, newPassword);
  await expect
    .poll(() => accountScreen.logoutItem(text.loginFlow.logoutConfirm).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
}

function registerSuite(role: 'individual' | 'dealer', lang: Language): void {
  const text = mobileAppText[lang];

  test.describe(
    `Android forgot password - ${role} (${lang})`,
    allureLabels({
      feature: 'Forgot Password',
      story: `Forgot Password (${role} account)`,
      severity: 'critical',
      platform: 'android',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

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
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
      });

      test('Unregistered phone number is rejected', async ({ loginScreen, t }) => {
        await expectUnregisteredPhoneRejected(loginScreen, t('unregisteredPhone'));
      });

      test('Empty phone number keeps Send disabled', async ({ loginScreen }) => {
        await expectEmptyPhoneKeepsSendDisabled(loginScreen);
      });

      // Same reasoning as the website suite: OTP expiry duration is not confirmed on staging,
      // and waiting out a real expiry would make this test too slow to run routinely.
      test('Expired OTP is rejected', () => {
        test.fixme(true, 'Not automated: OTP expiry duration is not confirmed on staging.');
      });
    },
  );
}

function registerOtpDependentSuite(role: 'individual' | 'dealer', lang: Language): void {
  const text = mobileAppText[lang];

  test.describe(
    `Android forgot password - ${role} (${lang}) - OTP-dependent`,
    allureLabels({
      feature: 'Forgot Password',
      story: `OTP and new password (${role} account)`,
      severity: 'critical',
      platform: 'android',
      language: lang,
    }),
    () => {
      // Every test here requests an OTP for a registered test account: account-changing,
      // blocked unless approved (decided when this file loads: no hook or fixture runs).
      test.skip(Boolean(OTP_REQUEST_BLOCKED), OTP_REQUEST_BLOCKED);
      test.use({ language: lang });

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
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
      });

      if (role === 'individual') {
        test('Empty OTP keeps Verify disabled', async ({ loginScreen, t, individualAccount }) => {
          test.skip(INDIVIDUAL_ON_COOLDOWN, 'Individual test account is rate-limited; see report.');
          await expectEmptyOtpKeepsVerifyDisabled(
            loginScreen,
            t('otpVerificationHeading'),
            individualAccount,
          );
        });

        test('Incorrect OTP is rejected', async ({ loginScreen, t, individualAccount }) => {
          test.skip(INDIVIDUAL_ON_COOLDOWN, 'Individual test account is rate-limited; see report.');
          await expectIncorrectOtpRejected(
            loginScreen,
            t('incorrectOtp'),
            t('otpVerificationHeading'),
            individualAccount,
          );
        });

        test('A too-short new password is rejected', async ({
          loginScreen,
          t,
          otpCode,
          individualAccount,
        }) => {
          test.skip(INDIVIDUAL_ON_COOLDOWN, 'Individual test account is rate-limited; see report.');
          await expectTooShortPasswordRejected(
            loginScreen,
            t('passwordTooShort'),
            t('newPasswordHeading'),
            otpCode,
            individualAccount,
          );
        });

        test('Empty new password keeps Save and Login disabled', async ({
          loginScreen,
          otpCode,
          individualAccount,
        }) => {
          test.skip(INDIVIDUAL_ON_COOLDOWN, 'Individual test account is rate-limited; see report.');
          await expectEmptyNewPasswordKeepsSaveDisabled(loginScreen, otpCode, individualAccount);
        });

        // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
        // eslint-disable-next-line @typescript-eslint/unbound-method
        (RESET_GATE ? test.skip : test)(
          'Complete reset: phone, OTP, new password, then login with it',
          { annotation: blockedBy(RESET_GATE) },
          async ({ loginScreen, accountScreen, otpCode, individualAccount }) => {
            test.skip(
              INDIVIDUAL_ON_COOLDOWN,
              'Individual test account is rate-limited; see report.',
            );
            await expectCompleteResetFlowSucceeds(
              loginScreen,
              accountScreen,
              otpCode,
              individualAccount,
              text,
            );
          },
        );
      } else {
        test('Empty OTP keeps Verify disabled', async ({ loginScreen, t, dealerAccount }) => {
          await expectEmptyOtpKeepsVerifyDisabled(
            loginScreen,
            t('otpVerificationHeading'),
            dealerAccount,
          );
        });

        test('Incorrect OTP is rejected', async ({ loginScreen, t, dealerAccount }) => {
          await expectIncorrectOtpRejected(
            loginScreen,
            t('incorrectOtp'),
            t('otpVerificationHeading'),
            dealerAccount,
          );
        });

        test('A too-short new password is rejected', async ({
          loginScreen,
          t,
          otpCode,
          dealerAccount,
        }) => {
          await expectTooShortPasswordRejected(
            loginScreen,
            t('passwordTooShort'),
            t('newPasswordHeading'),
            otpCode,
            dealerAccount,
          );
        });

        test('Empty new password keeps Save and Login disabled', async ({
          loginScreen,
          otpCode,
          dealerAccount,
        }) => {
          await expectEmptyNewPasswordKeepsSaveDisabled(loginScreen, otpCode, dealerAccount);
        });

        // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
        // eslint-disable-next-line @typescript-eslint/unbound-method
        (RESET_GATE ? test.skip : test)(
          'Complete reset: phone, OTP, new password, then login with it',
          { annotation: blockedBy(RESET_GATE) },
          async ({ loginScreen, accountScreen, otpCode, dealerAccount }) => {
            await expectCompleteResetFlowSucceeds(
              loginScreen,
              accountScreen,
              otpCode,
              dealerAccount,
              text,
            );
          },
        );
      }
    },
  );
}

function registerGuestSuite(lang: Language): void {
  const text = mobileAppText[lang];

  test.describe(
    `Android forgot password - guest (${lang})`,
    allureLabels({
      feature: 'Forgot Password',
      story: 'Navigation and field validation (guest)',
      severity: 'critical',
      platform: 'android',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.beforeEach(async ({ driver, appShell, loginScreen, accountScreen }) => {
        await restartApp(driver);
        await appShell.waitUntilReady();
        await appShell.setLanguage(lang, {
          en: mobileAppText.en.languageOption,
          ar: mobileAppText.ar.languageOption,
        });
        // Stops (never logs out) if the app is signed in, unless logout is approved.
        await ensureSignedOut(
          appShell,
          loginScreen,
          accountScreen,
          text.loginFlow.guestPrompt,
          text.loginFlow.logoutConfirm,
        );
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
      });

      test('Forgot Password opens from Login with the phone field', async ({ loginScreen, t }) => {
        await loginScreen.openForgotPassword();
        await expect
          .poll(() => loginScreen.message(t('resetPasswordHeading')).isDisplayed())
          .toBe(true);
        expect(await loginScreen.phoneInput.isDisplayed()).toBe(true);
      });

      // Unverified: the app's validation for a malformed phone number has not been recorded yet.
      test.fixme('Invalid phone number format', () => {});
    },
  );

  // Not applicable on Android: the new-password step has a single field and no confirmation
  // field (recorded on staging; see MazadLoginScreen). Kept for traceability.
  test.describe(`Android forgot password - not applicable (${lang})`, () => {
    test.skip(true, 'N/A on Android: the new-password step has no password confirmation field.');

    test('Password confirmation mismatch', () => {});
  });
}

for (const lang of languages) {
  registerGuestSuite(lang);
  registerSuite('individual', lang);
  registerSuite('dealer', lang);
  registerOtpDependentSuite('individual', lang);
  registerOtpDependentSuite('dealer', lang);
}
