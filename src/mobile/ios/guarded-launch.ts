import { X509Certificate } from 'node:crypto';
import {
  type InstalledIosApp,
  type IosConfig,
  installedBuildProblem,
  iosLaunchArguments,
  launchArgumentsProblem,
  readIosConfig,
} from '@mobile/ios/ios.config';
import { backendEvidenceProblem, type IosGuard, IOS_STAGING_HOST } from '@mobile/ios/ios-guard';
import type { NetworkEvent } from '../../network/request-guard';

/**
 * Guarded launch (docs/ios-simulator-workflow.md step 6): launches the approved simulator UI-test
 * build ONCE behind the request guard, touches nothing on screen, records every request, then
 * closes the app and the session. It produces the evidence the code review needs before
 * `verifiedOnDevice` and `IOS_NETWORK_GUARD_READY` may change; it never changes them itself.
 *
 * It does not require those two flags (it exists to justify them), so it carries its own,
 * stricter prerequisites, all checked BEFORE the guard or the session starts:
 * simulator target and UDID, exact allowlisted bundle/version/build installed, the simulator
 * already booted (never booted here), the test CA present and valid, staging resolving to the
 * administrator-confirmed private IP, Appium ready, the proxy port free, and every
 * account-action switch off. The expected IP is only compared with what the Mac resolves;
 * nothing connects to it directly.
 */

/** Switches that must all be off: the launch performs no account action. */
export const ACCOUNT_SWITCHES = [
  'MAZAD_ALLOW_OTP_REQUESTS',
  'MAZAD_ALLOW_PASSWORD_RESET',
  'MAZAD_ALLOW_LOGOUT',
  'IOS_ALLOW_ACCOUNT_ACTIONS',
  'IOS_ALLOW_PASSWORD_RESET',
] as const;

export const OBSERVE_SECONDS = { default: 30, min: 10, max: 120 } as const;

