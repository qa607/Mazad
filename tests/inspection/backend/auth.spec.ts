import { expect, test } from '@fixtures/inspection.fixture';
import {
  inspectionLoginData,
  inspectionLoginText,
  inspectionUrls,
} from '@test-data/inspection/inspection-login.data';

/**
 * Mazad Inspection backend authentication (stg-224-inspection, /site/login). A mobile number +
 * 4-digit PIN form, not the main Backend's phone+password — see InspectionLoginPage. Every test
 * signs in fresh (no saved session yet: that is added once a milestone needs one, to reuse a
 * session the way tests/backend/auth.setup.ts does for the main Backend).
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Inspection Backend - Admin authentication', { tag: ['@regression'] }, () => {
  test(
    'Admin signs in and reaches the Dashboard',
    { tag: ['@smoke', '@functional'] },
    async ({ page, inspectionLoginPage, inspectionDashboardPage, inspectionAdmin }) => {
      await inspectionLoginPage.goto();
      await inspectionLoginPage.loginAs(inspectionAdmin);

      await expect(page).toHaveURL(inspectionUrls.dashboard);
      await expect(page).toHaveTitle(inspectionLoginText.dashboardTitle);
      await inspectionDashboardPage.openUserMenu();
      await expect(inspectionDashboardPage.accountDetails).toContainText('Super Admin');
    },
  );

  test(
    'Admin can log out, returning to the login page',
    { tag: ['@functional'] },
    async ({ page, inspectionLoginPage, inspectionDashboardPage, inspectionAdmin }) => {
      await inspectionLoginPage.goto();
      await inspectionLoginPage.loginAs(inspectionAdmin);
      await expect(page).toHaveURL(inspectionUrls.dashboard);

      await inspectionDashboardPage.logout();

      await expect(page).toHaveURL(inspectionUrls.login);
    },
  );

  test(
    'Empty mobile number and PIN keep the form on the login page (client-side validation)',
    { tag: ['@negative'] },
    async ({ page, inspectionLoginPage }) => {
      await inspectionLoginPage.goto();
      const submissions = inspectionLoginPage.countSubmissions();

      await inspectionLoginPage.submit();

      await expect(inspectionLoginPage.mobileNumberError).toHaveText(
        inspectionLoginText.mobileNumberRequired,
      );
      await expect(inspectionLoginPage.pinError).toHaveText(inspectionLoginText.pinRequired);
      expect(submissions(), 'nothing was sent to the server').toBe(0);
      await expect(page).toHaveURL(inspectionUrls.login);
    },
  );

  test(
    'A well-formed but wrong PIN is refused with the server error, never signed in',
    { tag: ['@negative'] },
    async ({ page, inspectionLoginPage, inspectionAdmin }) => {
      await inspectionLoginPage.goto();

      await inspectionLoginPage.enterAccountMobileNumber(inspectionAdmin);
      await inspectionLoginPage.enterPin(inspectionLoginData.wrongPin);
      await inspectionLoginPage.submit();

      await expect(inspectionLoginPage.pinError).toHaveText(
        inspectionLoginText.incorrectCredentials,
      );
      await expect(page).toHaveURL(inspectionUrls.login);
    },
  );
});
