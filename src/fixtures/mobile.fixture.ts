import {
  type BackendAccount,
  BUYER_MISSING_REASON,
  getBuyerAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
// Extends the website fixture (not test.fixture directly) to reuse its backend account
// discovery (individualAccount/dealerAccount) and OTP configuration (otpCode) for Android too,
// instead of duplicating that lookup — the back office and the OTP are shared across platforms.
import { test as base } from '@fixtures/website.fixture';
import { type AndroidDriver, startAndroidSession } from '@mobile/android.session';
import { androidBuildBackendProblem } from '@mobile/android-backend-check';
import { androidNetworkProblem } from '@mobile/network-preflight';
import { MazadAccountScreen } from '@mobile/screens/account.screen';
import { AppShellScreen } from '@mobile/screens/app-shell.screen';
import { ContactFormScreen } from '@mobile/screens/contact-form.screen';
import { HelpCenterScreen } from '@mobile/screens/help-center.screen';
import { MazadLoginScreen } from '@mobile/screens/login.screen';
import { MyActionsScreen } from '@mobile/screens/my-actions.screen';
import { MyBidsScreen } from '@mobile/screens/my-bids.screen';
import { NotificationsScreen } from '@mobile/screens/notifications.screen';

interface MobileWorkerFixtures {
  /** Why the device cannot reach the environment through the VPN (tests skipped), if it cannot. */
  androidNetworkProblem: string | undefined;
  /**
   * Why the installed build must not be used: its compiled-in backend is not the selected
   * environment (src/mobile/android-backend-check.ts). Tests FAIL with it; no session is started.
   */
  androidBackendProblem: string | undefined;
  /** One Appium session per worker; null (and tests skipped) when Appium is not reachable. */
  androidDriver: AndroidDriver | null;
}

interface MobileFixtures {
  driver: AndroidDriver;
  appShell: AppShellScreen;
  myBidsScreen: MyBidsScreen;
  myActionsScreen: MyActionsScreen;
  notificationsScreen: NotificationsScreen;
  loginScreen: MazadLoginScreen;
  accountScreen: MazadAccountScreen;
  helpCenterScreen: HelpCenterScreen;
  contactFormScreen: ContactFormScreen;
  /** Mazad buyer account from .env. Tests using it are skipped when it is not set. */
  buyer: BackendAccount;
}

async function appiumReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL('/status', url), { signal: AbortSignal.timeout(5_000) });
    const body = (await response.json()) as { value?: { ready?: boolean } };
    return response.ok && body.value?.ready === true;
  } catch {
    return false;
  }
}

export const test = base.extend<MobileFixtures, MobileWorkerFixtures>({
  androidNetworkProblem: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(await androidNetworkProblem(new URL(envConfig.baseURL).hostname));
    },
    { scope: 'worker' },
  ],
  androidBackendProblem: [
    async ({ androidNetworkProblem }, use) => {
      // Only meaningful once the device can reach the environment at all.
      await use(
        androidNetworkProblem
          ? undefined
          : await androidBuildBackendProblem(new URL(envConfig.baseURL).hostname),
      );
    },
    { scope: 'worker', timeout: 180_000 },
  ],
  androidDriver: [
    async ({ androidNetworkProblem, androidBackendProblem }, use) => {
      // No session (and no app launch) when the device would hit the wrong endpoint, or the
      // installed build talks to another environment.
      if (
        androidNetworkProblem ||
        androidBackendProblem ||
        !(await appiumReady(envConfig.appiumURL))
      ) {
        await use(null);
        return;
      }
      const driver = await startAndroidSession(envConfig.appiumURL);
      await use(driver);
      await driver.deleteSession().catch(() => undefined);
    },
    { scope: 'worker', timeout: 180_000 },
  ],
  driver: async (
    { androidDriver, androidNetworkProblem, androidBackendProblem },
    use,
    testInfo,
  ) => {
    testInfo.skip(Boolean(androidNetworkProblem), androidNetworkProblem);
    // A wrong backend fails (not skips): results against another environment cannot be trusted.
    if (androidBackendProblem) throw new Error(androidBackendProblem);
    testInfo.skip(
      !androidDriver,
      `Environment: Appium is not reachable at ${envConfig.appiumURL} (set APPIUM_URL, start Appium and the device).`,
    );
    if (!androidDriver) return; // Not reached: skip() ends the test.
    await use(androidDriver);
  },
  appShell: async ({ driver }, use) => {
    await use(new AppShellScreen(driver));
  },
  myBidsScreen: async ({ driver }, use) => {
    await use(new MyBidsScreen(driver));
  },
  myActionsScreen: async ({ driver }, use) => {
    await use(new MyActionsScreen(driver));
  },
  notificationsScreen: async ({ driver }, use) => {
    await use(new NotificationsScreen(driver));
  },
  loginScreen: async ({ driver }, use) => {
    await use(new MazadLoginScreen(driver));
  },
  accountScreen: async ({ driver }, use) => {
    await use(new MazadAccountScreen(driver));
  },
  helpCenterScreen: async ({ driver }, use) => {
    await use(new HelpCenterScreen(driver));
  },
  contactFormScreen: async ({ driver }, use) => {
    await use(new ContactFormScreen(driver));
  },
  // eslint-disable-next-line no-empty-pattern
  buyer: async ({}, use, testInfo) => {
    const account = getBuyerAccount();
    testInfo.skip(!account, BUYER_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
});

export { expect } from '@fixtures/website.fixture';
