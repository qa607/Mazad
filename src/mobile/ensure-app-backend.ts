import { withDeviceRequestsFailing } from '@mobile/android-proxy';
import type { AndroidDriver } from '@mobile/android.session';
import { restartApp } from '@mobile/android.session';
import type { AppShellScreen } from '@mobile/screens/app-shell.screen';
import type { EnvironmentScreen } from '@mobile/screens/environment.screen';

interface BackendScreens {
  appShell: AppShellScreen;
  environment: EnvironmentScreen;
}

/** Same backend: compares origins, so a trailing slash or letter case does not matter. */
const sameOrigin = (a: string, b: string) => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

/**
 * Applies `target` when the backend the app uses forces an update: every reply then carries
 * update_available 2, and the update dialog covers every screen (the backend setting too) and
 * cannot be closed. Seen 2026-11-15: a run with an outdated config had set the app to stg-224,
 * which forces an update on 8.2.2-stage. Every request is made to fail meanwhile, so no reply
 * can open the dialog; the app only shows its "technical error" dialog, which closes.
 * Returns the backend the app used before.
 */
async function switchBehindUpdateDialog(
  driver: AndroidDriver,
  { appShell, environment }: BackendScreens,
  target: string,
): Promise<string> {
  return withDeviceRequestsFailing(async () => {
    await restartApp(driver);
    await appShell.closeErrorDialog();
    await environment.open();
    const current = await environment.currentUrl();
    if (sameOrigin(current, target)) {
      await environment.close();
      throw new Error(
        `Android backend: the app already uses ${target}, and the update dialog from that backend covers every screen. Check App Versions there: an Active row is newer than the installed build.`,
      );
    }
    await environment.apply(target);
    return current;
  });
}

/**
 * Points the Android app at the selected environment and VERIFIES it, before any test. Reads the
 * app's own backend setting (hidden menu, long press on More); when it is not `origin`, applies
 * `origin` and reads it again. Throws (so every test fails, no test runs against another
 * environment) when the setting still differs. `origin` must be the approved staging origin
 * (config/staging-environments.ts); production is refused there before this is ever called.
 * When the app's current backend keeps an update dialog over every screen, the switch is made
 * with the device's requests failing (switchBehindUpdateDialog), then verified the same way.
 *
 * Returns the setting found first, for the run's record. The 8.2.2-stage build defaults to
 * mazad-v3.motory.dev, which resolves to the same internal IP as stg-154 but is another
 * environment, so neither DNS nor the open connections can show the difference: only this can.
 */
export async function ensureAppBackend(
  driver: AndroidDriver,
  screens: BackendScreens,
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

  let before: string;
  try {
    await openSetting();
    before = await environment.currentUrl();
    if (sameOrigin(before, target)) {
      await environment.close();
      return { before, after: before };
    }
    await environment.apply(target);
  } catch (error) {
    if (!(await appShell.isUpdateDialogShown().catch(() => false))) throw error;
    before = await switchBehindUpdateDialog(driver, screens, target);
  }

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
