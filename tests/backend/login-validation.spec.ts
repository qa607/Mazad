import { expect, test } from '@fixtures/test.fixture';
import { backendLoginData, backendLoginText, backendUrls } from '@test-data/backend-login.data';

// Runs in every language project. The Backend is English only, so the expected text is the
// same in both; the Arabic project checks the Backend behaves the same under an ar-SA browser.
test.describe('Backend login - form validation', () => {
  test.beforeEach(async ({ page, mazadLoginPage }) => {
    await mazadLoginPage.goto();
    await expect(page).toHaveURL(backendUrls.login);
  });

  test('Login page shows the login form in English', async ({ page, mazadLoginPage }) => {
    await expect(page).toHaveTitle(backendLoginText.loginPageTitle);
    await expect(mazadLoginPage.documentRoot).toHaveAttribute('lang', 'en');
    await expect(mazadLoginPage.phoneInput).toBeVisible();
    await expect(mazadLoginPage.passwordInput).toBeVisible();
    await expect(mazadLoginPage.passwordInput).toHaveAttribute('type', 'password');
    await expect(mazadLoginPage.submitButton).toBeEnabled();
  });

  test('Empty form shows both required messages and is not submitted', async ({
    page,
    mazadLoginPage,
  }) => {
    const submissions = mazadLoginPage.countSubmissions();

    await mazadLoginPage.submit();

    await expect(mazadLoginPage.phoneError).toHaveText(backendLoginText.phoneRequired);
    await expect(mazadLoginPage.passwordError).toHaveText(backendLoginText.passwordRequired);
    await expect(mazadLoginPage.phoneInput).toHaveClass(/is-invalid/);
    await expect(mazadLoginPage.passwordInput).toHaveClass(/is-invalid/);
    await expect(page).toHaveURL(backendUrls.login);
    expect(submissions()).toBe(0);
  });

  test('Phone only shows the password required message and is not submitted', async ({
    page,
    mazadLoginPage,
  }) => {
    const submissions = mazadLoginPage.countSubmissions();

    await mazadLoginPage.enterPhone(backendLoginData.unregisteredPhone);
    await mazadLoginPage.submit();

    await expect(mazadLoginPage.passwordError).toHaveText(backendLoginText.passwordRequired);
    await expect(mazadLoginPage.passwordInput).toHaveClass(/is-invalid/);
    await expect(mazadLoginPage.phoneError).toBeEmpty();
    await expect(page).toHaveURL(backendUrls.login);
    expect(submissions()).toBe(0);
  });

  test('Password only shows the phone required message and is not submitted', async ({
    page,
    mazadLoginPage,
  }) => {
    const submissions = mazadLoginPage.countSubmissions();

    await mazadLoginPage.enterPassword(backendLoginData.wrongPassword);
    await mazadLoginPage.submit();

    await expect(mazadLoginPage.phoneError).toHaveText(backendLoginText.phoneRequired);
    await expect(mazadLoginPage.phoneInput).toHaveClass(/is-invalid/);
    await expect(mazadLoginPage.passwordError).toBeEmpty();
    await expect(page).toHaveURL(backendUrls.login);
    expect(submissions()).toBe(0);
  });

  test('Unregistered phone is rejected with the invalid credentials message', async ({
    page,
    mazadLoginPage,
  }) => {
    const submissions = mazadLoginPage.countSubmissions();

    await mazadLoginPage.enterPhone(backendLoginData.unregisteredPhone);
    await mazadLoginPage.enterPassword(backendLoginData.wrongPassword);
    await mazadLoginPage.submit();

    await expect(mazadLoginPage.passwordError).toHaveText(backendLoginText.invalidCredentials);
    await expect(page).toHaveURL(backendUrls.login);
    await expect(mazadLoginPage.phoneInput).toHaveValue(backendLoginData.unregisteredPhone);
    await expect(mazadLoginPage.passwordInput).toBeEmpty();
    expect(submissions()).toBe(1);
  });
});
