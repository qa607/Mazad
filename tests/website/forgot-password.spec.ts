import type { Page } from '@playwright/test';
import { expect, test } from '@fixtures/website.fixture';
import type { DirectoryAccount } from '@pages/backend/mazad-user-directory.page';
import { MazadWebsiteLoginPage } from '@pages/website/mazad-login.page';
import { websiteLoginData, websiteUrls } from '@test-data/website-login.data';
import {
  blockedBy,
  firstBlocked,
  OTP_REQUEST_BLOCKED,
  PASSWORD_RESET_BLOCKED,
} from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import type { Translator } from '@locales';

/** Account-changing operations are blocked unless approved for the run (src/utils/account-actions.ts). */
const OTP_GATE = OTP_REQUEST_BLOCKED;
const RESET_GATE = firstBlocked(OTP_REQUEST_BLOCKED, PASSWORD_RESET_BLOCKED);

// Every test here either requests a real OTP or attempts to, so none can run with tracing,
// video or an automatic screenshot on (input values and OTPs must never land in a report).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

/** Shared scenario bodies; see login.spec.ts for why these take plain arguments instead of
 * fixtures (Playwright can't resolve a fixture chosen dynamically by role at runtime). */

async function expectUnregisteredPhoneRejected(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
): Promise<void> {
  await loginPage.openForgotPassword();
  await expect(page.locator('body')).toContainText(t('resetPasswordHeading'));

  await loginPage.requestPasswordReset(websiteLoginData.unregisteredPhone);

  await expect(loginPage.errorMessage).toHaveText(t('unregisteredPhone'));
}

async function expectEmptyPhoneKeepsSendDisabled(loginPage: MazadWebsiteLoginPage): Promise<void> {
  await loginPage.openForgotPassword();
  await expect(loginPage.sendButton).toBeDisabled();
}

async function expectEmptyOtpKeepsVerifyDisabled(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
  account: DirectoryAccount,
): Promise<void> {
  await loginPage.openForgotPassword();
  await loginPage.requestPasswordReset(account.phone);
  await expect(page.locator('body')).toContainText(t('otpVerificationHeading'));
  await expect(loginPage.verifyButton).toBeDisabled();
}

async function expectIncorrectOtpRejected(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
  account: DirectoryAccount,
): Promise<void> {
  await loginPage.openForgotPassword();
  await loginPage.requestPasswordReset(account.phone);
  await expect(page.locator('body')).toContainText(t('otpVerificationHeading'));

  await loginPage.verifyOtp(websiteLoginData.wrongOtp);

  await expect(loginPage.errorMessage).toContainText(t('incorrectOtp'));
  // Still on the OTP step: the account's password is unaffected by a wrong code.
  await expect(page.locator('body')).toContainText(t('otpVerificationHeading'));
}

async function expectTooShortPasswordRejected(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
  otpCode: string,
  account: DirectoryAccount,
): Promise<void> {
  await loginPage.openForgotPassword();
  await loginPage.requestPasswordReset(account.phone);
  await loginPage.verifyOtp(otpCode);
  await expect(page.locator('body')).toContainText(t('newPasswordHeading'));

  await loginPage.setNewPassword(websiteLoginData.tooShortPassword);

  await expect(loginPage.errorMessage).toHaveText(t('passwordTooShort'));
  await expect(page).toHaveURL(websiteUrls.login);
}

async function expectEmptyNewPasswordKeepsSaveDisabled(
  loginPage: MazadWebsiteLoginPage,
  otpCode: string,
  account: DirectoryAccount,
): Promise<void> {
  await loginPage.openForgotPassword();
  await loginPage.requestPasswordReset(account.phone);
  await loginPage.verifyOtp(otpCode);

  await expect(loginPage.saveAndLoginButton).toBeDisabled();
}

