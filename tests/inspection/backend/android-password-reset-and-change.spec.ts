import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { envConfig } from '@config/env.config';
import { INSPECTION_ANDROID_APP, startInspectionAndroidSession } from '@mobile/inspection-android/inspection-android.session';
import { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';
import { InspectorLoginScreen } from '@mobile/inspection-android/screens/inspector-login.screen';
import { expect, test } from '@fixtures/inspection.fixture';
import { inspectionUrls } from '@test-data/inspection/inspection-login.data';
import { userFormText } from '@test-data/inspection/user-form.data';
import { fillSecret } from '@utils/secret-input';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const ACCOUNT_ID = '5485';
const ACCOUNT_NAME = 'QA-AUTO INSPECTOR TEST';
const DEVICE_SERIAL = process.env.ANDROID_UDID || 'R5CY72XPL7V';
const SAMSUNG_IME = 'com.samsung.android.honeyboard/.service.HoneyBoardService';

function randomPassword(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

function defaultIme(): string {
  return execFileSync('adb', [
    '-s',
    DEVICE_SERIAL,
    'shell',
    'settings',
    'get',
    'secure',
    'default_input_method',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function tapHomeMenu(driver: import('webdriverio').Browser): Promise<void> {
  const { width, height } = await driver.getWindowSize();
  await driver
    .action('pointer')
    .move({ x: Math.round(width * 0.91), y: Math.round(height * 0.08) })
    .down()
    .pause(80)
    .up()
    .perform();
  await driver.pause(250);
}

async function signedOut(driver: import('webdriverio').Browser): Promise<boolean> {
  const xml = await driver.getPageSource();
  return xml.includes('text="Log in"') || xml.includes('text="تسجيل الدخول"');
}

test.describe('Inspection staging - one-time password recovery and Android change', { tag: ['@mutates'] }, () => {
  test.setTimeout(300_000);

  test('resets the dedicated staging credential once, changes it in Android, and verifies both logins', async ({
    page,
    inspectionLoginPage,
    inspectionAdmin,
    inspectionInspectorTest,
    inspectorFormPage,
  }) => {
    expect(envConfig.name).toBe('stg-224-inspection');
    expect(INSPECTION_ANDROID_APP.package).toBe('com.motary.inspection.android.staging');
    const model = execFileSync('adb', ['-s', DEVICE_SERIAL, 'shell', 'getprop', 'ro.product.model'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().replace(/_/g, '-');
    expect(model).toBe('SM-S938B');
    expect(defaultIme()).toBe(SAMSUNG_IME);

    const appiumStatus = await fetch(new URL('/status', envConfig.appiumURL));
    expect(appiumStatus.ok).toBe(true);
    const appiumBody = (await appiumStatus.json()) as { value?: { ready?: boolean } };
    expect(appiumBody.value?.ready).toBe(true);

    const driver = await startInspectionAndroidSession(envConfig.appiumURL);
    let resetHandoffPath = '';
    let finalHandoffPath = '';
    let androidPasswordSubmitAttempted = false;
    let androidPasswordChanged = false;
    try {
      const { width } = await driver.getWindowSize();
      expect(width).toBeGreaterThan(0);

      const resetPassword = (() => {
        let value = randomPassword();
        while (value === inspectionInspectorTest.pin) value = randomPassword();
        return value;
      })();
      const finalPassword = (() => {
        let value = randomPassword();
        while (value === resetPassword || value === inspectionInspectorTest.pin) {
          value = randomPassword();
        }
        return value;
      })();

      const handoffDir = '/private/tmp/mazad-final-password-handoff-20261115';
      await fs.mkdir(handoffDir, { recursive: true, mode: 0o700 });
      await fs.chmod(handoffDir, 0o700);
      const stamp = Date.now();
      resetHandoffPath = path.join(handoffDir, `inspector-backend-reset-${stamp}.txt`);
      await fs.writeFile(resetHandoffPath, `${resetPassword}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });

      // The account name is verified before the one authorized backend credential update.
      await inspectionLoginPage.goto();
      await inspectionLoginPage.loginAs(inspectionAdmin);
      await expect(page).toHaveURL(inspectionUrls.dashboard);
      await inspectorFormPage.gotoUpdate(ACCOUNT_ID);
      await expect(inspectorFormPage.fullNameEnInput).toHaveValue(ACCOUNT_NAME);
      await expect(inspectorFormPage.pinInput).toHaveValue('');
      await expect(inspectorFormPage.confirmPinInput).toHaveValue('');
      await fillSecret(inspectorFormPage.pinInput, resetPassword);
      await fillSecret(inspectorFormPage.confirmPinInput, resetPassword);
      await inspectorFormPage.saveAndWaitForUpdatePage();
      await expect(inspectorFormPage.successAlert).toContainText(userFormText.updatedMessage);

      // Ensure one and only one Android login attempt is made with the credential just saved.
      await driver.terminateApp(INSPECTION_ANDROID_APP.package);
      await driver.activateApp(INSPECTION_ANDROID_APP.package);
      const home = new InspectorHomeScreen(driver);
      const login = new InspectorLoginScreen(driver);
      if (!(await signedOut(driver))) {
        await home.waitUntilReady();
        await home.setLanguage('en');
        await tapHomeMenu(driver);
        await home.tapText('Log out');
        await login.waitUntilReady();
      } else {
        const source = await driver.getPageSource();
        if (source.includes('text="تسجيل الدخول"')) {
          await login.englishOption.waitForDisplayed({ timeout: 5_000 });
          await home.tapElement(login.englishOption);
        }
        await login.waitUntilReady();
      }
      await login.login(inspectionInspectorTest.mobileNumber, resetPassword);
      await home.waitUntilReady(20_000);

      // Change the password through Android. The actual screen exposes Current/New only;
      // there is no separate confirmation field.
      await home.setLanguage('en');
      await tapHomeMenu(driver);
      await home.tapText('Change password');
      const passwordFields = await driver.$$('android=new UiSelector().className("android.widget.EditText")');
      expect(await passwordFields.length).toBe(2);
      const typeField = async (index: number, value: string) => {
        const field = passwordFields[index];
        await field.click();
        expect(await home.typeSecretReliably(field, value, {
          isMatch: (shown, secret) => shown.length === secret.length,
        })).toBe(true);
        await home.hideKeyboardIfShown();
      };
      await typeField(0, resetPassword);
      await typeField(1, finalPassword);

      finalHandoffPath = path.join(handoffDir, `inspector-android-active-candidate-${stamp}.txt`);
      await fs.writeFile(finalHandoffPath, `${finalPassword}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      androidPasswordSubmitAttempted = true;
      await home.tapText('Change Password');

      const successDeadline = Date.now() + 8_000;
      let afterChange = '';
      let successVisible = false;
      while (Date.now() < successDeadline) {
        afterChange = await driver.getPageSource();
        successVisible = /password.{0,30}(changed|success)|(?:changed|success).{0,30}password|تم.{0,40}كلمة المرور/i.test(afterChange);
        const reachedHome = afterChange.includes('text="In Progress"') || afterChange.includes('text="قيد الفحص"');
        if (successVisible || reachedHome) break;
        await driver.pause(250);
      }
      const reachedHome = afterChange.includes('text="In Progress"') || afterChange.includes('text="قيد الفحص"');
      expect(successVisible || reachedHome).toBe(true);
      androidPasswordChanged = true;

      // New password login must succeed before the one old-password rejection attempt.
      if (reachedHome) {
        await tapHomeMenu(driver);
        await home.tapText('Log out');
        await login.waitUntilReady();
      } else {
        await home.waitUntilReady(20_000);
        await tapHomeMenu(driver);
        await home.tapText('Log out');
        await login.waitUntilReady();
      }
      await login.login(inspectionInspectorTest.mobileNumber, finalPassword);
      await home.waitUntilReady(20_000);

      // Log out and try the immediately previous credential exactly once.
      await tapHomeMenu(driver);
      await home.tapText('Log out');
      await login.waitUntilReady();
      await login.login(inspectionInspectorTest.mobileNumber, resetPassword);
      await driver.pause(1_000);
      const afterOldAttempt = await driver.getPageSource();
      expect(await signedOut(driver)).toBe(true);
      expect(/incorrect|wrong|invalid|غير صحيح|خطأ/i.test(afterOldAttempt)).toBe(true);

      expect(defaultIme()).toBe(SAMSUNG_IME);
      // This new reset credential is now confirmed rejected; remove only this one-time file.
      await fs.unlink(resetHandoffPath);
      resetHandoffPath = '';
      // Keep the mode-0600 final password handoff for the account owner; its value is never logged.
    } finally {
      await driver.deleteSession().catch(() => undefined);
      // Keep a reset handoff if the backend update succeeded but Android could not verify it.
      if (!androidPasswordSubmitAttempted && finalHandoffPath) {
        await fs.unlink(finalHandoffPath).catch(() => undefined);
      }
    }
  });
});
