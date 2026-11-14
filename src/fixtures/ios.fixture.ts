import { type BackendAccount, getIosTestDealer } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
// Extends the website fixture (as mobile.fixture does) to reuse the back-office account lookup,
// the staging OTP (otpCode) and the language option.
import { test as base } from '@fixtures/website.fixture';
import { type IosConfig, readIosConfig } from '@mobile/ios/ios.config';
import { type IosGuard, startIosGuard } from '@mobile/ios/ios-guard';
import { storedBackendCheck } from '@mobile/ios/app-backend-check';
import {
  iosRuntimeProblem,
  outOfTextScopeReason,
  stagingOriginOf,
  TEXT_GATED_PROJECTS,
} from '@mobile/ios/ios-preflight';
import { type IosDriver, startIosSession } from '@mobile/ios/ios.session';
import { restrictDriver, type SpecDriver } from '@mobile/ios/spec-driver';
import { IosAccountScreen } from '@mobile/ios/screens/account.screen';
import { IosAppShellScreen } from '@mobile/ios/screens/app-shell.screen';
import { IosContactFormScreen } from '@mobile/ios/screens/contact-form.screen';
import { IosHelpCenterScreen } from '@mobile/ios/screens/help-center.screen';
import { IosMoreScreen } from '@mobile/ios/screens/more.screen';
import { IosForceUpdateScreen } from '@mobile/ios/screens/force-update.screen';
import { IosForgotPasswordScreen } from '@mobile/ios/screens/forgot-password.screen';
import { IosGuestTabsScreen } from '@mobile/ios/screens/guest-tabs.screen';
import { IosRegistrationScreen } from '@mobile/ios/screens/registration.screen';
import { IosLoginScreen } from '@mobile/ios/screens/login.screen';
import { IosNewPasswordScreen } from '@mobile/ios/screens/new-password.screen';
import { IosOtpScreen } from '@mobile/ios/screens/otp.screen';
import { type IosAppText, iosAppText } from '@test-data/ios-app.data';
import { GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';

interface IosWorkerFixtures {
  /** Why iOS tests cannot run (gates, Appium, installed build), or undefined. */
  iosProblem: string | undefined;
  /** One Appium session per worker; null (tests skipped) whenever iosProblem is set. */
  iosDriver: IosDriver | null;
  /** Simulator runs: the request guard, started before the session. Null for device runs. */
  iosGuard: IosGuard | null;
}

interface IosFixtures {
  /** Auto fixture: skips tests outside the narrow text gate's scope (see the fixture). */
  textScopeGuard: undefined;
  /** The REAL driver, for the screen objects only (and the read-only inspection run). */
  screenDriver: IosDriver;
  /** What specs get: restart, page source and pause only (src/mobile/ios/spec-driver.ts). */
  driver: SpecDriver;
  iosConfig: IosConfig;
  text: IosAppText;
  appShell: IosAppShellScreen;
  loginScreen: IosLoginScreen;
  forgotPasswordScreen: IosForgotPasswordScreen;
  registrationScreen: IosRegistrationScreen;
  guestTabsScreen: IosGuestTabsScreen;
  otpScreen: IosOtpScreen;
  newPasswordScreen: IosNewPasswordScreen;
  accountScreen: IosAccountScreen;
  contactFormScreen: IosContactFormScreen;
  helpCenterScreen: IosHelpCenterScreen;
  moreScreen: IosMoreScreen;
  forceUpdateScreen: IosForceUpdateScreen;
  /**
   * The dedicated dealer test account from .env (IOS_TEST_DEALER_*; redacted when printed).
   * It is never looked up in the back office, and only reached after the iOS session is
   * confirmed usable. The Individual account is excluded.
   */
  iosDealerAccount: BackendAccount;
}

export const test = base.extend<IosFixtures, IosWorkerFixtures>({
  // Runs before every test of the functional project, ahead of the driver fixture (and so before
  // any hook or app action): while IOS_TEXT_VERIFIED is closed, only the guest display tests of
  // the narrow text gate may run; any other test is skipped here.
  textScopeGuard: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      const reason = outOfTextScopeReason(testInfo.project.name, testInfo.title);
      testInfo.skip(Boolean(reason), reason);
      await use(undefined);
    },
    { auto: true },
  ],
  iosProblem: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      await use(
        await iosRuntimeProblem(envConfig.appiumURL, {
          // The registration E2E journey's own screens (Individual Step 2, registration OTP,
          // success) are not yet in the verified-text gate either: treated as inspection, same as
          // ios-inspect, until they are investigated and the registration screen object is written.
          forInspection:
            workerInfo.project.name === 'ios-inspect' ||
            workerInfo.project.name === 'ios-registration-e2e',
          // The functional project may run on the NARROW text gate; each test is then limited to
          // the guest display tests by textScopeGuard below (and by declaration in the specs).
          textScope: TEXT_GATED_PROJECTS.includes(workerInfo.project.name)
            ? GUEST_FORM_TEXT_SCOPE
            : undefined,
        }),
      );
    },
    { scope: 'worker', timeout: 90_000 },
  ],
  iosGuard: [
    async ({ iosProblem }, use) => {
      if (iosProblem) {
        await use(null);
        return;
      }
      const config = readIosConfig();
      if (config.target !== 'simulator') {
        await use(null);
        return;
      }
      const guard = await startIosGuard(config);
      await use(guard);
      await guard.close();
    },
    { scope: 'worker' },
  ],
  iosDriver: [
    async ({ iosProblem, iosGuard }, use) => {
      void iosGuard; // Simulator runs: the guard is listening before the app can start.
      // No session (so the app is never launched) while any check fails.
      if (iosProblem) {
        await use(null);
        return;
      }
      const config = readIosConfig();
      const driver = await startIosSession(envConfig.appiumURL, config);
      await use(driver);
      await driver.deleteSession().catch(() => undefined);
      // Device runs: the app's stored backend setting must still be the selected staging origin
      // after the run (it was checked before the session too). A match before and after does
      // NOT prove the backend never changed during the run, nor which server was contacted.
      if (config.target === 'device') {
        const after = await storedBackendCheck(config, stagingOriginOf(config));
        if (after) {
          throw new Error(`After the run: ${after} Do not trust this run's results.`);
        }
      }
    },
    { scope: 'worker', timeout: 240_000 },
  ],
  screenDriver: async ({ iosDriver, iosProblem, iosGuard }, use, testInfo) => {
    testInfo.skip(Boolean(iosProblem), iosProblem);
    if (iosGuard?.halted)
      throw new Error('Run halted by the iOS request guard after an unexpected request.');
    const seen = iosGuard?.events.length ?? 0;
    if (!iosDriver) return; // Not reached: skip() ends the test.
    await use(iosDriver);
    if (iosGuard) {
      const mine = iosGuard.events.slice(seen);
      await testInfo.attach('ios-request-guard.json', {
        body: JSON.stringify({ blocked: mine, allowedSoFar: iosGuard.allowed }, null, 2),
        contentType: 'application/json',
      });
      const unexpected = mine.filter((e) => e.kind === 'unexpected');
      if (unexpected.length) {
        throw new Error(
          `iOS request guard blocked unexpected request(s); the run is halted: ${unexpected.map((e) => `${e.method} ${e.target} (${e.reason})`).join('; ')}`,
        );
      }
    }
  },
  driver: async ({ screenDriver }, use) => {
    await use(restrictDriver(screenDriver));
  },
  iosConfig: async ({ screenDriver }, use) => {
    void screenDriver;
    await use(readIosConfig());
  },
  text: async ({ language }, use) => {
    await use(iosAppText(language));
  },
  appShell: async ({ screenDriver }, use) => {
    await use(new IosAppShellScreen(screenDriver));
  },
  loginScreen: async ({ screenDriver }, use) => {
    await use(new IosLoginScreen(screenDriver));
  },
  forgotPasswordScreen: async ({ screenDriver }, use) => {
    await use(new IosForgotPasswordScreen(screenDriver));
  },
  registrationScreen: async ({ screenDriver }, use) => {
    await use(new IosRegistrationScreen(screenDriver));
  },
  guestTabsScreen: async ({ screenDriver }, use) => {
    await use(new IosGuestTabsScreen(screenDriver));
  },
  otpScreen: async ({ screenDriver }, use) => {
    await use(new IosOtpScreen(screenDriver));
  },
  newPasswordScreen: async ({ screenDriver }, use) => {
    await use(new IosNewPasswordScreen(screenDriver));
  },
  accountScreen: async ({ screenDriver }, use) => {
    await use(new IosAccountScreen(screenDriver));
  },
  contactFormScreen: async ({ screenDriver }, use) => {
    await use(new IosContactFormScreen(screenDriver));
  },
  helpCenterScreen: async ({ screenDriver }, use) => {
    await use(new IosHelpCenterScreen(screenDriver));
  },
  moreScreen: async ({ screenDriver }, use) => {
    await use(new IosMoreScreen(screenDriver));
  },
  forceUpdateScreen: async ({ screenDriver }, use) => {
    await use(new IosForceUpdateScreen(screenDriver));
  },
  // `driver` comes first, so a blocked or skipped test never reads the account.
  iosDealerAccount: async ({ driver }, use, testInfo) => {
    void driver;
    const account = getIosTestDealer();
    testInfo.skip(
      !account,
      'IOS_TEST_DEALER_ID / IOS_TEST_DEALER_PHONE / IOS_TEST_DEALER_PASSWORD are not all in the local .env (or the ID is not valid).',
    );
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
});

export { expect } from '@fixtures/website.fixture';
