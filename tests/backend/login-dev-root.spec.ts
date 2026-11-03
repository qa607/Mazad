import { expect, test } from '@fixtures/test.fixture';
import { backendLoginData, backendLoginText, backendUrls } from '@test-data/backend-login.data';

// These tests enter real credentials, so they record no trace (it stores input values and
// action arguments), no video and no automatic screenshot. On failure, afterEach attaches a
// screenshot with credentials and account details masked. Playwright only allows these
// options per file, which is why these tests are not in login-validation.spec.ts.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Backend login - Dev Root account', () => {
  test.beforeEach(async ({ page, mazadLoginPage }) => {
    await mazadLoginPage.goto();
    await expect(page).toHaveURL(backendUrls.login);
  });

  test.afterEach(async ({ page, mazadLoginPage, mazadDashboardPage }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const screenshot = await page
      .screenshot({
        mask: [...mazadLoginPage.sensitiveAreas(), ...mazadDashboardPage.sensitiveAreas()],
      })
      .catch(() => null);
    if (screenshot) {
      await testInfo.attach('screenshot (credentials masked)', {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  });

  test('Dev Root logs in, sees the dashboard and logs out', async ({
    page,
    mazadLoginPage,
    mazadDashboardPage,
    devRoot,
  }) => {
    await mazadLoginPage.loginAs(devRoot);

    await expect(page).toHaveURL(backendUrls.dashboard);
    await expect(page).toHaveTitle(backendLoginText.dashboardTitle);
    await expect(mazadDashboardPage.pageHeading).toHaveText(backendLoginText.dashboardTitle);
    await expect(mazadDashboardPage.welcomeText).toHaveText(backendLoginText.devRootWelcome);
    await expect(mazadDashboardPage.sidebar).toBeVisible();
    await expect(mazadDashboardPage.homeLink).toBeVisible();
    await expect(mazadDashboardPage.userMenuToggle).toBeVisible();

    await mazadDashboardPage.logout();

    await expect(page).toHaveURL(backendUrls.login);
    await expect(mazadLoginPage.submitButton).toBeVisible();

    // The session has ended: the dashboard now sends the visitor back to the login page.
    await mazadDashboardPage.goto();
    await expect(page).toHaveURL(backendUrls.login);
  });

  test.describe('wrong password', () => {
    // Exactly one wrong attempt per execution, to avoid locking the account: the Backend
    // project runs each test once, with no retries (also in CI) and no --repeat-each repeats.
    test.describe.configure({ retries: 0 });

    test('Dev Root phone with a wrong password is rejected', async ({
      page,
      mazadLoginPage,
      devRoot,
    }, testInfo) => {
      // eslint-disable-next-line playwright/no-skipped-test -- conditional: lockout protection
      test.skip(testInfo.repeatEachIndex > 0, 'Only one wrong-password attempt per execution.');
      const submissions = mazadLoginPage.countSubmissions();

      await mazadLoginPage.enterAccountPhone(devRoot);
      await mazadLoginPage.enterPassword(backendLoginData.wrongPassword);
      await mazadLoginPage.submit();

      await expect(mazadLoginPage.passwordError).toHaveText(backendLoginText.invalidCredentials);
      await expect(page).toHaveURL(backendUrls.login);
      await expect(mazadLoginPage.passwordInput).toBeEmpty();
      expect(submissions()).toBe(1);
    });
  });
});
