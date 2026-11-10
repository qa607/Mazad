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
  LOGOUT_BLOCKED,
  PASSWORD_RESET_BLOCKED,
} from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import type { Language } from '@typings';

/** Account-changing operations are blocked unless approved for the run (src/utils/account-actions.ts). */
const RESET_GATE = firstBlocked(PASSWORD_RESET_BLOCKED, LOGOUT_BLOCKED);

// One physical device/emulator and one Appium session per worker: these tests must not run
// concurrently with each other, with forgot-password.spec.ts, or with app-tabs.spec.ts — run
// this project with --workers=1. Real credentials are entered, so nothing here is printed.
test.describe.configure({ mode: 'serial' });

/**
 * Upper bound for a message that appears only after staging responds. Staging over NetBird
 * can take longer than Playwright's 5 s default; the wait is bounded, so a backend that never
 * answers still fails the test.
 */
const SERVER_RESPONSE_TIMEOUT = 20_000;

const languages: Language[] = ['en', 'ar'];

/**
 * The Individual test account is currently rate-limited on staging from earlier testing
 * (see the project report) and must not be retried until its cooldown expires. Its tests are
 * written the same as Dealer's, parameterised so they run unchanged once the account recovers;
 * for now their OTP-dependent cases are skipped explicitly rather than attempted.
 */
const INDIVIDUAL_ON_COOLDOWN = true;

async function expectDisabledWithEmptyPhone(loginScreen: MazadLoginScreen): Promise<void> {
  await loginScreen.enterPassword(websiteLoginData.wrongPassword);
  // WebdriverIO element, not a Playwright Locator: toBeDisabled() does not apply here.
  // eslint-disable-next-line playwright/prefer-web-first-assertions
  expect(await loginScreen.loginButton.isEnabled()).toBe(false);
}

async function expectDisabledWithEmptyPassword(loginScreen: MazadLoginScreen): Promise<void> {
  await loginScreen.enterPhone(websiteLoginData.unregisteredPhone);
  // WebdriverIO element, not a Playwright Locator: toBeDisabled() does not apply here.
  // eslint-disable-next-line playwright/prefer-web-first-assertions
  expect(await loginScreen.loginButton.isEnabled()).toBe(false);
}

async function expectInvalidCredentialsRejected(
  loginScreen: MazadLoginScreen,
  invalidCredentialsText: string,
): Promise<void> {
  await loginScreen.login(websiteLoginData.unregisteredPhone, websiteLoginData.wrongPassword);
  await expect
    .poll(() => loginScreen.message(invalidCredentialsText).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
}

async function expectSuccessfulLoginAndLogout(
  loginScreen: MazadLoginScreen,
  accountScreen: MazadAccountScreen,
  otpCode: string,
  account: DirectoryAccount,
  text: (typeof mobileAppText)[Language],
): Promise<void> {
  const newPassword = generateTestPassword();
  await loginScreen.resetPasswordViaForgotPassword(
    account.phone,
    otpCode,
    newPassword,
    text.loginFlow.fingerprintPromptDismiss,
  );
  // The account lands on the "More" tab: confirm a logged-in indicator is present before
  // attempting a fresh, independent login (the reset itself already logs the account in).
  await expect
    .poll(() => accountScreen.logoutItem(text.loginFlow.logoutConfirm).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);

  await accountScreen.confirmLogout(text.loginFlow.logoutConfirm, text.loginFlow.logoutConfirm);
  await expect
    .poll(() => loginScreen.message(text.loginFlow.guestPrompt).isDisplayed(), {
      timeout: SERVER_RESPONSE_TIMEOUT,
    })
    .toBe(true);
}

for (const lang of languages) {
  const text = mobileAppText[lang];

  test.describe(
    `Android login - individual (${lang})`,
    allureLabels({
      feature: 'Login',
      story: 'Login (individual account)',
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
      });

      test('Empty phone number keeps Log In disabled', async ({ loginScreen }) => {
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
        await expectDisabledWithEmptyPhone(loginScreen);
      });

      test('Empty password keeps Log In disabled', async ({ loginScreen }) => {
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
        await expectDisabledWithEmptyPassword(loginScreen);
      });

      test('Invalid credentials are rejected with a validation message', async ({
        loginScreen,
        t,
      }) => {
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
        await expectInvalidCredentialsRejected(loginScreen, t('invalidCredentials'));
      });

      // Resets the account password and logs it out: account-changing, blocked unless approved.
      // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (RESET_GATE ? test.skip : test)(
        'Successful login navigates to the account tab, and logout returns to guest',
        { annotation: blockedBy(RESET_GATE) },
        async ({ loginScreen, accountScreen, otpCode, individualAccount }) => {
          test.skip(
            INDIVIDUAL_ON_COOLDOWN,
            'Individual test account is rate-limited from earlier testing; not retried until the cooldown expires (see report).',
          );
          await loginScreen.openLoginForm(
            text.loginFlow.guestPrompt,
            text.loginFlow.entryChoiceLogin,
          );
          await expectSuccessfulLoginAndLogout(
            loginScreen,
            accountScreen,
            otpCode,
            individualAccount,
            text,
          );
        },
      );
    },
  );

  test.describe(
    `Android login - dealer (${lang})`,
    allureLabels({
      feature: 'Login',
      story: 'Login (dealer account)',
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
      });

      test('Empty phone number keeps Log In disabled', async ({ loginScreen }) => {
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
        await expectDisabledWithEmptyPhone(loginScreen);
      });

      test('Empty password keeps Log In disabled', async ({ loginScreen }) => {
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
        await expectDisabledWithEmptyPassword(loginScreen);
      });

      test('Invalid credentials are rejected with a validation message', async ({
        loginScreen,
        t,
      }) => {
        await loginScreen.openLoginForm(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceLogin,
        );
        await expectInvalidCredentialsRejected(loginScreen, t('invalidCredentials'));
      });

      // Resets the account password and logs it out: account-changing, blocked unless approved.
      // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (RESET_GATE ? test.skip : test)(
        'Successful login navigates to the account tab, and logout returns to guest',
        { annotation: blockedBy(RESET_GATE) },
        async ({ loginScreen, accountScreen, otpCode, dealerAccount }) => {
          await loginScreen.openLoginForm(
            text.loginFlow.guestPrompt,
            text.loginFlow.entryChoiceLogin,
          );
          await expectSuccessfulLoginAndLogout(
            loginScreen,
            accountScreen,
            otpCode,
            dealerAccount,
            text,
          );
        },
      );
    },
  );

  test.describe(
    `Android login - guest (${lang})`,
    allureLabels({
      feature: 'Login',
      story: 'Field validation (guest)',
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

      test('Empty phone number and password keep Log In disabled', async ({ loginScreen }) => {
        // WebdriverIO element, not a Playwright Locator: toBeDisabled() does not apply here.
        // eslint-disable-next-line playwright/prefer-web-first-assertions
        expect(await loginScreen.loginButton.isEnabled()).toBe(false);
      });

      // Unverified: the app's validation for a malformed phone number has not been recorded yet.
      test.fixme('Invalid phone number format', () => {});
    },
  );
}
