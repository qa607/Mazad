import { restartIosApp } from '../support/ios/ios-session-helpers';
import { findIosLayoutIssues, parseIosSource } from '../support/ios/ios-layout';
import { appAreaScreenshot, frameOf } from '../support/ios/ios-shot';
import {
  addIosFindings,
  expect,
  IOS_HOME_TABS,
  IOS_LANGUAGE_OPTIONS,
  IOS_MORE_TABS,
  IOS_STATIC_PROBLEM,
  test,
} from '../support/ios/ios-ui-fixtures';
import { expectImageShot } from '../support/visual-assert';

/**
 * iOS Login and Forgot Password: display, layout, keyboard and navigation only (guest).
 * Nothing is submitted. Skipped until the iOS safety gates pass. Keyboard screenshots are
 * attached for review only (the keyboard's suggestion bar varies), never compared.
 */
test.skip(Boolean(IOS_STATIC_PROBLEM), IOS_STATIC_PROBLEM);

test.describe('iOS login and forgot password (UI)', () => {
  test.beforeEach(async ({ driver, iosConfig, appShell, loginScreen, text, language }) => {
    await restartIosApp(driver, iosConfig);
    await appShell.setLanguage(language, IOS_LANGUAGE_OPTIONS, IOS_MORE_TABS, IOS_HOME_TABS);
    // Never signs out automatically: fails with a clear message unless the app is a guest.
    await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
    await loginScreen.openLoginForm(text.guestPrompt, text.entryChoiceLogin);
    await loginScreen.phoneInput.waitForDisplayed({ timeout: 15_000 });
  });

  test('login screen', async ({ driver, browser, loginScreen, language, findings }) => {
    expect(await (await loginScreen.loginButton()).isEnabled()).toBe(false);
    expectImageShot(await appAreaScreenshot(driver, browser), 'ios-login.png');
    const issues = findIosLayoutIssues(parseIosSource(await driver.getPageSource()), { language });
    addIosFindings(findings, 'ios-login', issues, 'ios-login.png');
  });

  test('login screen with the keyboard open', async ({
    driver,
    browser,
    loginScreen,
    language,
    findings,
  }, testInfo) => {
    await loginScreen.phoneInput.click();
    await driver.waitUntil(() => driver.isKeyboardShown(), { timeout: 10_000 });
    const issues = findIosLayoutIssues(parseIosSource(await driver.getPageSource()), {
      language,
      focusedField: await frameOf(loginScreen.phoneInput, 'TextField'),
      primaryButton: await frameOf(await loginScreen.loginButton(), 'Button'),
    });
    await testInfo.attach('ios-login-keyboard.png (review only)', {
      body: await appAreaScreenshot(driver, browser),
      contentType: 'image/png',
    });
    addIosFindings(findings, 'ios-login-keyboard', issues, 'ios-login-keyboard.png (review only)');
    await loginScreen.hideKeyboard();
    expect(await driver.isKeyboardShown()).toBe(false);
  });

  test('forgot password screen, and back to login', async ({
    driver,
    browser,
    loginScreen,
    forgotPasswordScreen,
    text,
    language,
    findings,
  }) => {
    await loginScreen.openForgotPassword(text.forgotPassword);
    await forgotPasswordScreen
      .heading(text.resetPasswordHeading)
      .waitForDisplayed({ timeout: 15_000 });
    expect(await (await forgotPasswordScreen.sendButton()).isEnabled()).toBe(false);
    expectImageShot(await appAreaScreenshot(driver, browser), 'ios-forgot-password.png');
    const issues = findIosLayoutIssues(parseIosSource(await driver.getPageSource()), { language });
    addIosFindings(findings, 'ios-forgot-password', issues, 'ios-forgot-password.png');
    await (await forgotPasswordScreen.onlyCloseButton()).click();
    await loginScreen.passwordInput.waitForDisplayed({ timeout: 10_000 });
  });

  test('forgot password screen with the keyboard open', async ({
    driver,
    browser,
    loginScreen,
    forgotPasswordScreen,
    text,
    language,
    findings,
  }, testInfo) => {
    await loginScreen.openForgotPassword(text.forgotPassword);
    await forgotPasswordScreen.phoneInput.click();
    await driver.waitUntil(() => driver.isKeyboardShown(), { timeout: 10_000 });
    const issues = findIosLayoutIssues(parseIosSource(await driver.getPageSource()), {
      language,
      focusedField: await frameOf(forgotPasswordScreen.phoneInput, 'TextField'),
      primaryButton: await frameOf(await forgotPasswordScreen.sendButton(), 'Button'),
    });
    await testInfo.attach('ios-forgot-password-keyboard.png (review only)', {
      body: await appAreaScreenshot(driver, browser),
      contentType: 'image/png',
    });
    addIosFindings(findings, 'ios-forgot-password-keyboard', issues, 'review only');
    await forgotPasswordScreen.hideKeyboard();
    expect(await driver.isKeyboardShown()).toBe(false);
  });

  test.fixme('password visibility', () => {
    // Typing the dummy password on iOS is not approved yet (approved for web only).
  });

  test.fixme('OTP and new password screens', () => {
    // Reaching them requests an OTP (account action); needs separate approval.
  });
});
