/**
 * iOS (Appium + XCUITest) device and app configuration. Builds settings only: nothing here
 * starts a session, installs, launches or changes anything on the device.
 *
 * Device: selected by UDID only, never by name, and only from APPROVED_IOS_DEVICES.
 * App: only a bundle ID + build on the APPROVED_IOS_BUILDS allowlist may be automated. An
 * environment flag alone is never enough: before any session, the build installed on the
 * device is read from the Mac (devicectl) and must match the approved entry exactly.
 */

export interface ApprovedIosDevice {
  udid: string;
  /** Default platformVersion for the session (IOS_PLATFORM_VERSION overrides it). */
  platformVersion: string;
  /** Model, for people reading the list; never used to select the device. */
  model: string;
  /** Who approved the device, and when. */
  approval: string;
}

/** QA's iPhone (iPhone 15 Plus, iOS 27.0.1): the default device. */
export const QA_IPHONE = {
  udid: '00008120-0002703C1162601E',
  platformVersion: '27.0.1',
  model: 'iPhone 15 Plus',
  approval: 'QA owner, 2026-11-09: first physical-device stage.',
} as const satisfies ApprovedIosDevice;

/**
 * The only physical devices iOS runs may use, selected by UDID (IOS_UDID; QA_IPHONE when unset).
 * Any other device UDID is refused. Changed in code review only.
 */
export const APPROVED_IOS_DEVICES: readonly ApprovedIosDevice[] = [
  QA_IPHONE,
  {
    udid: '00008030-000475EA1405802E',
    platformVersion: '27.0.1',
    model: 'iPhone 11 Pro Max',
    approval:
      "QA owner, 2026-11-11: approved for the iOS Contact Us work while QA's iPhone is not connected; has the approved build 8.3 (1491) installed.",
  },
];

export interface ApprovedIosBuild {
  /** Where this build runs: the physical QA iPhone, or an iOS Simulator (a simulator build). */
  target: 'device' | 'simulator';
  bundleId: string;
  /** CFBundleShortVersionString, as devicectl reports it ("version"). */
  version: string;
  /** CFBundleVersion, as devicectl reports it ("bundleVersion"). */
  build: string;
  /**
   * The approved staging environment this build is tied to (config/environments/<id>.json).
   * Runs are refused unless TEST_ENV names exactly this environment.
   */
  stagingEnvironment: string;
  /**
   * Where the build stores its backend URL (in its app data container): read before and after
   * a device run, and it must equal the environment's approved origin. This is the STORED
   * setting only: it does not prove which server the app actually contacts.
   */
  storedBackend: { preferencesFile: string; key: string };
  /**
   * True only after the build was verified on the device to call nothing but its staging backend
   * (offline check of the build, or a blocked-network observation). Changed in code review,
   * never through an environment variable.
   */
  verifiedOnDevice: boolean;
  /** Who approved the entry, and when. */
  approval: string;
}

/**
 * The only iOS builds that may ever be automated. A build that is not listed (a production
 * app, a newer or older build of the same app) is always refused.
 */
export const APPROVED_IOS_BUILDS: readonly ApprovedIosBuild[] = [
  {
    target: 'device',
    bundleId: 'com.motory.dealer',
    version: '8.3',
    build: '1491',
    stagingEnvironment: 'stg-154',
    storedBackend: {
      preferencesFile: 'Library/Preferences/com.motory.dealer.plist',
      key: 'baseUrl',
    },
    verifiedOnDevice: true,
    approval:
      'QA owner, 2026-11-08: confirmed as the staging build. QA owner, 2026-11-09: authorized the first physical-device stage (guest-screen inspection) after reporting the iOS team and NetBird administrator confirmations received; evidence: passive capture reports/ios-device-capture/20261109T095737Z (host-level, one launch only). The stored backend setting is checked before and after every device run; it is not proof of the server actually contacted.',
  },
];

export interface IosConfig {
  target: 'device' | 'simulator';
  udid: string;
  /** Simulator only: the request guard proxy the UI-test build routes its traffic to. */
  guardProxy?: { host: string; port: number };
  platformVersion: string;
  bundleId: string;
  approvedBuild: ApprovedIosBuild;
  /**
   * Physical device only (never set for the simulator). Bundle ID of the WebDriverAgent runner
   * already installed and signed on the device, WITHOUT the ".xctrunner" suffix (e.g.
   * com.alsawaftah.motoryqa.WebDriverAgentRunner). Selects the preinstalled runner: Appium then
   * never builds or re-signs WebDriverAgent.
   */
  wdaBundleId?: string;
  /**
   * Physical device only. URL of a WebDriverAgent already RUNNING on the device (started with
   * `xcodebuild test-without-building`), for iOS versions where Appium cannot launch a
   * preinstalled runner without a sudo tunnel. Appium attaches to it; nothing is built or signed.
   * Private-network or loopback http URLs only.
   */
  wdaUrl?: string;
  /** Apple developer team ID used to sign WebDriverAgent, if Appium has to build it. */
  xcodeOrgId?: string;
}

