import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { approvedOrigin } from '@config/staging-environments';
import { appVersionTestTitles } from '@test-data/app-version.data';
import { IOS_TEXT_VERIFIED } from '@test-data/ios-app.data';
import {
  GUEST_FORM_TEST_TITLES,
  GUEST_FORM_TEXT_SCOPE,
  guestFormTextProblem,
} from '@test-data/ios-verified-text';
import { storedBackendCheck, type StoredBackendReader } from '@mobile/ios/app-backend-check';
import {
  type InstalledIosApp,
  type IosConfig,
  installedBuildProblem,
  readIosConfig,
} from '@mobile/ios/ios.config';

/**
 * SIMULATOR ONLY. The simulator request guard (method, path and body checked before anything is
 * forwarded) is proven with the real UI-test build. Never unblocks a physical-device run.
 * Changed in code review only.
 */
export const IOS_NETWORK_GUARD_READY = false;

/**
 * PHYSICAL DEVICE ONLY. Device runs are approved. On the device no request can be blocked by
 * method and path (no guard is possible there); this is set in code review only after the iOS
 * team's written confirmation of the build's backend, the NetBird administrator's confirmation of
 * the staging network, and reviewed runtime evidence of the hosts the app contacts. Never
 * unblocks a simulator run.
 */
export const IOS_DEVICE_RUNS_APPROVED = true; // QA owner, 2026-11-09: first physical-device stage (inspection)

/** The code-review gates, as one value (selfchecks pass other combinations). */
export interface IosGates {
  networkGuardReady: boolean;
  deviceRunsApproved: boolean;
  /** ALL app text verified (IOS_TEXT_VERIFIED): unblocks every text-dependent test. */
  textVerified: boolean;
  /**
   * NARROW gate: the exact EN/AR text of the two guest display tests equals the verified text
   * (test-data/ios-verified-text.ts). Counts only for a run that asks for that text scope, and
   * never opens `textVerified`.
   */
  guestFormTextVerified: boolean;
}

export const IOS_GATES: IosGates = {
  networkGuardReady: IOS_NETWORK_GUARD_READY,
  deviceRunsApproved: IOS_DEVICE_RUNS_APPROVED,
  textVerified: IOS_TEXT_VERIFIED,
  guestFormTextVerified: guestFormTextProblem() === undefined,
};

/**
 * The iOS force-update test (tests-ios/app-version.backoffice.spec.ts) has its OWN approval, the
 * same switch as Android's (MAZAD_ALLOW_FORCE_UPDATE, QA owner 2026-11-14): while its back-office
 * row exists every staging iOS app shows the update dialog. It types nothing and taps nothing in
 * the app (navigation and reading only). With it, only that test's title passes the text gate.
 */
export function iosForceUpdateBlocked(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.MAZAD_ALLOW_FORCE_UPDATE === 'true'
    ? undefined
    : 'Blocked: adding a force-update app version on staging (blocks every staging iOS app until it is deleted) is not approved for this run (MAZAD_ALLOW_FORCE_UPDATE).';
}

/**
 * forInspection: the first guest-screen inspection, whose job is to verify the text, skips only
 * the text gate. textScope: a run limited to the narrow guest display tests accepts the narrow
 * text gate instead of IOS_TEXT_VERIFIED (it does not skip any other gate).
 */
export interface PreflightOptions {
  forInspection?: boolean;
  textScope?: typeof GUEST_FORM_TEXT_SCOPE;
}

/**
 * Checks that need no device and no network, in order. Evaluated when spec files load, so a
 * blocked suite is skipped before any hook or fixture (app launch, account lookup) runs.
 * Each target has its own gate: the simulator needs IOS_NETWORK_GUARD_READY, the device needs
 * IOS_DEVICE_RUNS_APPROVED; neither gate has any effect on the other target.
 * `gates` and `readConfig` exist for the selfchecks; real runs always use the defaults.
 */
export function iosStaticProblem(
  env: NodeJS.ProcessEnv = process.env,
  options: PreflightOptions = {},
  gates: IosGates = IOS_GATES,
  readConfig: (env: NodeJS.ProcessEnv) => IosConfig = readIosConfig,
): string | undefined {
  let config: IosConfig;
  try {
    config = readConfig(env);
  } catch (error) {
    return `iOS configuration: ${(error as Error).message}`;
  }
  // The build is tied to one approved staging environment; TEST_ENV must name exactly it.
  const tied = config.approvedBuild.stagingEnvironment;
  try {
    approvedOrigin(tied);
  } catch (error) {
    return `iOS configuration: ${config.bundleId} ${config.approvedBuild.build} is tied to "${tied}": ${(error as Error).message}`;
  }
  const selected = env.TEST_ENV?.trim();
  if (selected !== tied) {
    return `Safety gate (environment): TEST_ENV is "${selected ?? '(unset)'}", but ${config.bundleId} ${config.approvedBuild.version} (${config.approvedBuild.build}) is approved only for the staging environment "${tied}".`;
  }
  if (!config.approvedBuild.verifiedOnDevice) {
    return `Safety gate: ${config.bundleId} ${config.approvedBuild.version} (${config.approvedBuild.build}) is not yet verified on the device to call staging only.`;
  }
  if (config.target === 'simulator' && !gates.networkGuardReady) {
    return 'Safety gate (simulator): the request guard is not proven with the UI-test build yet (IOS_NETWORK_GUARD_READY).';
  }
  if (config.target === 'device' && !gates.deviceRunsApproved) {
    return 'Safety gate (device): physical-device runs are not approved yet (IOS_DEVICE_RUNS_APPROVED: backend confirmations and runtime evidence pending).';
  }
  const narrowTextOk = options.textScope === GUEST_FORM_TEXT_SCOPE && gates.guestFormTextVerified;
  if (!gates.textVerified && !narrowTextOk && !options.forInspection) {
    return 'Safety gate: iOS selectors and text are not verified yet (first inspection pending).';
  }
  return undefined;
}