export interface GuardedLaunchPlan {
  config: IosConfig;
  /** The staging private IP confirmed by the NetBird administrator (IOS_STAGING_EXPECTED_IP). */
  expectedIp: string;
  observeSeconds: number;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** What the guarded launch needs from the outside world (real implementations in the runner). */
export interface GuardedLaunchDeps {
  readCaCert(): string | null;
  listSimulators(): Promise<unknown>;
  readInstalledSimApps(udid: string): Promise<InstalledIosApp[]>;
  resolveHost(host: string): Promise<string[]>;
  appiumReady(): Promise<boolean>;
  portInUse(host: string, port: number): Promise<boolean>;
  startGuard(config: IosConfig): Promise<IosGuard>;
  startSession(config: IosConfig): Promise<LaunchSession>;
  sleep(ms: number): Promise<void>;
  now(): Date;
}

/** The launched app's session: only these calls exist, so no UI interaction is possible. */
export interface LaunchSession {
  screenshot(): Promise<string | null>;
  terminateApp(): Promise<void>;
  close(): Promise<void>;
}

export type Verdict = 'pass' | 'fail' | 'rejected';

export interface GuardedLaunchEvidence {
  startedAt: string;
  finishedAt: string;
  verdict: Verdict;
  reasons: string[];
  build?: { bundleId: string; version: string; build: string; udid: string };
  launchArguments?: string[];
  stagingHost: string;
  resolved?: string[];
  prerequisites: Check[];
  observedSeconds?: number;
  requests?: { allowed: { method: string; target: string }[]; blocked: NetworkEvent[] };
  halted?: boolean;
  cleanup: Check[];
  screenshot?: string | null;
  note: string;
}

const NOTE =
  'Verification flags (verifiedOnDevice, IOS_NETWORK_GUARD_READY) were not changed. ' +
  'They change only in code review, based on this evidence.';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** RFC 1918 private IPv4 address. */
export function isPrivateIpv4(ip: string): boolean {
  if (!IPV4.test(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Checks that need no device and no network. */
export function guardedLaunchStaticChecks(
  env: NodeJS.ProcessEnv,
  readConfig: (env: NodeJS.ProcessEnv) => IosConfig = readIosConfig,
): {
  plan?: GuardedLaunchPlan;
  checks: Check[];
} {
  const checks: Check[] = [];
  let config: IosConfig | undefined;
  try {
    config = readConfig(env);
    checks.push({
      name: 'configuration',
      ok: true,
      detail: `${config.bundleId} (${config.target})`,
    });
  } catch (error) {
    checks.push({ name: 'configuration', ok: false, detail: (error as Error).message });
  }
  if (config) {
    checks.push(
      config.target === 'simulator'
        ? { name: 'simulator target', ok: true, detail: config.udid }
        : {
            name: 'simulator target',
            ok: false,
            detail: 'The guarded launch is simulator-only (IOS_TARGET=simulator, IOS_SIM_UDID).',
          },
    );
    const argsProblem = launchArgumentsProblem(config);
    checks.push({
      name: 'proxy launch argument',
      ok: config.target === 'simulator' && !argsProblem,
      detail: argsProblem ?? iosLaunchArguments(config).join(' '),
    });
  }
  const on = ACCOUNT_SWITCHES.filter((name) => env[name] === 'true');
  checks.push({
    name: 'account-action switches off',
    ok: on.length === 0,
    detail: on.length ? `Turn off: ${on.join(', ')}` : 'all off',
  });
  const expectedIp = env.IOS_STAGING_EXPECTED_IP?.trim() ?? '';
  checks.push(
    isPrivateIpv4(expectedIp)
      ? { name: 'expected staging IP', ok: true, detail: expectedIp }
      : {
          name: 'expected staging IP',
          ok: false,
          detail:
            'Set IOS_STAGING_EXPECTED_IP to the private staging IP confirmed by the NetBird administrator (never a remembered value).',
        },
  );
  const raw = env.IOS_LAUNCH_OBSERVE_SECONDS?.trim();
  const observeSeconds = raw ? Number(raw) : OBSERVE_SECONDS.default;
  const observeOk =
    Number.isInteger(observeSeconds) &&
    observeSeconds >= OBSERVE_SECONDS.min &&
    observeSeconds <= OBSERVE_SECONDS.max;
  checks.push({
    name: 'observation window',
    ok: observeOk,
    detail: observeOk
      ? `${observeSeconds}s`
      : `IOS_LAUNCH_OBSERVE_SECONDS must be an integer from ${OBSERVE_SECONDS.min} to ${OBSERVE_SECONDS.max}.`,
  });
  const ok = checks.every((c) => c.ok);
  return { checks, plan: ok && config ? { config, expectedIp, observeSeconds } : undefined };
}

/** The test CA must exist already (trusted by `ios:sim trust-ca`) and be valid now. */
export function caCheck(pem: string | null, now: Date): Check {
  const name = 'test CA present and valid';
  if (!pem) {
    return { name, ok: false, detail: 'No test CA: run `npm run ios:sim -- trust-ca <sim-udid>`.' };
  }
  try {
    const cert = new X509Certificate(pem);
    const from = new Date(cert.validFrom);
    const to = new Date(cert.validTo);
    if (now < from || now > to) {
      return {
        name,
        ok: false,
        detail: `Test CA not valid now (valid ${cert.validFrom} to ${cert.validTo}).`,
      };
    }
    return { name, ok: true, detail: `valid until ${cert.validTo}` };
  } catch {
    return { name, ok: false, detail: 'The test CA file is not a readable certificate.' };
  }
}

/** The UDID must be an available simulator on this Mac, already booted. */
export function simulatorCheck(simctlJson: unknown, udid: string): Check {
  const name = 'simulator exists and is booted';
  const devices = (simctlJson as { devices?: Record<string, unknown[]> })?.devices ?? {};
  const match = Object.values(devices)
    .flat()
    .find((d) => (d as { udid?: string }).udid === udid) as
    { state?: string; isAvailable?: boolean; name?: string } | undefined;
  if (!match) return { name, ok: false, detail: `${udid} is not a simulator on this Mac.` };
  if (match.isAvailable === false) {
    return { name, ok: false, detail: `${match.name ?? udid} is not available.` };
  }
  if (match.state !== 'Booted') {
    return {
      name,
      ok: false,
      detail: `${match.name ?? udid} is ${match.state ?? 'not booted'}; boot it first (not done automatically).`,
    };
  }
  return { name, ok: true, detail: `${match.name ?? udid} (Booted)` };
}

/** Staging must resolve on the Mac (the simulator's resolver) to exactly the expected private IP. */
export function dnsCheck(addresses: string[], expectedIp: string): Check {
  const name = `${IOS_STAGING_HOST} resolves to the confirmed private IP`;
  if (!addresses.length) return { name, ok: false, detail: 'The staging host does not resolve.' };
  const wrong = addresses.filter((a) => a !== expectedIp);
  return wrong.length
    ? {
        name,
        ok: false,
        detail: `Resolves to ${addresses.join(', ')}, expected only ${expectedIp} (NetBird DNS not restored?).`,
      }
    : { name, ok: true, detail: addresses.join(', ') };
}

/** Pass only when the app reached staging, nothing unexpected was requested, and all was closed. */
export function evaluateEvidence(guard: IosGuard, cleanup: Check[]): string[] {
  const reasons: string[] = [];
  const unexpected = guard.events.filter((e) => e.kind === 'unexpected');
  if (guard.halted || unexpected.length) {
    reasons.push(
      `The guard blocked unexpected request(s): ${unexpected.map((e) => `${e.method} ${e.target} (${e.reason})`).join('; ') || 'halted'}.`,
    );
  }
  const backend = backendEvidenceProblem(guard);
  if (backend) reasons.push(backend);
  for (const c of cleanup.filter((c) => !c.ok)) reasons.push(`Cleanup: ${c.name}: ${c.detail}`);
  return reasons;
}

/**
 * Runs the guarded launch. Order: static checks, CA, simulator, installed build, DNS, Appium,
 * proxy port free → guard started and listening → session (launches the app with the proxy
 * argument) → observe without interaction (stops early if the guard halts) → terminate the app,
 * close the session, close the guard (always, even after an error) → evidence.
 */
export async function runGuardedLaunch(
  env: NodeJS.ProcessEnv,
  deps: GuardedLaunchDeps,
  /** Selfchecks only; the real run always uses readIosConfig (allowlist enforced). */
  readConfig: (env: NodeJS.ProcessEnv) => IosConfig = readIosConfig,
): Promise<GuardedLaunchEvidence> {
  const startedAt = deps.now().toISOString();
  const prerequisites: Check[] = [];
  const cleanup: Check[] = [];
  const evidence = (
    verdict: Verdict,
    reasons: string[],
    extra: Partial<GuardedLaunchEvidence> = {},
  ) =>
    ({
      startedAt,
      finishedAt: deps.now().toISOString(),
      verdict,
      reasons,
      stagingHost: IOS_STAGING_HOST,
      prerequisites,
      cleanup,
      note: NOTE,
      ...extra,
    }) satisfies GuardedLaunchEvidence;
  const rejected = (extra: Partial<GuardedLaunchEvidence> = {}) =>
    evidence(
      'rejected',
      prerequisites.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`),
      extra,
    );
  const attempt = async (name: string, fn: () => Promise<Check>): Promise<boolean> => {
    try {
      prerequisites.push(await fn());
    } catch (error) {
      prerequisites.push({ name, ok: false, detail: (error as Error).message });
    }
    return prerequisites[prerequisites.length - 1].ok;
  };

  const { plan, checks } = guardedLaunchStaticChecks(env, readConfig);
  prerequisites.push(...checks);
  if (!plan) return rejected();
  const { config, expectedIp, observeSeconds } = plan;
  const build = {
    bundleId: config.bundleId,
    version: config.approvedBuild.version,
    build: config.approvedBuild.build,
    udid: config.udid,
  };
  const proxy = config.guardProxy!; // Present: checked by 'proxy launch argument'.

  prerequisites.push(caCheck(deps.readCaCert(), deps.now()));
  if (!prerequisites.at(-1)!.ok) return rejected({ build });
  if (
    !(await attempt('simulator exists and is booted', async () =>
      simulatorCheck(await deps.listSimulators(), config.udid),
    ))
  ) {
    return rejected({ build });
  }
  if (
    !(await attempt('exact approved build installed', async () => {
      const problem = installedBuildProblem(
        await deps.readInstalledSimApps(config.udid),
        config.approvedBuild,
      );
      return {
        name: 'exact approved build installed',
        ok: !problem,
        detail: problem ?? `${build.version} (${build.build})`,
      };
    }))
  ) {
    return rejected({ build });
  }
  let resolved: string[] = [];
  if (
    !(await attempt('dns', async () => {
      resolved = await deps.resolveHost(IOS_STAGING_HOST);
      return dnsCheck(resolved, expectedIp);
    }))
  ) {
    return rejected({ build, resolved });
  }
  if (
    !(await attempt('Appium ready', async () => {
      const ready = await deps.appiumReady();
      return {
        name: 'Appium ready',
        ok: ready,
        detail: ready ? 'ready' : 'Appium is not reachable.',
      };
    }))
  ) {
    return rejected({ build, resolved });
  }
  if (
    !(await attempt('proxy port free', async () => {
      const used = await deps.portInUse(proxy.host, proxy.port);
      return {
        name: 'proxy port free',
        ok: !used,
        detail: used
          ? `${proxy.host}:${proxy.port} is already in use: refusing (the app could reach another proxy).`
          : `${proxy.host}:${proxy.port}`,
      };
    }))
  ) {
    return rejected({ build, resolved });
  }

  let guard: IosGuard | undefined;
  let session: LaunchSession | undefined;
  let screenshot: string | null = null;
  let observed = 0;
  const failures: string[] = [];
  try {
    guard = await deps.startGuard(config);
    const listening = await deps.portInUse(proxy.host, proxy.port);
    prerequisites.push({
      name: 'guard listening before launch',
      ok: listening,
      detail: listening ? `${proxy.host}:${proxy.port}` : 'The guard is not listening.',
    });
    if (!listening) return rejected({ build, resolved });

    session = await deps.startSession(config);
    while (observed < observeSeconds && !guard.halted) {
      await deps.sleep(1_000);
      observed++;
    }
    screenshot = await session.screenshot().catch(() => null);
  } catch (error) {
    failures.push(`Launch error: ${(error as Error).message}`);
  } finally {
    if (session) {
      await session.terminateApp().then(
        () => cleanup.push({ name: 'app terminated', ok: true, detail: '' }),
        (e: Error) => cleanup.push({ name: 'app terminated', ok: false, detail: e.message }),
      );
      await session.close().then(
        () => cleanup.push({ name: 'Appium session closed', ok: true, detail: '' }),
        (e: Error) => cleanup.push({ name: 'Appium session closed', ok: false, detail: e.message }),
      );
    }
    if (guard) {
      await guard.close().then(
        () => cleanup.push({ name: 'guard closed', ok: true, detail: '' }),
        (e: Error) => cleanup.push({ name: 'guard closed', ok: false, detail: e.message }),
      );
    }
  }
  if (!guard) return evidence('fail', failures, { build, resolved });
  const reasons = [...failures, ...evaluateEvidence(guard, cleanup)];
  return evidence(reasons.length ? 'fail' : 'pass', reasons, {
    build,
    resolved,
    launchArguments: iosLaunchArguments(config),
    observedSeconds: observed,
    requests: { allowed: guard.allowed, blocked: guard.events },
    halted: guard.halted,
    screenshot,
  });
}
