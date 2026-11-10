import { remote } from 'webdriverio';

/** The Mazad staging Android app (as installed on the test device). */
export const MAZAD_ANDROID_APP = {
  package: process.env.ANDROID_APP_PACKAGE || 'com.app.motory.dealer.staging',
  activity:
    process.env.ANDROID_APP_ACTIVITY ||
    'com.app.motory.mazad.features.splash.presentation.SplashActivityAliasDefault',
} as const;

export type AndroidDriver = WebdriverIO.Browser;

/**
 * Terminates and relaunches the app, so each test starts from the same known screen (the main
 * tab bar on Home) regardless of which screen the previous test left open — login and forgot
 * password navigate through several non-tab screens with no single reliable "go back" action.
 * This only restarts the process; noReset means app data (and any one-time dialog the user has
 * already dismissed) is untouched, so a one-time gate does not reappear because of this restart.
 */
export async function restartApp(driver: AndroidDriver): Promise<void> {
  await driver.terminateApp(MAZAD_ANDROID_APP.package);
  await driver.activateApp(MAZAD_ANDROID_APP.package);
}

/**
 * Starts an Appium (UiAutomator2) session on the already-installed app. noReset keeps the
 * app's data, so nothing is reinstalled or wiped; the app is restarted for a clean screen.
 */
export async function startAndroidSession(appiumURL: string): Promise<AndroidDriver> {
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
      'appium:appPackage': MAZAD_ANDROID_APP.package,
      'appium:appActivity': MAZAD_ANDROID_APP.activity,
      'appium:noReset': true,
      'appium:forceAppLaunch': true,
      'appium:newCommandTimeout': 180,
      'appium:disableWindowAnimation': true,
    },
  });
}
