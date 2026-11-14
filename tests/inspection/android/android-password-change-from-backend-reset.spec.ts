import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getInspectionInspectorTestAccount } from '@config/credentials.config';
import { expect, test } from '@fixtures/inspection-android.fixture';
import {
  getSelectedAndroidInputMethod,
  INSPECTION_ANDROID_APP,
  restartInspectionAndroidApp,
  startInspectionAndroidSession,
} from '@mobile/inspection-android/inspection-android.session';
import { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';
import { InspectorLoginScreen } from '@mobile/inspection-android/screens/inspector-login.screen';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const HANDOFF_DIR = '/private/tmp/mazad-final-password-handoff-20261115';
const SAMSUNG_IME = 'com.samsung.android.honeyboard/.service.HoneyBoardService';

function randomPassword(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

async function isHome(driver: import('webdriverio').Browser): Promise<boolean> {
  const xml = await driver.getPageSource();
  return xml.includes('text="In Progress"') || xml.includes('text="قيد الفحص"');
}

async function loginScreenIsVisible(driver: import('webdriverio').Browser): Promise<boolean> {
  const xml = await driver.getPageSource();
  return xml.includes('text="Log in"') || xml.includes('text="تسجيل الدخول"');
}

async function selectEnglishOnLogin(
  driver: import('webdriverio').Browser,
  login: InspectorLoginScreen,
  home: InspectorHomeScreen,
): Promise<void> {
  const xml = await driver.getPageSource();
  if (xml.includes('text="تسجيل الدخول"')) {
    await login.englishOption.waitForDisplayed({ timeout: 5_000 });
    await home.tapElement(login.englishOption);
  }
  await login.waitUntilReady(10_000);
}

async function openMenu(driver: import('webdriverio').Browser): Promise<void> {
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

async function logOutIfHome(
  driver: import('webdriverio').Browser,
  home: InspectorHomeScreen,
  login: InspectorLoginScreen,
): Promise<void> {
  if (await loginScreenIsVisible(driver)) {
    await selectEnglishOnLogin(driver, login, home);
    return;
  }
  if (!(await isHome(driver))) {
    await driver.waitUntil(async () => (await isHome(driver)) || (await loginScreenIsVisible(driver)), {
      timeout: 20_000,
      timeoutMsg: 'The app did not reach Home or Login; no credential was attempted.',
    });
    if (await loginScreenIsVisible(driver)) {
      await selectEnglishOnLogin(driver, login, home);
      return;
    }
  }
  await home.waitUntilReady(15_000);
  await home.setLanguage('en');
  await openMenu(driver);
  await home.tapText('Log out');
  await selectEnglishOnLogin(driver, login, home);
}

test('uses the one backend-reset password for Android Change Password and both auth checks', async ({
  inspectionAndroidDriver,
}) => {
  test.skip(!inspectionAndroidDriver, 'Appium session unavailable.');
  const account = getInspectionInspectorTestAccount();
  test.skip(!account, 'Dedicated staging Inspector account is not configured.');

  const resetFiles = (await fs.readdir(HANDOFF_DIR)).filter((name) =>
    /^inspector-backend-reset-\d+\.txt$/.test(name),
  );
  expect(resetFiles).toHaveLength(1);
  const resetPath = path.join(HANDOFF_DIR, resetFiles[0]);
  const resetPassword = (await fs.readFile(resetPath, 'utf8')).trim();
  expect(resetPassword).toMatch(/^\d{6}$/);

  const finalPassword = (() => {
    let value = randomPassword();
    while (value === resetPassword || value === account!.pin) value = randomPassword();
    return value;
  })();
  const finalPath = path.join(HANDOFF_DIR, `inspector-android-active-${Date.now()}.txt`);

  const driver = inspectionAndroidDriver!;
  expect(INSPECTION_ANDROID_APP.package).toBe('com.motary.inspection.android.staging');
  expect(getSelectedAndroidInputMethod()).toBe(SAMSUNG_IME);
  await restartInspectionAndroidApp(driver);
  const home = new InspectorHomeScreen(driver);
  const login = new InspectorLoginScreen(driver);
  let passwordSubmitAttempted = false;
  let passwordChangeConfirmed = false;

  try {
    await logOutIfHome(driver, home, login);

    // Exactly one login attempt with the password just saved through the Inspection Backend.
    await login.login(account!.mobileNumber, resetPassword);
    await home.waitUntilReady(20_000);

    await home.setLanguage('en');
    await openMenu(driver);
    await home.tapText('Change password');
    const fields = await driver.$$('android=new UiSelector().className("android.widget.EditText")');
    expect(await fields.length).toBe(2);
    const enter = async (index: number, value: string) => {
      const field = fields[index];
      expect(
        await home.typeSecretReliably(field, value, {
          isMatch: (shown, secret) => shown.length === secret.length,
        }),
      ).toBe(true);
      await home.hideKeyboardIfShown();
    };
    await enter(0, resetPassword);
    await enter(1, finalPassword);

    await fs.chmod(HANDOFF_DIR, 0o700);
    await fs.writeFile(finalPath, `${finalPassword}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    passwordSubmitAttempted = true;
    await home.tapText('Change Password');

    const deadline = Date.now() + 8_000;
    let afterChange = '';
    let successMessageSeen = false;
    while (Date.now() < deadline) {
      afterChange = await driver.getPageSource();
      successMessageSeen = /password.{0,30}(changed|success)|(?:changed|success).{0,30}password|تم.{0,40}كلمة المرور/i.test(afterChange);
      if (successMessageSeen || (await isHome(driver)) || (await loginScreenIsVisible(driver))) break;
      await driver.pause(250);
    }
    passwordChangeConfirmed = successMessageSeen || (await isHome(driver)) || (await loginScreenIsVisible(driver));
    expect(passwordChangeConfirmed).toBe(true);

    // New password login succeeds before one old-password rejection attempt.
    await logOutIfHome(driver, home, login);
    await login.login(account!.mobileNumber, finalPassword);
    await home.waitUntilReady(20_000);

    await openMenu(driver);
    await home.tapText('Log out');
    await selectEnglishOnLogin(driver, login, home);
    await login.login(account!.mobileNumber, resetPassword);
    await driver.pause(1_000);
    const oldAttemptSource = await driver.getPageSource();
    expect(await loginScreenIsVisible(driver)).toBe(true);
    expect(/incorrect|wrong|invalid|غير صحيح|خطأ/i.test(oldAttemptSource)).toBe(true);
    expect(getSelectedAndroidInputMethod()).toBe(SAMSUNG_IME);

    // The reset password is now confirmed rejected; keep only the active password handoff.
    await fs.unlink(resetPath);
  } finally {
    await driver.deleteSession().catch(() => undefined);
    if (!passwordSubmitAttempted) await fs.unlink(finalPath).catch(() => undefined);
    // If a submission happened but verification stopped early, retain both secure handoffs so
    // the account owner has a recovery path without another backend update.
  }
});

test('read-only inspect the app state after the one logout navigation', async ({
  inspectionAndroidDriver,
}) => {
  test.skip(!inspectionAndroidDriver, 'Appium session unavailable.');
  const driver = inspectionAndroidDriver!;
  await restartInspectionAndroidApp(driver);
  const xml = await driver.getPageSource();
  const labels = [...xml.matchAll(/text="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) =>
      /^(?:Log in|تسجيل الدخول|Log out|تسجيل الخروج|In Progress|قيد الفحص|Completed|مكتملة|Not Sent|غير مرسلة|Change password|تغيير كلمة المرور|Confirm|Cancel|Yes|No|English|العربية|Password|Current Password \*|New Password \*)$/.test(
        value,
      ),
    );
  console.log(
    `Read-only UI markers: ${JSON.stringify({
      loginEnglish: xml.includes('text="Log in"'),
      loginArabic: xml.includes('text="تسجيل الدخول"'),
      homeEnglish: xml.includes('text="In Progress"'),
      homeArabic: xml.includes('text="قيد الفحص"'),
      labels: [...new Set(labels)],
    })}`,
  );
});