async function expectCompleteResetFlowSucceeds(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
  otpCode: string,
  account: DirectoryAccount,
): Promise<void> {
  // 1-2. Already on /login (beforeEach navigates there).
  // 3. Select Forgot Password.
  await loginPage.openForgotPassword();
  await expect(page.locator('body')).toContainText(t('resetPasswordHeading'));

  // 4-5. Enter the phone and request an OTP.
  await loginPage.requestPasswordReset(account.phone);
  await expect(page.locator('body')).toContainText(t('otpVerificationHeading'));

  // 6-8. Read the (fixed, staging-only) OTP from config, enter it, and confirm it is accepted.
  await loginPage.verifyOtp(otpCode);
  await expect(page.locator('body')).toContainText(t('newPasswordHeading'));

  // 9-11. Enter and submit a new password. The application's own screen has a single password
  // field with no separate confirmation field, so there is no "confirm the new password" step
  // or mismatch case to automate here — this reflects the real screen, not an assumption.
  const newPassword = generateTestPassword();
  await loginPage.setNewPassword(newPassword);

  // 12. The reset succeeds and the application logs the account in immediately.
  await expect(page).toHaveURL(websiteUrls.home);
  await expect(loginPage.accountMenuTrigger).toBeVisible();

  // 13-14. Log in again, independently, with the new password, and confirm the landing page.
  await loginPage.clearSession();
  await loginPage.goto();
  await Promise.all([
    page.waitForURL(websiteUrls.home),
    loginPage.login(account.phone, newPassword),
  ]);
  await expect(page).toHaveURL(websiteUrls.home);
  await expect(loginPage.accountMenuTrigger).toBeVisible();
}

