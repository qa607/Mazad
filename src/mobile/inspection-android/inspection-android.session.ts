import { execFileSync } from 'node:child_process';
import { remote } from 'webdriverio';

/** The Inspection Android app (as installed on the test device). */
export const INSPECTION_ANDROID_APP = {
  package: process.env.INSPECTION_ANDROID_APP_PACKAGE || 'com.motary.inspection.android.staging',
  activity:
    process.env.INSPECTION_ANDROID_APP_ACTIVITY ||
    'com.motory.mazad.inspection.features.splash.presentation.SplashActivity',
} as const;

export type InspectionAndroidDriver = WebdriverIO.Browser;

/** Returns the active Android input method without exposing any app text or credentials. */
export function getSelectedAndroidInputMethod(): string {
  const adbArgs = process.env.ANDROID_UDID ? ['-s', process.env.ANDROID_UDID] : [];
  return execFileSync(
    'adb',
    [...adbArgs, 'shell', 'settings', 'get', 'secure', 'default_input_method'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

/**
 * Runs an Arabic-only entry action with Appium's Unicode IME, then restores the IME that was
 * selected before the action. Ordinary English entry and all other screens keep Samsung
 * Keyboard active. The session itself must not request unicodeKeyboard/resetKeyboard.
 */
export async function withArabicUnicodeIme<T>(action: () => Promise<T>): Promise<T> {
  const adbArgs = process.env.ANDROID_UDID ? ['-s', process.env.ANDROID_UDID] : [];
  const runAdb = (args: string[]) =>
    execFileSync('adb', [...adbArgs, 'shell', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const priorIme = getSelectedAndroidInputMethod();
  const arabicIme = 'io.appium.settings/.UnicodeIME';
  if (!priorIme || priorIme === 'null') {
    throw new Error('Could not determine the currently selected Android keyboard.');
  }
  if (priorIme === arabicIme) return action();

  try {
    runAdb(['ime', 'set', arabicIme]);
    return await action();
  } finally {
    runAdb(['ime', 'set', priorIme]);
  }
}

/**
 * Terminates and relaunches the app, so each test starts from the same known screen (signed-in
 * Home) regardless of which screen the previous test left open. noReset keeps the app's signed-in
 * session and data untouched; this only restarts the process.
 */
export async function restartInspectionAndroidApp(driver: InspectionAndroidDriver): Promise<void> {
  await driver.terminateApp(INSPECTION_ANDROID_APP.package);
  await driver.activateApp(INSPECTION_ANDROID_APP.package);
}

/**
 * Starts an Appium (UiAutomator2) session on the already-installed, already signed-in Inspection
 * Android app. noReset keeps the app's data (session, cache) untouched - nothing is reinstalled,
 * wiped, or signed out. See src/mobile/inspection-android/screens for why this app (Jetpack
 * Compose, almost no resource-ids or content-desc) needs different locator conventions from the
 * Mazad consumer app's session (src/mobile/android.session.ts).
 */
export async function startInspectionAndroidSession(
  appiumURL: string,
): Promise<InspectionAndroidDriver> {
  const url = new URL(appiumURL);
  return remote({
    protocol: url.protocol.replace(':', ''),
    hostname: url.hostname,
    port: Number(url.port || 4723),
    path: url.pathname === '/' ? '/' : url.pathname,
    logLevel: 'error',
    capabilities: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      ...(process.env.ANDROID_UDID ? { 'appium:udid': process.env.ANDROID_UDID } : {}),
      'appium:appPackage': INSPECTION_ANDROID_APP.package,
      'appium:appActivity': INSPECTION_ANDROID_APP.activity,
      'appium:noReset': true,
      'appium:forceAppLaunch': true,
      'appium:newCommandTimeout': 180,
      'appium:disableWindowAnimation': true,
      // Keep the device's selected keyboard (Samsung Keyboard) active. Do not enable
      // unicodeKeyboard/resetKeyboard at session scope: that switches the IME for every screen,
      // including password entry. Arabic text paths must use a field-specific input mechanism.
    },
  });
}
