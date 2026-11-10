import { expect, test } from '../support/fixtures';
import { type IosConfig, iosCapabilities, wdaCapabilities } from '../../src/mobile/ios/ios.config';
import {
  APPROVED_IOS_BUILDS,
  installedBuildProblem,
  IOS_DEVICE_RUNS_APPROVED,
  IOS_GATES,
  type IosGates,
  IOS_NETWORK_GUARD_READY,
  iosStaticProblem,
  QA_IPHONE,
  readIosConfig,
} from '../support/ios/ios-checks';

/** Offline: no device, no Appium, no network. */
const APPROVED = APPROVED_IOS_BUILDS[0];
/** The staging environment the approved build is tied to (selected with TEST_ENV). */
const STG = { TEST_ENV: APPROVED.stagingEnvironment };

test.describe('iOS allowlist and preflight (selfcheck)', () => {
  test('only allowlisted bundle IDs are accepted', () => {
    expect(readIosConfig({ IOS_BUNDLE_ID: APPROVED.bundleId }).approvedBuild).toBe(APPROVED);
    for (const bad of ['com.motory.dealer.production', 'com.motory', 'com.motory.shopapp', 'x.y']) {
      expect(() => readIosConfig({ IOS_BUNDLE_ID: bad }), bad).toThrow(
        /not on the APPROVED_IOS_BUILDS/,
      );
    }
    expect(() => readIosConfig({})).toThrow(/IOS_BUNDLE_ID is not set/);
  });

  test('the device is selected by UDID only', () => {
    expect(readIosConfig({ IOS_BUNDLE_ID: APPROVED.bundleId }).udid).toBe(QA_IPHONE.udid);
    expect(() =>
      readIosConfig({ IOS_BUNDLE_ID: APPROVED.bundleId, IOS_UDID: "QA's iPhone" }),
    ).toThrow(/not a device UDID/);
  });

  test('the installed build must match the approved bundle, version and build exactly', () => {
    const app = {
      bundleIdentifier: APPROVED.bundleId,
      version: APPROVED.version,
      bundleVersion: APPROVED.build,
    };
    expect(installedBuildProblem([app], APPROVED)).toBeUndefined();
    expect(installedBuildProblem([{ ...app, bundleVersion: '1500' }], APPROVED)).toMatch(
      /only .* is approved/,
    );
    expect(installedBuildProblem([{ ...app, version: '9.0' }], APPROVED)).toMatch(
      /only .* is approved/,
    );
    expect(installedBuildProblem([], APPROVED)).toMatch(/not installed/);
    expect(installedBuildProblem([{ ...app, bundleIdentifier: 'com.motory' }], APPROVED)).toMatch(
      /not installed/,
    );
  });

  test('environment flags alone can never unblock iOS', () => {
    const env = {
      ...STG,
      IOS_BUNDLE_ID: APPROVED.bundleId,
      // Old/accidental flags: must have no effect.
      IOS_STAGING_VERIFIED: 'true',
      IOS_NETWORK_SAFETY_VERIFIED: 'true',
      IOS_BUNDLE_CONFIRMED_STAGING: 'true',
      IOS_ALLOW_ACCOUNT_ACTIONS: 'true',
      IOS_ALLOW_PASSWORD_RESET: 'true',
    };
    expect(iosStaticProblem(env)).toMatch(/Safety gate/);
    expect(iosStaticProblem({ IOS_BUNDLE_ID: 'com.motory.dealer.production' })).toMatch(
      /iOS configuration/,
    );
  });

  test('current state: device build authorized, simulator guard not ready, text gate still closed', () => {
    // QA owner, 2026-11-09: the device build and device runs are authorized for the inspection.
    expect(APPROVED.verifiedOnDevice).toBe(true);
    expect(IOS_NETWORK_GUARD_READY).toBe(false);
    // Functional tests stay blocked until the inspected selectors and text are reviewed.
    expect(iosStaticProblem({ ...STG, IOS_BUNDLE_ID: APPROVED.bundleId })).toMatch(
      /selectors and text are not verified yet/,
    );
    // The first inspection itself is allowed (it skips only the text gate).
    expect(
      iosStaticProblem({ ...STG, IOS_BUNDLE_ID: APPROVED.bundleId }, { forInspection: true }),
    ).toBeUndefined();
  });
});