/**
 * The functional projects on the narrow text gate: "ios" (guest, the app only) and
 * "ios-backoffice" (guest app checks of records the back office creates as Dev Root).
 */
export const TEXT_GATED_PROJECTS: readonly string[] = ['ios', 'ios-backoffice'];

/**
 * Why a test of a functional project (TEXT_GATED_PROJECTS) must not run: with the narrow text
 * gate, only the guest display tests may run while IOS_TEXT_VERIFIED is still closed; every other
 * test stays blocked, before any hook or app action. Undefined = may run.
 * Other projects (inspection, guarded launch) are not affected.
 */
export function outOfTextScopeReason(
  projectName: string,
  title: string,
  env: NodeJS.ProcessEnv = process.env,
  gates: IosGates = IOS_GATES,
  readConfig?: (env: NodeJS.ProcessEnv) => IosConfig,
): string | undefined {
  if (!TEXT_GATED_PROJECTS.includes(projectName)) return undefined;
  if ((GUEST_FORM_TEST_TITLES as readonly string[]).includes(title)) return undefined;
  // The force-update test: its own approval (iosForceUpdateBlocked), still under every other gate.
  if (title === appVersionTestTitles.forceUpdate && !iosForceUpdateBlocked(env)) return undefined;
  const problem = iosStaticProblem(env, {}, gates, readConfig);
  return problem
    ? `${problem} (this test is outside the narrow guest display text scope)`
    : undefined;
}

/** True when the Appium server answers /status as ready. */
export async function appiumReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL('/status', url), { signal: AbortSignal.timeout(5_000) });
    const body = (await response.json()) as { value?: { ready?: boolean } };
    return response.ok && body.value?.ready === true;
  } catch {
    return false;
  }
}

/** Reads the installed apps from the Mac with devicectl (read-only; no session, no launch). */
export async function readInstalledApps(udid: string): Promise<InstalledIosApp[]> {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ios-apps-')), 'apps.json');
  try {
    await promisify(execFile)(
      'xcrun',
      ['devicectl', 'device', 'info', 'apps', '--device', udid, '--json-output', out],
      {
        timeout: 60_000,
      },
    );
    const json = JSON.parse(fs.readFileSync(out, 'utf8')) as {
      result?: { apps?: InstalledIosApp[] };
    };
    return json.result?.apps ?? [];
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

/** Reads the apps installed on a simulator (read-only) via simctl and plutil. */
export async function readInstalledSimApps(udid: string): Promise<InstalledIosApp[]> {
  const run = promisify(execFile);
  const { stdout: plist } = await run('xcrun', ['simctl', 'listapps', udid], { timeout: 60_000 });
  const child = execFile('plutil', ['-convert', 'json', '-o', '-', '-']);
  const json = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout?.on('data', (c: string) => (out += c));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error('plutil failed'))));
    child.stdin?.end(plist);
  });
  const apps = JSON.parse(json) as Record<
    string,
    { CFBundleIdentifier?: string; CFBundleShortVersionString?: string; CFBundleVersion?: string }
  >;
  return Object.values(apps).map((a) => ({
    bundleIdentifier: a.CFBundleIdentifier ?? '',
    version: a.CFBundleShortVersionString,
    bundleVersion: a.CFBundleVersion,
  }));
}

/** The approved origin of the staging environment a build is tied to. */
export function stagingOriginOf(config: IosConfig): string {
  return approvedOrigin(config.approvedBuild.stagingEnvironment);
}

/**
 * Full preflight before a session: the static gates, then Appium readiness, then the build
 * actually installed on the device, then the app's stored backend setting (only reached when
 * everything before it passes). Every step fails closed.
 */
export async function iosRuntimeProblem(
  appiumURL: string,
  options: PreflightOptions = {},
  readStoredBackend?: StoredBackendReader,
): Promise<string | undefined> {
  const staticProblem = iosStaticProblem(process.env, options);
  if (staticProblem) return staticProblem;
  const config = readIosConfig();
  if (!(await appiumReady(appiumURL))) {
    return `Environment: Appium is not reachable at ${appiumURL}.`;
  }
  try {
    const apps =
      config.target === 'simulator'
        ? await readInstalledSimApps(config.udid)
        : await readInstalledApps(config.udid);
    const buildProblem = installedBuildProblem(apps, config.approvedBuild);
    if (buildProblem) return buildProblem;
  } catch (error) {
    return `Could not read the installed apps from the device: ${(error as Error).message}`;
  }
  // The STORED setting only (not proof of the server actually contacted).
  return storedBackendCheck(config, stagingOriginOf(config), readStoredBackend);
}
