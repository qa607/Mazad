import { test as base } from '@playwright/test';
import { envConfig } from '@config/env.config';
import {
  getInspectionInspectorTestAccount,
  INSPECTION_INSPECTOR_TEST_MISSING_REASON,
} from '@config/credentials.config';
import {
  type InspectionAndroidDriver,
  restartInspectionAndroidApp,
  startInspectionAndroidSession,
} from '@mobile/inspection-android/inspection-android.session';
import { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';
import { InspectorLoginScreen } from '@mobile/inspection-android/screens/inspector-login.screen';
import { NewVehicleScreen } from '@mobile/inspection-android/screens/new-vehicle.screen';
import { VehicleBasicInfoScreen } from '@mobile/inspection-android/screens/vehicle-basic-info.screen';
import { VehicleEssentialsBodyScreen } from '@mobile/inspection-android/screens/vehicle-essentials-body.screen';
import { VehiclePhotosScreen } from '@mobile/inspection-android/screens/vehicle-photos.screen';
import { SigningScreen } from '@mobile/inspection-android/screens/signing.screen';

interface InspectionAndroidWorkerFixtures {
  /** Why Inspection Android tests cannot run (Appium unreachable, no device), or undefined. */
  inspectionAndroidProblem: string | undefined;
  /** One Appium session per worker; null (tests skipped) whenever inspectionAndroidProblem is set. */
  inspectionAndroidDriver: InspectionAndroidDriver | null;
}

interface InspectionAndroidFixtures {
  driver: InspectionAndroidDriver;
  homeScreen: InspectorHomeScreen;
  loginScreen: InspectorLoginScreen;
  newVehicleScreen: NewVehicleScreen;
  basicInfoScreen: VehicleBasicInfoScreen;
  essentialsBodyScreen: VehicleEssentialsBodyScreen;
  photosScreen: VehiclePhotosScreen;
  signingScreen: SigningScreen;
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

export const test = base.extend<InspectionAndroidFixtures, InspectionAndroidWorkerFixtures>({
  inspectionAndroidProblem: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (!(await appiumReady(envConfig.appiumURL))) {
        await use(
          `Environment: Appium is not reachable at ${envConfig.appiumURL} (set APPIUM_URL, start Appium and the device).`,
        );
        return;
      }
      await use(undefined);
    },
    { scope: 'worker' },
  ],
  inspectionAndroidDriver: [
    async ({ inspectionAndroidProblem }, use) => {
      if (inspectionAndroidProblem) {
        await use(null);
        return;
      }
      let driver: InspectionAndroidDriver;
      try {
        driver = await startInspectionAndroidSession(envConfig.appiumURL);
      } catch (error) {
        console.error('Could not start the Inspection Android session:', error);
        await use(null);
        return;
      }
      await use(driver);
      await driver.deleteSession().catch(() => undefined);
    },
    { scope: 'worker', timeout: 60_000 },
  ],
  driver: async ({ inspectionAndroidDriver, inspectionAndroidProblem }, use, testInfo) => {
    testInfo.skip(Boolean(inspectionAndroidProblem), inspectionAndroidProblem);
    testInfo.skip(
      !inspectionAndroidDriver,
      'Environment: could not start an Inspection Android Appium session (device connected and authorized?).',
    );
    if (!inspectionAndroidDriver) return; // Not reached: skip() ends the test.

    // One Appium session is shared by every test in the worker (starting a session is slow), so
    // without this a test that ends mid-form (a failure, or simply a test that does not navigate
    // back to Home) leaves the next test starting from an unknown screen - confirmed live to
    // cascade into unrelated failures (e.g. a later test timing out waiting for the Home tabs
    // because the app was still on a half-filled form). Restarting the process (not the session)
    // before every test returns it to the same known screen (signed-in Home - noReset normally
    // keeps the session itself, so no login is needed) regardless of how the previous test ended.
    await restartInspectionAndroidApp(inspectionAndroidDriver);
    const home = new InspectorHomeScreen(inspectionAndroidDriver);
    const reachedHome = await home
      .waitUntilReady(20_000)
      .then(() => true)
      .catch(() => false);

    // Confirmed live (2026-11-14): the app's own signed-in session can expire even under noReset,
    // landing a cold launch on the Login screen instead of Home. Recovered here with the dedicated
    // Inspector test account rather than failing the test, so a session expiry mid-suite does not
    // cascade into every later test the way an unhandled unknown screen would.
    if (!reachedHome) {
      const account = getInspectionInspectorTestAccount();
      testInfo.skip(!account, INSPECTION_INSPECTOR_TEST_MISSING_REASON);
      if (!account) return; // Not reached: skip() ends the test.

      const login = new InspectorLoginScreen(inspectionAndroidDriver);
      await login.waitUntilReady(15_000);
      await login.login(account.mobileNumber, account.pin);
      await home.waitUntilReady(20_000);
    }

    await use(inspectionAndroidDriver);
  },
  homeScreen: async ({ driver }, use) => {
    await use(new InspectorHomeScreen(driver));
  },
  loginScreen: async ({ driver }, use) => {
    await use(new InspectorLoginScreen(driver));
  },
  newVehicleScreen: async ({ driver }, use) => {
    await use(new NewVehicleScreen(driver));
  },
  basicInfoScreen: async ({ driver }, use) => {
    await use(new VehicleBasicInfoScreen(driver));
  },
  essentialsBodyScreen: async ({ driver }, use) => {
    await use(new VehicleEssentialsBodyScreen(driver));
  },
  photosScreen: async ({ driver }, use) => {
    await use(new VehiclePhotosScreen(driver));
  },
  signingScreen: async ({ driver }, use) => {
    await use(new SigningScreen(driver));
  },
});

export { expect } from '@playwright/test';