test.describe('iOS simulator target (selfcheck)', () => {
  const SIM = '97280C37-F455-413F-855F-2520B97308AB';

  test('needs a simulator UDID and the local guard proxy', () => {
    const base = { IOS_TARGET: 'simulator', IOS_BUNDLE_ID: APPROVED.bundleId };
    expect(() => readIosConfig(base)).toThrow(/IOS_SIM_UDID/);
    expect(() => readIosConfig({ ...base, IOS_SIM_UDID: QA_IPHONE.udid })).toThrow(
      /not a simulator UDID/,
    );
  });

  test('no simulator build is approved yet: every simulator bundle is refused', () => {
    expect(APPROVED_IOS_BUILDS.filter((b) => b.target === 'simulator')).toEqual([]);
    expect(() =>
      readIosConfig({
        IOS_TARGET: 'simulator',
        IOS_SIM_UDID: SIM,
        IOS_BUNDLE_ID: APPROVED.bundleId,
        IOS_GUARD_PROXY: '127.0.0.1:18090',
      }),
    ).toThrow(/not on the APPROVED_IOS_BUILDS allowlist for simulator/);
  });

  test('the physical-device build is not usable on a simulator and vice versa', () => {
    expect(readIosConfig({ IOS_BUNDLE_ID: APPROVED.bundleId }).target).toBe('device');
    expect(APPROVED.target).toBe('device');
  });
});