/** Reads the iOS configuration from the environment and refuses unsafe or incomplete settings. */
export function readIosConfig(env: NodeJS.ProcessEnv = process.env): IosConfig {
  const target = env.IOS_TARGET === 'simulator' ? 'simulator' : 'device';
  // Physical device: QA's iPhone by default. Simulator: an explicit simulator UDID is required.
  const udid =
    target === 'device' ? env.IOS_UDID?.trim() || QA_IPHONE.udid : env.IOS_SIM_UDID?.trim() || '';
  const pattern =
    target === 'device'
      ? /^[0-9A-F]{8}-[0-9A-F]{16}$/i
      : /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
  if (!pattern.test(udid)) {
    throw new Error(
      target === 'device'
        ? `IOS_UDID "${udid}" is not a device UDID.`
        : `IOS_SIM_UDID "${udid}" is not a simulator UDID.`,
    );
  }
  const device =
    target === 'device'
      ? APPROVED_IOS_DEVICES.find((d) => d.udid.toUpperCase() === udid.toUpperCase())
      : undefined;
  if (target === 'device' && !device) {
    throw new Error(`Refusing device ${udid}: not on the APPROVED_IOS_DEVICES list.`);
  }
  const bundleId = env.IOS_BUNDLE_ID?.trim();
  if (!bundleId) {
    throw new Error('IOS_BUNDLE_ID is not set: give the approved Mazad staging bundle ID.');
  }
  const approvedBuild = APPROVED_IOS_BUILDS.find(
    (b) => b.bundleId === bundleId && b.target === target,
  );
  if (!approvedBuild) {
    throw new Error(
      `Refusing ${bundleId}: not on the APPROVED_IOS_BUILDS allowlist for ${target}.`,
    );
  }
  let guardProxy: IosConfig['guardProxy'];
  if (target === 'simulator') {
    const [host, port] = (env.IOS_GUARD_PROXY ?? '').split(':');
    if (host !== '127.0.0.1' || !/^\d{2,5}$/.test(port ?? '')) {
      throw new Error(
        'IOS_GUARD_PROXY must be 127.0.0.1:<port> (the local request guard) for the simulator.',
      );
    }
    guardProxy = { host, port: Number(port) };
  }
  return {
    target,
    guardProxy,
    udid,
    platformVersion:
      env.IOS_PLATFORM_VERSION?.trim() || device?.platformVersion || QA_IPHONE.platformVersion,
    bundleId,
    approvedBuild,
    // Device only: the simulator ignores IOS_WDA_BUNDLE_ID entirely (Appium's own runner).
    wdaBundleId: target === 'device' ? wdaBundleIdOf(env) : undefined,
    wdaUrl: target === 'device' ? wdaUrlOf(env) : undefined,
    xcodeOrgId: env.IOS_XCODE_ORG_ID?.trim() || undefined,
  };
}

/** Suffix of an installed WebDriverAgent runner's bundle ID (Appium's default too). */
export const WDA_RUNNER_SUFFIX = '.xctrunner';

/** IOS_WDA_BUNDLE_ID, validated: a reverse-DNS bundle ID given without the runner suffix. */
function wdaBundleIdOf(env: NodeJS.ProcessEnv): string | undefined {
  const id = env.IOS_WDA_BUNDLE_ID?.trim();
  if (!id) return undefined;
  if (id.endsWith(WDA_RUNNER_SUFFIX)) {
    throw new Error(
      `IOS_WDA_BUNDLE_ID must be given without "${WDA_RUNNER_SUFFIX}" (e.g. ${id.slice(0, -WDA_RUNNER_SUFFIX.length)}).`,
    );
  }
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(id)) {
    throw new Error(`IOS_WDA_BUNDLE_ID "${id}" is not a bundle ID.`);
  }
  return id;
}

