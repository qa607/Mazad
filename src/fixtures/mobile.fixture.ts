import {
  ANDROID_TEST_INDIVIDUAL_MISSING_REASON,
  type BackendAccount,
  BUYER_MISSING_REASON,
  getAndroidTestIndividual,
  getBuyerAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { approvedOrigin } from '@config/staging-environments';
// Extends the website fixture (not test.fixture directly) to reuse its backend account
// discovery (individualAccount/dealerAccount) and OTP configuration (otpCode) for Android too,
// instead of duplicating that lookup — the back office and the OTP are shared across platforms.
import { test as base } from '@fixtures/website.fixture';
import { type AndroidDriver, startAndroidSession } from '@mobile/android.session';
import { ensureAppBackend } from '@mobile/ensure-app-backend';
import { androidNetworkProblem } from '@mobile/network-preflight';
import { MazadAccountScreen } from '@mobile/screens/account.screen';
import { AppShellScreen } from '@mobile/screens/app-shell.screen';
import { ContactFormScreen } from '@mobile/screens/contact-form.screen';
import { EnvironmentScreen } from '@mobile/screens/environment.screen';
import { FavouritesScreen } from '@mobile/screens/favourites.screen';
import { HelpCenterScreen } from '@mobile/screens/help-center.screen';
import { HomeScreen } from '@mobile/screens/home.screen';
import { MazadLoginScreen } from '@mobile/screens/login.screen';
import { MoreScreen } from '@mobile/screens/more.screen';
import { MyActionsScreen } from '@mobile/screens/my-actions.screen';
import { MyBidsScreen } from '@mobile/screens/my-bids.screen';
import { NotificationsScreen } from '@mobile/screens/notifications.screen';
import { MazadRegistrationScreen } from '@mobile/screens/registration.screen';
import { StaticPageScreen } from '@mobile/screens/static-page.screen';

interface MobileWorkerFixtures {
  /** Why the device cannot reach the environment through the VPN (tests skipped), if it cannot. */
  androidNetworkProblem: string | undefined;
  /**
   * One Appium session per worker; null (and tests skipped) when Appium is not reachable. The app
   * is pointed at the selected environment and verified before any test (ensureAppBackend); when
   * that fails, the fixture fails and so does every test of the worker.
   */
  androidDriver: AndroidDriver | null;
}

interface MobileFixtures {
  driver: AndroidDriver;
  appShell: AppShellScreen;
  homeScreen: HomeScreen;
  favouritesScreen: FavouritesScreen;
  myBidsScreen: MyBidsScreen;
  myActionsScreen: MyActionsScreen;
  notificationsScreen: NotificationsScreen;
  loginScreen: MazadLoginScreen;
  registrationScreen: MazadRegistrationScreen;
  accountScreen: MazadAccountScreen;
  helpCenterScreen: HelpCenterScreen;
  contactFormScreen: ContactFormScreen;
  moreScreen: MoreScreen;
  staticPageScreen: StaticPageScreen;
  /** Mazad buyer account from .env. Tests using it are skipped when it is not set. */
  buyer: BackendAccount;
  /**
   * The Android Individual test account from .env (ANDROID_TEST_INDIVIDUAL_*; redacted when
   * printed). Tests using it are skipped when it is not set.
   */
  androidIndividual: BackendAccount;
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
  androidDriver: [
    async ({ androidNetworkProblem }, use) => {
      // No session (and no app launch) when the device would hit the wrong endpoint.
      if (androidNetworkProblem || !(await appiumReady(envConfig.appiumURL))) {
        await use(null);
        return;
      }
      const driver = await startAndroidSession(envConfig.appiumURL);
      // The app keeps its own backend setting (default: mazad-v3.motory.dev, another environment):
      // set it to the approved origin and read it back before any test, or fail them all.
      try {
        const backend = await ensureAppBackend(
          driver,
          { appShell: new AppShellScreen(driver), environment: new EnvironmentScreen(driver) },
          approvedOrigin(envConfig.name),
        );
        console.log(`Android app backend: ${backend.before} -> ${backend.after}`);
      } catch (error) {
        await driver.deleteSession().catch(() => undefined);
        throw error;
      }
      await use(driver);
      await driver.deleteSession().catch(() => undefined);
    },
    { scope: 'worker', timeout: 180_000 },
  ],
  driver: async ({ androidDriver, androidNetworkProblem }, use, testInfo) => {
    testInfo.skip(Boolean(androidNetworkProblem), androidNetworkProblem);
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
  homeScreen: async ({ driver }, use) => {
    await use(new HomeScreen(driver));
  },
  favouritesScreen: async ({ driver }, use) => {
    await use(new FavouritesScreen(driver));
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
  registrationScreen: async ({ driver }, use) => {
    await use(new MazadRegistrationScreen(driver));
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
  moreScreen: async ({ driver }, use) => {
    await use(new MoreScreen(driver));
  },
  staticPageScreen: async ({ driver }, use) => {
    await use(new StaticPageScreen(driver));
  },
  // eslint-disable-next-line no-empty-pattern
  buyer: async ({}, use, testInfo) => {
    const account = getBuyerAccount();
    testInfo.skip(!account, BUYER_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  // eslint-disable-next-line no-empty-pattern
  androidIndividual: async ({}, use, testInfo) => {
    const account = getAndroidTestIndividual();
    testInfo.skip(!account, ANDROID_TEST_INDIVIDUAL_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
});

export { expect } from '@fixtures/website.fixture';