test.describe('iOS per-target gates (selfcheck)', () => {
  const SIM_UDID = '97280C37-F455-413F-855F-2520B97308AB';
  const verified = { ...APPROVED, verifiedOnDevice: true };
  const deviceConfig = (): IosConfig => ({
    ...readIosConfig({ IOS_BUNDLE_ID: APPROVED.bundleId }),
    approvedBuild: verified,
  });
  const simConfig = (): IosConfig => ({
    ...deviceConfig(),
    target: 'simulator',
    udid: SIM_UDID,
    guardProxy: { host: '127.0.0.1', port: 18090 },
    approvedBuild: { ...verified, target: 'simulator' },
  });
  const gates = (g: Partial<IosGates>): IosGates => ({
    networkGuardReady: false,
    deviceRunsApproved: false,
    textVerified: true,
    guestFormTextVerified: false,
    ...g,
  });
  const device = (g: Partial<IosGates>) => iosStaticProblem(STG, {}, gates(g), deviceConfig);
  const sim = (g: Partial<IosGates>) => iosStaticProblem(STG, {}, gates(g), simConfig);

  test('the device needs IOS_DEVICE_RUNS_APPROVED; the simulator guard flag never satisfies it', () => {
    expect(device({ deviceRunsApproved: true })).toBeUndefined();
    expect(device({ networkGuardReady: true })).toMatch(
      /Safety gate \(device\).*IOS_DEVICE_RUNS_APPROVED/,
    );
    expect(device({})).toMatch(/Safety gate \(device\)/);
  });

  test('the simulator needs IOS_NETWORK_GUARD_READY; the device approval never satisfies it', () => {
    expect(sim({ networkGuardReady: true })).toBeUndefined();
    expect(sim({ deviceRunsApproved: true })).toMatch(
      /Safety gate \(simulator\).*IOS_NETWORK_GUARD_READY/,
    );
    expect(sim({})).toMatch(/Safety gate \(simulator\)/);
  });

  test('an unverified build blocks both targets, whatever the gates', () => {
    const all = gates({ networkGuardReady: true, deviceRunsApproved: true });
    const unverified = (c: () => IosConfig) => () => ({
      ...c(),
      approvedBuild: { ...c().approvedBuild, verifiedOnDevice: false },
    });
    expect(iosStaticProblem(STG, {}, all, unverified(deviceConfig))).toMatch(/not yet verified/);
    expect(iosStaticProblem(STG, {}, all, unverified(simConfig))).toMatch(/not yet verified/);
  });

  test('the text gate applies to both targets; only the inspection skips it', () => {
    const open = { deviceRunsApproved: true, networkGuardReady: true, textVerified: false };
    expect(device(open)).toMatch(/not verified yet \(first inspection/);
    expect(sim(open)).toMatch(/not verified yet \(first inspection/);
    expect(
      iosStaticProblem(STG, { forInspection: true }, gates(open), deviceConfig),
    ).toBeUndefined();
  });

  test('current state: only the device gate is open; the simulator gate stays closed', () => {
    expect(IOS_DEVICE_RUNS_APPROVED).toBe(true);
    expect(IOS_NETWORK_GUARD_READY).toBe(false);
    expect(IOS_GATES).toMatchObject({ networkGuardReady: false, deviceRunsApproved: true });
    const env = {
      ...STG,
      IOS_BUNDLE_ID: APPROVED.bundleId,
      IOS_DEVICE_RUNS_APPROVED: 'true',
      IOS_NETWORK_GUARD_READY: 'true',
    };
    expect(iosStaticProblem(env)).toMatch(/Safety gate/);
    // Environment variables cannot open the simulator gate (a simulator config stays blocked).
    expect(
      iosStaticProblem(env, {}, { ...IOS_GATES, deviceRunsApproved: false }, deviceConfig),
    ).toMatch(/Safety gate \(device\)/);
    expect(iosStaticProblem(env, {}, IOS_GATES, simConfig)).toMatch(/Safety gate \(simulator\)/);
  });
});

test.describe('iOS WebDriverAgent capabilities (selfcheck)', () => {
  const base = { IOS_BUNDLE_ID: APPROVED.bundleId };
  const WDA = 'com.alsawaftah.motoryqa.WebDriverAgentRunner';

  test('device + IOS_WDA_BUNDLE_ID: the preinstalled runner, no build or signing capabilities', () => {
    const caps = iosCapabilities(
      readIosConfig({ ...base, IOS_WDA_BUNDLE_ID: WDA, IOS_XCODE_ORG_ID: 'TEAM123456' }),
    );
    expect(caps).toMatchObject({
      'appium:udid': QA_IPHONE.udid,
      'appium:platformVersion': QA_IPHONE.platformVersion,
      'appium:bundleId': APPROVED.bundleId,
      'appium:noReset': true,
      'appium:fullReset': false,
      'appium:usePreinstalledWDA': true,
      'appium:updatedWDABundleId': WDA,
      'appium:updatedWDABundleIdSuffix': '.xctrunner',
    });
    for (const key of ['appium:xcodeOrgId', 'appium:xcodeSigningId', 'appium:processArguments']) {
      expect(caps, key).not.toHaveProperty(key);
    }
  });

  test('device without IOS_WDA_BUNDLE_ID: unchanged (Appium builds WebDriverAgent)', () => {
    expect(iosCapabilities(readIosConfig(base))).not.toHaveProperty('appium:usePreinstalledWDA');
    expect(
      iosCapabilities(readIosConfig({ ...base, IOS_XCODE_ORG_ID: 'TEAM123456' })),
    ).toMatchObject({
      'appium:xcodeOrgId': 'TEAM123456',
    });
  });

  test('the bundle ID must be given without ".xctrunner" and be a bundle ID', () => {
    expect(() => readIosConfig({ ...base, IOS_WDA_BUNDLE_ID: `${WDA}.xctrunner` })).toThrow(
      /without "\.xctrunner".*com\.alsawaftah\.motoryqa\.WebDriverAgentRunner\)/,
    );
    expect(() => readIosConfig({ ...base, IOS_WDA_BUNDLE_ID: 'not a bundle' })).toThrow(
      /is not a bundle ID/,
    );
    expect(iosStaticProblem({ ...base, IOS_WDA_BUNDLE_ID: `${WDA}.xctrunner` })).toMatch(
      /^iOS configuration: /,
    );
  });

  test('the simulator never uses the preinstalled-runner strategy and keeps the guard argument', () => {
    const sim: IosConfig = {
      ...readIosConfig({ ...base, IOS_WDA_BUNDLE_ID: WDA }),
      target: 'simulator',
      udid: '97280C37-F455-413F-855F-2520B97308AB',
      guardProxy: { host: '127.0.0.1', port: 18090 },
    };
    const caps = iosCapabilities(sim);
    expect(caps).not.toHaveProperty('appium:usePreinstalledWDA');
    expect(caps).not.toHaveProperty('appium:xcodeOrgId');
    expect(caps['appium:processArguments']).toEqual({
      args: ['-MazadUITestProxy', '127.0.0.1:18090'],
    });
  });

  test('simulator capabilities carry no WebDriverAgent runner or signing settings, even when configured', () => {
    // No simulator build is allowlisted (and none is added here), so the simulator config is
    // derived from a device config read WITH IOS_WDA_BUNDLE_ID and IOS_XCODE_ORG_ID set.
    const asSimulator = (env: NodeJS.ProcessEnv): IosConfig => ({
      ...readIosConfig({ ...base, ...env }),
      target: 'simulator',
      udid: '97280C37-F455-413F-855F-2520B97308AB',
      guardProxy: { host: '127.0.0.1', port: 18090 },
    });
    const configured = asSimulator({ IOS_WDA_BUNDLE_ID: WDA, IOS_XCODE_ORG_ID: 'TEAM123456' });
    // The runner and signing settings really are present in the config the simulator receives.
    expect(configured).toMatchObject({ wdaBundleId: WDA, xcodeOrgId: 'TEAM123456' });
    const runnerAndSigning = [
      'appium:usePreinstalledWDA',
      'appium:updatedWDABundleId',
      'appium:updatedWDABundleIdSuffix',
      'appium:xcodeOrgId',
      'appium:xcodeSigningId',
      'appium:xcodeConfigFile',
      'appium:keychainPath',
      'appium:keychainPassword',
      'appium:allowProvisioningDeviceRegistration',
      'appium:usePrebuiltWDA',
      'appium:prebuildWDA',
      'appium:useXctestrunFile',
    ];
    for (const [name, config] of [
      ['configured', configured],
      ['not configured', asSimulator({})],
    ] as const) {
      const caps = iosCapabilities(config);
      for (const key of runnerAndSigning) expect(caps, `${name}: ${key}`).not.toHaveProperty(key);
      expect(wdaCapabilities(config), name).toEqual({});
      // The simulator keeps its guard argument.
      expect(caps['appium:processArguments'], name).toEqual({
        args: ['-MazadUITestProxy', '127.0.0.1:18090'],
      });
    }
  });
});
