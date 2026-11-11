import type { AndroidDriver } from '@mobile/android.session';
import { restartApp } from '@mobile/android.session';
import type { AppShellScreen } from '@mobile/screens/app-shell.screen';
import type { EnvironmentScreen } from '@mobile/screens/environment.screen';

/** Same backend: compares origins, so a trailing slash or letter case does not matter. */
const sameOrigin = (a: string, b: string) => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

/**
 * Points the Android app at the selected environment and VERIFIES it, before any test. Reads the
 * app's own backend setting (hidden menu, long press on More); when it is not `origin`, applies
 * `origin` and reads it again. Throws (so every test fails, no test runs against another
 * environment) when the setting still differs. `origin` must be the approved staging origin
 * (config/staging-environments.ts); production is refused there before this is ever called.
 *
 * Returns the setting found first, for the run's record. The 8.2.2-stage build defaults to
 * mazad-v3.motory.dev, which resolves to the same internal IP as stg-154 but is another
 * environment, so neither DNS nor the open connections can show the difference: only this can.
 */
export async function ensureAppBackend(
  driver: AndroidDriver,
  screens: { appShell: AppShellScreen; environment: EnvironmentScreen },
  origin: string,
): Promise<{ before: string; after: string }> {
  const { appShell, environment } = screens;
  const target = `${new URL(origin).origin}/`;
  const openSetting = async () => {
    await restartApp(driver);
    await appShell.waitUntilReady();
    await appShell.dismissAnnouncement();
    await environment.open();
  };

  await openSetting();
  const before = await environment.currentUrl();
  if (sameOrigin(before, target)) {
    await environment.close();
    return { before, after: before };
  }

  await environment.apply(target);
  await openSetting();
  const after = await environment.currentUrl();
  await environment.close();
  if (!sameOrigin(after, target)) {
    throw new Error(
      `Android backend: the app uses "${after}" after switching to ${target}. No test may run against another environment.`,
    );
  }
  return { before, after };
}