/** IOS_WDA_URL, validated: http on loopback or a private (RFC 1918) address, with a port. */
function wdaUrlOf(env: NodeJS.ProcessEnv): string | undefined {
  const url = env.IOS_WDA_URL?.trim();
  if (!url) return undefined;
  const privateHost =
    /^http:\/\/(127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}):\d{2,5}\/?$/;
  if (!privateHost.test(url)) {
    throw new Error(
      `IOS_WDA_URL "${url}" must be http://<loopback or private IP>:<port> (a WebDriverAgent on the device).`,
    );
  }
  return url.replace(/\/$/, '');
}

/**
 * WebDriverAgent capabilities.
 * - Simulator: none. Appium's default simulator WebDriverAgent; any runner bundle ID is ignored.
 * - Device with IOS_WDA_URL: attach to the WebDriverAgent already running on the device; nothing
 *   is launched, built or signed (takes precedence over IOS_WDA_BUNDLE_ID).
 * - Device with IOS_WDA_BUNDLE_ID: use the runner already installed on the device
 *   (`<id>.xctrunner`); nothing is built, signed or installed, so no Xcode signing capability is
 *   passed (the driver treats them as incompatible with a preinstalled runner).
 * - Device without it: Appium builds WebDriverAgent, with the optional signing team.
 */
export function wdaCapabilities(config: IosConfig): Record<string, unknown> {
  if (config.target !== 'device') return {};
  if (config.wdaUrl) return { 'appium:webDriverAgentUrl': config.wdaUrl };
  if (config.wdaBundleId) {
    return {
      'appium:usePreinstalledWDA': true,
      'appium:updatedWDABundleId': config.wdaBundleId,
      'appium:updatedWDABundleIdSuffix': WDA_RUNNER_SUFFIX,
    };
  }
  return config.xcodeOrgId
    ? { 'appium:xcodeOrgId': config.xcodeOrgId, 'appium:xcodeSigningId': 'Apple Development' }
    : {};
}

/** One app entry from `xcrun devicectl device info apps --json-output`. */
export interface InstalledIosApp {
  bundleIdentifier: string;
  version?: string;
  bundleVersion?: string;
}

/** Refuses unless the device has exactly the approved bundle, version and build installed. */
export function installedBuildProblem(
  apps: readonly InstalledIosApp[],
  approved: ApprovedIosBuild,
): string | undefined {
  const app = apps.find((a) => a.bundleIdentifier === approved.bundleId);
  if (!app) return `${approved.bundleId} is not installed on the device.`;
  if (app.version !== approved.version || app.bundleVersion !== approved.build) {
    return (
      `Installed ${approved.bundleId} is ${app.version} (${app.bundleVersion}), but only ` +
      `${approved.version} (${approved.build}) is approved.`
    );
  }
  return undefined;
}

/**
 * Launch arguments the app must start with. Simulator UI-test build: where the request guard is
 * (the build must honour it for all its network clients; docs/ios-uitest-build-requirements.md).
 * Used both at session start and on every relaunch (restartIosApp), so no launch skips the guard.
 */
export function iosLaunchArguments(config: IosConfig): string[] {
  return config.guardProxy
    ? ['-MazadUITestProxy', `${config.guardProxy.host}:${config.guardProxy.port}`]
    : [];
}

/**
 * Why the app may not be launched with this configuration, or undefined. A simulator launch must
 * carry exactly `-MazadUITestProxy 127.0.0.1:<port>`; enforced by every launch path
 * (startIosSession, restartIosApp) and by the guarded launch.
 */
export function launchArgumentsProblem(config: IosConfig): string | undefined {
  if (config.target !== 'simulator') return undefined;
  const args = iosLaunchArguments(config);
  const proxy = config.guardProxy;
  if (
    !proxy ||
    proxy.host !== '127.0.0.1' ||
    args.length !== 2 ||
    args[0] !== '-MazadUITestProxy' ||
    args[1] !== `127.0.0.1:${proxy.port}`
  ) {
    return 'Simulator launch refused: the -MazadUITestProxy 127.0.0.1:<port> launch argument is missing.';
  }
  return undefined;
}

/** Appium capabilities for an XCUITest session on the configured device and app. */
export function iosCapabilities(config: IosConfig): Record<string, unknown> {
  return {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': config.udid,
    'appium:platformVersion': config.platformVersion,
    'appium:bundleId': config.bundleId,
    // Use the app as installed: never reinstall, reset or clear its data.
    'appium:noReset': true,
    'appium:fullReset': false,
    'appium:newCommandTimeout': 180,
    // Simulator UI-test build: tell the app where the request guard is.
    ...(config.guardProxy
      ? { 'appium:processArguments': { args: iosLaunchArguments(config) } }
      : {}),
    'appium:wdaLaunchTimeout': 120_000,
    ...wdaCapabilities(config),
  };
}
