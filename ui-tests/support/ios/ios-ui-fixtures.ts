import { envConfig } from '@config/env.config';
import { type IosConfig, readIosConfig } from '@mobile/ios/ios.config';
import { type IosGuard, startIosGuard } from '@mobile/ios/ios-guard';
import { iosRuntimeProblem, iosStaticProblem } from '@mobile/ios/ios-preflight';
import { type IosDriver, startIosSession } from '@mobile/ios/ios.session';
import { IosAppShellScreen } from '@mobile/ios/screens/app-shell.screen';
import { IosForgotPasswordScreen } from '@mobile/ios/screens/forgot-password.screen';
import { IosLoginScreen } from '@mobile/ios/screens/login.screen';
import { type IosAppText, iosAppText } from '@test-data/ios-app.data';
import { test as uiTest } from '../fixtures';
import type { Findings } from '../findings';
import type { IosIssue } from './ios-layout';

/**
 * iOS UI/visual fixtures: the web UI layer's snapshot guard, halt check and findings, plus an
 * XCUITest session that only starts once the iOS safety gates pass. No credentialed fixture is
 * exposed: the UI layer is guest-only on iOS too.
 */
interface IosUiWorkerFixtures {
  iosProblem: string | undefined;
  iosDriver: IosDriver | null;
  /** Simulator runs: the request guard, started before the session. Null for device runs. */
  iosGuard: IosGuard | null;
}

interface IosUiFixtures {
  driver: IosDriver;
  iosConfig: IosConfig;
  text: IosAppText;
  appShell: IosAppShellScreen;
  loginScreen: IosLoginScreen;
  forgotPasswordScreen: IosForgotPasswordScreen;
}

export const test = uiTest.extend<IosUiFixtures, IosUiWorkerFixtures>({
  iosProblem: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(await iosRuntimeProblem(envConfig.appiumURL));
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
      const driver = await startIosSession(envConfig.appiumURL, readIosConfig());
      await use(driver);
      await driver.deleteSession().catch(() => undefined);
    },
    { scope: 'worker', timeout: 240_000 },
  ],
  driver: async ({ iosDriver, iosProblem, iosGuard }, use, testInfo) => {
    testInfo.skip(Boolean(iosProblem), iosProblem);
    if (iosGuard?.halted)
      throw new Error('Run halted by the iOS request guard after an unexpected request.');
    const seen = iosGuard?.events.length ?? 0;
    if (!iosDriver) return;
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
  iosConfig: async ({ driver }, use) => {
    void driver;
    await use(readIosConfig());
  },
  text: async ({ language }, use) => {
    await use(iosAppText(language));
  },
  appShell: async ({ driver }, use) => {
    await use(new IosAppShellScreen(driver));
  },
  loginScreen: async ({ driver }, use) => {
    await use(new IosLoginScreen(driver));
  },
  forgotPasswordScreen: async ({ driver }, use) => {
    await use(new IosForgotPasswordScreen(driver));
  },
});

export { expect } from '../fixtures';

/** Adds iOS layout issues to the findings report. */
export function addIosFindings(
  findings: Findings,
  screen: string,
  issues: IosIssue[],
  shot: string,
) {
  for (const i of issues) findings.add({ screen, ...i, screenshot: shot });
}

/** Language labels and home-tab labels for both languages (for the in-app language switch). */
export const IOS_LANGUAGE_OPTIONS = {
  en: iosAppText('en').languageOption,
  ar: iosAppText('ar').languageOption,
};
export const IOS_HOME_TABS = { en: iosAppText('en').tabs.home, ar: iosAppText('ar').tabs.home };
export const IOS_MORE_TABS = { en: iosAppText('en').tabs.more, ar: iosAppText('ar').tabs.more };

/** Static iOS gates (no device, no network): blocked specs skip before any hook or fixture. */
export const IOS_STATIC_PROBLEM = iosStaticProblem();