test.describe(
  'Website forgot password - individual',
  allureLabels({
    feature: 'Forgot Password',
    story: 'Forgot Password (individual account)',
    severity: 'critical',
    platform: 'web',
  }),
  () => {
    // These tests share one real test account's phone number, so its OTP / password-reset state
    // must not be touched by two tests at once: serial forces them onto a single worker, in order.
    test.describe.configure({ mode: 'serial', timeout: 90_000 });

    test.beforeEach(async ({ mazadWebsiteLoginPage }) => {
      await mazadWebsiteLoginPage.goto();
    });

    test.afterEach(async ({ page, mazadWebsiteLoginPage }, testInfo) => {
      if (testInfo.status === testInfo.expectedStatus) return;
      const screenshot = await page
        .screenshot({ mask: mazadWebsiteLoginPage.sensitiveAreas() })
        .catch(() => null);
      if (screenshot) {
        await testInfo.attach('screenshot (credentials and OTP masked)', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    });

    test('Unregistered phone number is rejected', async ({ page, mazadWebsiteLoginPage, t }) => {
      await expectUnregisteredPhoneRejected(page, mazadWebsiteLoginPage, t);
    });

    test('Empty phone number keeps Send disabled', async ({ mazadWebsiteLoginPage }) => {
      await expectEmptyPhoneKeepsSendDisabled(mazadWebsiteLoginPage);
    });

    // "Expired OTP" is not covered: staging's resend cooldown (about a minute) is the only
    // timed behaviour observed, and the OTP's own expiry was not confirmed within that window;
    // waiting out a real expiry would make this test too slow to run routinely.
    test('Expired OTP is rejected', () => {
      test.fixme(
        true,
        'Not automated: OTP expiry duration is not confirmed on staging (see Missing access section).',
      );
    });

    // Every test below requests an OTP for a registered test account: account-changing,
    // blocked unless approved. The complete reset also changes the account password.
    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'Empty OTP keeps Verify disabled',
      { annotation: blockedBy(OTP_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, individualAccount }) => {
        await expectEmptyOtpKeepsVerifyDisabled(page, mazadWebsiteLoginPage, t, individualAccount);
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'Incorrect OTP is rejected',
      { annotation: blockedBy(OTP_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, individualAccount }) => {
        await expectIncorrectOtpRejected(page, mazadWebsiteLoginPage, t, individualAccount);
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'A too-short new password is rejected',
      { annotation: blockedBy(OTP_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, otpCode, individualAccount }) => {
        await expectTooShortPasswordRejected(
          page,
          mazadWebsiteLoginPage,
          t,
          otpCode,
          individualAccount,
        );
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'Empty new password keeps Save and Login disabled',
      { annotation: blockedBy(OTP_GATE) },
      async ({ mazadWebsiteLoginPage, otpCode, individualAccount }) => {
        await expectEmptyNewPasswordKeepsSaveDisabled(
          mazadWebsiteLoginPage,
          otpCode,
          individualAccount,
        );
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (RESET_GATE ? test.skip : test)(
      'Complete reset: phone, OTP, new password, then login with it',
      { annotation: blockedBy(RESET_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, otpCode, individualAccount }) => {
        await expectCompleteResetFlowSucceeds(
          page,
          mazadWebsiteLoginPage,
          t,
          otpCode,
          individualAccount,
        );
      },
    );
  },
);

test.describe(
  'Website forgot password - dealer',
  allureLabels({
    feature: 'Forgot Password',
    story: 'Forgot Password (dealer account)',
    severity: 'critical',
    platform: 'web',
  }),
  () => {
    // Same reason as the individual suite above: one shared account, so tests run in order.
    test.describe.configure({ mode: 'serial', timeout: 90_000 });

    test.beforeEach(async ({ mazadWebsiteLoginPage }) => {
      await mazadWebsiteLoginPage.goto();
    });

    test.afterEach(async ({ page, mazadWebsiteLoginPage }, testInfo) => {
      if (testInfo.status === testInfo.expectedStatus) return;
      const screenshot = await page
        .screenshot({ mask: mazadWebsiteLoginPage.sensitiveAreas() })
        .catch(() => null);
      if (screenshot) {
        await testInfo.attach('screenshot (credentials and OTP masked)', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    });

    test('Unregistered phone number is rejected', async ({ page, mazadWebsiteLoginPage, t }) => {
      await expectUnregisteredPhoneRejected(page, mazadWebsiteLoginPage, t);
    });

    test('Empty phone number keeps Send disabled', async ({ mazadWebsiteLoginPage }) => {
      await expectEmptyPhoneKeepsSendDisabled(mazadWebsiteLoginPage);
    });

    test('Expired OTP is rejected', () => {
      test.fixme(
        true,
        'Not automated: OTP expiry duration is not confirmed on staging (see Missing access section).',
      );
    });

    // Every test below requests an OTP for a registered test account: account-changing,
    // blocked unless approved. The complete reset also changes the account password.
    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'Empty OTP keeps Verify disabled',
      { annotation: blockedBy(OTP_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, dealerAccount }) => {
        await expectEmptyOtpKeepsVerifyDisabled(page, mazadWebsiteLoginPage, t, dealerAccount);
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'Incorrect OTP is rejected',
      { annotation: blockedBy(OTP_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, dealerAccount }) => {
        await expectIncorrectOtpRejected(page, mazadWebsiteLoginPage, t, dealerAccount);
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'A too-short new password is rejected',
      { annotation: blockedBy(OTP_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, otpCode, dealerAccount }) => {
        await expectTooShortPasswordRejected(
          page,
          mazadWebsiteLoginPage,
          t,
          otpCode,
          dealerAccount,
        );
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (OTP_GATE ? test.skip : test)(
      'Empty new password keeps Save and Login disabled',
      { annotation: blockedBy(OTP_GATE) },
      async ({ mazadWebsiteLoginPage, otpCode, dealerAccount }) => {
        await expectEmptyNewPasswordKeepsSaveDisabled(
          mazadWebsiteLoginPage,
          otpCode,
          dealerAccount,
        );
      },
    );

    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (RESET_GATE ? test.skip : test)(
      'Complete reset: phone, OTP, new password, then login with it',
      { annotation: blockedBy(RESET_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, otpCode, dealerAccount }) => {
        await expectCompleteResetFlowSucceeds(
          page,
          mazadWebsiteLoginPage,
          t,
          otpCode,
          dealerAccount,
        );
      },
    );
  },
);

// Role-independent checks: no account, no OTP, no submission. Runs in both language projects.
test.describe(
  'Website forgot password - guest',
  allureLabels({
    feature: 'Forgot Password',
    story: 'Navigation and field validation (guest)',
    severity: 'critical',
    platform: 'web',
  }),
  () => {
    test.beforeEach(async ({ mazadWebsiteLoginPage }) => {
      await mazadWebsiteLoginPage.goto();
    });

    test('Forgot Password opens from Login with an empty phone field', async ({
      page,
      mazadWebsiteLoginPage,
      t,
    }) => {
      await mazadWebsiteLoginPage.openForgotPassword();
      await expect(page.locator('body')).toContainText(t('resetPasswordHeading'));
      await expect(mazadWebsiteLoginPage.mobileNumberInput).toBeVisible();
      await expect(mazadWebsiteLoginPage.mobileNumberInput).toHaveValue('');
      await expect(mazadWebsiteLoginPage.passwordInput).toBeHidden();
      // The Forgot Password view replaces the form in place: the URL stays on /login.
      await expect(page).toHaveURL(websiteUrls.login);
    });

    // Unverified: the website's validation for a malformed phone number has not been recorded
    // yet (no inspection until the staging/network safety requirements are met).
    test.fixme('Invalid phone number format', () => {});
  },
);

// Not applicable on the website: the new-password step has a single field and no
// confirmation field (recorded on staging; see MazadWebsiteLoginPage). Kept for traceability.
test.describe('Website forgot password - not applicable', () => {
  test.skip(true, 'N/A on web: the new-password step has no password confirmation field.');

  test('Password confirmation mismatch', () => {});
});
