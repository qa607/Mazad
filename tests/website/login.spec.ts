import type { Page } from '@playwright/test';
import { expect, test } from '@fixtures/website.fixture';
import type { DirectoryAccount } from '@pages/backend/mazad-user-directory.page';
import { MazadWebsiteLoginPage } from '@pages/website/mazad-login.page';
import { websiteLoginData, websiteUrls } from '@test-data/website-login.data';
import {
  blockedBy,
  firstBlocked,
  LOGOUT_BLOCKED,
  PASSWORD_RESET_BLOCKED,
} from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import type { Translator } from '@locales';

/** Account-changing operations are blocked unless approved for the run (src/utils/account-actions.ts). */
const RESET_GATE = firstBlocked(PASSWORD_RESET_BLOCKED, LOGOUT_BLOCKED);

// These tests enter real credentials, so no trace (it would record input values and action
// arguments), no video and no automatic screenshot — the same policy as the Backend Dev Root
// login spec. On failure, afterEach attaches a screenshot with credential fields masked.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

/** Shared test bodies. Playwright resolves fixtures by the literal names destructured in each
 * `test()` call, so the account fixture can't be chosen dynamically; each describe block below
 * passes in its own already-resolved account instead, and these functions hold the one copy
 * of each scenario's logic. */
async function expectDisabledWithEmptyPhone(loginPage: MazadWebsiteLoginPage): Promise<void> {
  await loginPage.enterPassword(websiteLoginData.wrongPassword);
  await expect(loginPage.loginButton).toBeDisabled();
}

async function expectDisabledWithEmptyPassword(loginPage: MazadWebsiteLoginPage): Promise<void> {
  await loginPage.enterPhone(websiteLoginData.unregisteredPhone);
  await expect(loginPage.loginButton).toBeDisabled();
}

async function expectInvalidCredentialsRejected(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
): Promise<void> {
  await loginPage.login(websiteLoginData.unregisteredPhone, websiteLoginData.wrongPassword);
  await expect(loginPage.errorMessage).toHaveText(t('invalidCredentials'));
  await expect(page).toHaveURL(websiteUrls.login);
}

async function expectSuccessfulLoginAndLogout(
  page: Page,
  loginPage: MazadWebsiteLoginPage,
  t: Translator,
  otpCode: string,
  account: DirectoryAccount,
): Promise<void> {
  // Forgot Password first, to establish a known password for this dedicated test account
  // (its current password is otherwise unknown), then log in with it as its own, fresh action.
  const newPassword = generateTestPassword();
  await loginPage.resetPasswordViaForgotPassword(account.phone, otpCode, newPassword);
  await expect(page).toHaveURL(websiteUrls.home);
  await loginPage.clearSession();
  await loginPage.goto();

  await Promise.all([
    page.waitForURL(websiteUrls.home),
    loginPage.login(account.phone, newPassword),
  ]);

  // #header-login-label is reused for both states: the account's name when signed in, and the
  // guest prompt when signed out. A signed-in check can't assert a specific name (any dedicated
  // test account may match), so it asserts the guest prompt is gone instead.
  await expect(page).toHaveURL(websiteUrls.home);
  await expect(loginPage.accountMenuTrigger).not.toHaveText(t('headerGuestPrompt'));

  await loginPage.logout();

  // Logout updates the header in place; the application does not navigate to /login on its own
  // (confirmed on staging), so this checks the guest prompt is back rather than assuming a URL.
  await expect(page).toHaveURL(websiteUrls.home);
  await expect(loginPage.accountMenuTrigger).toHaveText(t('headerGuestPrompt'));
}

test.describe(
  'Website login - individual',
  allureLabels({
    feature: 'Login',
    story: 'Login (individual account)',
    severity: 'critical',
    platform: 'web',
  }),
  () => {
    // Avoids this file's real-account test racing another website spec file's use of the
    // same dedicated account when both run with multiple workers (CI already uses one worker).
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
        await testInfo.attach('screenshot (credentials masked)', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    });

    test('Empty phone number keeps Login disabled', async ({ mazadWebsiteLoginPage }) => {
      await expectDisabledWithEmptyPhone(mazadWebsiteLoginPage);
    });

    test('Empty password keeps Login disabled', async ({ mazadWebsiteLoginPage }) => {
      await expectDisabledWithEmptyPassword(mazadWebsiteLoginPage);
    });

    test('Invalid credentials are rejected with a validation message', async ({
      page,
      mazadWebsiteLoginPage,
      t,
    }) => {
      await expectInvalidCredentialsRejected(page, mazadWebsiteLoginPage, t);
    });

    // Resets the account password and logs it out: account-changing, blocked unless approved.
    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (RESET_GATE ? test.skip : test)(
      'Successful login navigates to the home page, and logout returns to login',
      { annotation: blockedBy(RESET_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, otpCode, individualAccount }) => {
        await expectSuccessfulLoginAndLogout(
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
  'Website login - dealer',
  allureLabels({
    feature: 'Login',
    story: 'Login (dealer account)',
    severity: 'critical',
    platform: 'web',
  }),
  () => {
    // Avoids this file's real-account test racing another website spec file's use of the
    // same dedicated account when both run with multiple workers (CI already uses one worker).
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
        await testInfo.attach('screenshot (credentials masked)', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    });

    test('Empty phone number keeps Login disabled', async ({ mazadWebsiteLoginPage }) => {
      await expectDisabledWithEmptyPhone(mazadWebsiteLoginPage);
    });

    test('Empty password keeps Login disabled', async ({ mazadWebsiteLoginPage }) => {
      await expectDisabledWithEmptyPassword(mazadWebsiteLoginPage);
    });

    test('Invalid credentials are rejected with a validation message', async ({
      page,
      mazadWebsiteLoginPage,
      t,
    }) => {
      await expectInvalidCredentialsRejected(page, mazadWebsiteLoginPage, t);
    });

    // Resets the account password and logs it out: account-changing, blocked unless approved.
    // Declares the test skipped while the operation is blocked (Playwright binds test.skip).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    (RESET_GATE ? test.skip : test)(
      'Successful login navigates to the home page, and logout returns to login',
      { annotation: blockedBy(RESET_GATE) },
      async ({ page, mazadWebsiteLoginPage, t, otpCode, dealerAccount }) => {
        await expectSuccessfulLoginAndLogout(
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

// Role-independent checks: no account, no submission. Runs in both language projects (en, ar).
test.describe(
  'Website login - guest',
  allureLabels({
    feature: 'Login',
    story: 'Field validation (guest)',
    severity: 'critical',
    platform: 'web',
  }),
  () => {
    test.beforeEach(async ({ mazadWebsiteLoginPage }) => {
      await mazadWebsiteLoginPage.goto();
    });

    test('Empty phone number and password keep Login disabled', async ({
      mazadWebsiteLoginPage,
    }) => {
      await expect(mazadWebsiteLoginPage.mobileNumberInput).toHaveValue('');
      await expect(mazadWebsiteLoginPage.passwordInput).toHaveValue('');
      await expect(mazadWebsiteLoginPage.loginButton).toBeDisabled();
    });

    // Unverified: the website's validation for a malformed phone number has not been recorded
    // yet (no inspection until the staging/network safety requirements are met).
    test.fixme('Invalid phone number format', () => {});
  },
);
