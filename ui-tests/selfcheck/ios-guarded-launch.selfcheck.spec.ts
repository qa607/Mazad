import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  caCheck,
  dnsCheck,
  type GuardedLaunchDeps,
  guardedLaunchStaticChecks,
  isPrivateIpv4,
  runGuardedLaunch,
  simulatorCheck,
} from '../../src/mobile/ios/guarded-launch';
import {
  APPROVED_IOS_BUILDS,
  type IosConfig,
  launchArgumentsProblem,
  readIosConfig,
} from '../../src/mobile/ios/ios.config';
import { IOS_STAGING_HOST, type IosGuard } from '../../src/mobile/ios/ios-guard';
import { restartIosApp, startIosSession } from '../../src/mobile/ios/ios.session';
import type { NetworkEvent } from '../../src/network/request-guard';
import { ensureTestCa } from '../../src/network/test-ca';
import { expect, test } from '../support/fixtures';

/** Offline: fake simulator, Appium, DNS and guard. Nothing is launched or requested. */
const SIM_UDID = '11111111-2222-3333-4444-555555555555';
const PORT = 8899;
const DEVICE_BUILD = APPROVED_IOS_BUILDS[0];
const simConfig: IosConfig = {
  ...readIosConfig({ IOS_BUNDLE_ID: DEVICE_BUILD.bundleId }),
  target: 'simulator',
  udid: SIM_UDID,
  guardProxy: { host: '127.0.0.1', port: PORT },
  approvedBuild: { ...DEVICE_BUILD, target: 'simulator' },
};
const fakeReadConfig = () => simConfig;
const GOOD_ENV = { IOS_STAGING_EXPECTED_IP: '10.152.0.9', IOS_LAUNCH_OBSERVE_SECONDS: '10' };
const caDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guarded-launch-ca-'));
const CA_PEM = fs.readFileSync(ensureTestCa(caDir).certPath, 'utf8');
test.afterAll(() => fs.rmSync(caDir, { recursive: true, force: true }));

interface Fake {
  calls: string[];
  guard: { events: NetworkEvent[]; allowed: { method: string; target: string }[]; halted: boolean };
  deps: GuardedLaunchDeps;
}

function fake(over: Partial<GuardedLaunchDeps> = {}, opts: { haltAfter?: number } = {}): Fake {
  const calls: string[] = [];
  let guardUp = false;
  let sleeps = 0;
  const state = {
    events: [] as NetworkEvent[],
    allowed: [] as { method: string; target: string }[],
    halted: false,
  };
  const guard: IosGuard = {
    events: state.events,
    allowed: state.allowed,
    get halted() {
      return state.halted;
    },
    close: () => {
      calls.push('guard.close');
      guardUp = false;
      return Promise.resolve();
    },
  };
  const deps: GuardedLaunchDeps = {
    readCaCert: () => CA_PEM,
    listSimulators: () => {
      calls.push('listSimulators');
      return Promise.resolve({
        devices: {
          'iOS-27': [{ udid: SIM_UDID, state: 'Booted', isAvailable: true, name: 'iPhone' }],
        },
      });
    },
    readInstalledSimApps: () => {
      calls.push('readInstalledSimApps');
      return Promise.resolve([
        {
          bundleIdentifier: DEVICE_BUILD.bundleId,
          version: DEVICE_BUILD.version,
          bundleVersion: DEVICE_BUILD.build,
        },
      ]);
    },
    resolveHost: () => {
      calls.push('resolveHost');
      return Promise.resolve(['10.152.0.9']);
    },
    appiumReady: () => {
      calls.push('appiumReady');
      return Promise.resolve(true);
    },
    portInUse: () => {
      calls.push(`portInUse:${guardUp}`);
      return Promise.resolve(guardUp);
    },
    startGuard: () => {
      calls.push('startGuard');
      guardUp = true;
      return Promise.resolve(guard);
    },
    startSession: () => {
      calls.push('startSession');
      // The app's first request goes through the guard to staging.
      state.allowed.push({ method: 'GET', target: `${IOS_STAGING_HOST}/api/v1/config` });
      return Promise.resolve({
        screenshot: () => Promise.resolve('cG5n'),
        terminateApp: () => {
          calls.push('terminateApp');
          return Promise.resolve();
        },
        close: () => {
          calls.push('session.close');
          return Promise.resolve();
        },
      });
    },
    sleep: () => {
      sleeps++;
      if (opts.haltAfter && sleeps >= opts.haltAfter) {
        state.events.push({
          kind: 'unexpected',
          method: 'POST',
          target: `${IOS_STAGING_HOST}/api/v1/login`,
          reason: 'not approved',
        });
        state.halted = true;
      }
      return Promise.resolve();
    },
    now: () => new Date(),
    ...over,
  };
  return { calls, guard: state, deps };
}

test.describe('iOS guarded launch: static prerequisites (selfcheck)', () => {
  test('refuses the physical device target', () => {
    const { plan, checks } = guardedLaunchStaticChecks({
      ...GOOD_ENV,
      IOS_BUNDLE_ID: DEVICE_BUILD.bundleId,
    });
    expect(plan).toBeUndefined();
    expect(checks.find((c) => c.name === 'simulator target')?.ok).toBe(false);
  });

  test('a simulator config without an allowlisted simulator build is refused', () => {
    const { plan, checks } = guardedLaunchStaticChecks({
      ...GOOD_ENV,
      IOS_TARGET: 'simulator',
      IOS_SIM_UDID: SIM_UDID,
      IOS_GUARD_PROXY: `127.0.0.1:${PORT}`,
      IOS_BUNDLE_ID: DEVICE_BUILD.bundleId,
    });
    expect(plan).toBeUndefined();
    expect(checks[0]).toMatchObject({ name: 'configuration', ok: false });
  });

  test('requires a confirmed private IP, all account switches off, and a bounded window', () => {
    const problems = (env: NodeJS.ProcessEnv) =>
      guardedLaunchStaticChecks(env, fakeReadConfig)
        .checks.filter((c) => !c.ok)
        .map((c) => c.name);
    expect(problems(GOOD_ENV)).toEqual([]);
    expect(problems({ ...GOOD_ENV, IOS_STAGING_EXPECTED_IP: '' })).toEqual(['expected staging IP']);
    expect(problems({ ...GOOD_ENV, IOS_STAGING_EXPECTED_IP: '80.238.236.3' })).toEqual([
      'expected staging IP',
    ]);
    for (const name of [
      'MAZAD_ALLOW_OTP_REQUESTS',
      'MAZAD_ALLOW_PASSWORD_RESET',
      'MAZAD_ALLOW_LOGOUT',
      'IOS_ALLOW_ACCOUNT_ACTIONS',
      'IOS_ALLOW_PASSWORD_RESET',
    ]) {
      expect(problems({ ...GOOD_ENV, [name]: 'true' }), name).toEqual([
        'account-action switches off',
      ]);
    }
    for (const bad of ['5', '121', '1.5', 'x']) {
      expect(problems({ ...GOOD_ENV, IOS_LAUNCH_OBSERVE_SECONDS: bad }), bad).toEqual([
        'observation window',
      ]);
    }
  });

  test('private IPv4 detection', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      expect(isPrivateIpv4(ip), ip).toBe(true);
    }
    for (const ip of ['80.238.236.3', '172.32.0.1', '8.8.8.8', '10.0.0', '10.0.0.256', '']) {
      expect(isPrivateIpv4(ip), ip).toBe(false);
    }
  });
});

test.describe('iOS guarded launch: runtime prerequisites (selfcheck)', () => {
  test('simulator must exist, be available and already booted (never booted here)', () => {
    const list = (state: string, isAvailable = true) => ({
      devices: { r: [{ udid: SIM_UDID, state, isAvailable, name: 'iPhone' }] },
    });
    expect(simulatorCheck(list('Booted'), SIM_UDID).ok).toBe(true);
    expect(simulatorCheck(list('Shutdown'), SIM_UDID).ok).toBe(false);
    expect(simulatorCheck(list('Booted', false), SIM_UDID).ok).toBe(false);
    expect(simulatorCheck(list('Booted'), '99999999-2222-3333-4444-555555555555').ok).toBe(false);
    expect(simulatorCheck({}, SIM_UDID).ok).toBe(false);
  });

  test('staging must resolve to exactly the confirmed IP', () => {
    expect(dnsCheck(['10.152.0.9'], '10.152.0.9').ok).toBe(true);
    expect(dnsCheck(['80.238.236.3'], '10.152.0.9').ok).toBe(false);
    expect(dnsCheck(['10.152.0.9', '80.238.236.3'], '10.152.0.9').ok).toBe(false);
    expect(dnsCheck([], '10.152.0.9').ok).toBe(false);
  });

  test('the test CA must exist and be valid now', () => {
    expect(caCheck(CA_PEM, new Date()).ok).toBe(true);
    expect(caCheck(null, new Date()).ok).toBe(false);
    expect(caCheck('not a cert', new Date()).ok).toBe(false);
    expect(caCheck(CA_PEM, new Date(Date.now() + 400 * 86_400_000)).ok).toBe(false);
  });

  const failing: [string, Partial<GuardedLaunchDeps>][] = [
    ['no CA', { readCaCert: () => null }],
    ['simulator shut down', { listSimulators: () => Promise.resolve({ devices: {} }) }],
    ['wrong build installed', { readInstalledSimApps: () => Promise.resolve([]) }],
    ['public DNS answer', { resolveHost: () => Promise.resolve(['80.238.236.3']) }],
    ['DNS failure', { resolveHost: () => Promise.reject(new Error('ENOTFOUND')) }],
    ['Appium down', { appiumReady: () => Promise.resolve(false) }],
    ['proxy port taken', { portInUse: () => Promise.resolve(true) }],
  ];
  for (const [name, over] of failing) {
    test(`rejects before any guard or launch: ${name}`, async () => {
      const f = fake(over);
      const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
      expect(result.verdict).toBe('rejected');
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(f.calls).not.toContain('startGuard');
      expect(f.calls).not.toContain('startSession');
    });
  }

  test('rejects (and closes the guard) when the guard is not listening', async () => {
    const f = fake({
      portInUse: () => Promise.resolve(false),
      startGuard: () => {
        f.calls.push('startGuard');
        return Promise.resolve({
          events: [],
          allowed: [],
          halted: false,
          close: () => {
            f.calls.push('guard.close');
            return Promise.resolve();
          },
        });
      },
    });
    const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
    expect(result.verdict).toBe('rejected');
    expect(f.calls).not.toContain('startSession');
    expect(f.calls).toContain('guard.close');
  });
});

test.describe('iOS guarded launch: run and evidence (selfcheck)', () => {
  test('order: checks, guard listening, one launch, observe, then app, session and guard closed', async () => {
    const f = fake();
    const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
    expect(result.verdict, result.reasons.join('; ')).toBe('pass');
    expect(f.calls).toEqual([
      'listSimulators',
      'readInstalledSimApps',
      'resolveHost',
      'appiumReady',
      'portInUse:false',
      'startGuard',
      'portInUse:true',
      'startSession',
      'terminateApp',
      'session.close',
      'guard.close',
    ]);
    expect(result.launchArguments).toEqual(['-MazadUITestProxy', `127.0.0.1:${PORT}`]);
    expect(result.observedSeconds).toBe(10);
    expect(result.requests?.allowed).toHaveLength(1);
    expect(result.cleanup.every((c) => c.ok)).toBe(true);
    expect(result.note).toMatch(/flags .* were not changed/);
  });

  test('an unexpected request stops the observation early and fails, with cleanup', async () => {
    const f = fake({}, { haltAfter: 3 });
    const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
    expect(result.verdict).toBe('fail');
    expect(result.observedSeconds).toBe(3);
    expect(result.reasons.join(' ')).toMatch(/unexpected request/);
    expect(f.calls.slice(-3)).toEqual(['terminateApp', 'session.close', 'guard.close']);
  });

  test('no request to staging fails (backend not proven)', async () => {
    const f = fake();
    const start = f.deps.startSession.bind(f.deps);
    f.deps.startSession = async (c) => {
      const s = await start(c);
      f.guard.allowed.length = 0;
      return s;
    };
    const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
    expect(result.verdict).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/No request to the staging host/);
  });

  test('a session that fails to start still closes the guard', async () => {
    const f = fake({ startSession: () => Promise.reject(new Error('WDA failed')) });
    const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
    expect(result.verdict).toBe('fail');
    expect(result.reasons[0]).toMatch(/WDA failed/);
    expect(f.calls.at(-1)).toBe('guard.close');
  });

  test('a cleanup failure fails the run', async () => {
    const f = fake();
    const start = f.deps.startSession.bind(f.deps);
    f.deps.startSession = async (c) => ({
      ...(await start(c)),
      close: () => Promise.reject(new Error('session stuck')),
    });
    const result = await runGuardedLaunch(GOOD_ENV, f.deps, fakeReadConfig);
    expect(result.verdict).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/session stuck/);
    expect(f.calls.at(-1)).toBe('guard.close');
  });
});

test.describe('iOS launch paths (selfcheck)', () => {
  test('both launch functions refuse a simulator config without the proxy argument', async () => {
    const noProxy = { ...simConfig, guardProxy: undefined };
    expect(launchArgumentsProblem(noProxy)).toMatch(/-MazadUITestProxy/);
    expect(
      launchArgumentsProblem({ ...simConfig, guardProxy: { host: '0.0.0.0', port: 1 } }),
    ).toBeTruthy();
    expect(launchArgumentsProblem(simConfig)).toBeUndefined();
    expect(
      launchArgumentsProblem(readIosConfig({ IOS_BUNDLE_ID: DEVICE_BUILD.bundleId })),
    ).toBeUndefined();
    // Throws before contacting Appium (the URL is never used).
    await expect(startIosSession('http://127.0.0.1:9', noProxy)).rejects.toThrow(
      /-MazadUITestProxy/,
    );
    const calls: unknown[] = [];
    const driver = {
      execute: (...a: unknown[]) => {
        calls.push(a);
        return Promise.resolve();
      },
    } as unknown as Parameters<typeof restartIosApp>[0];
    await expect(restartIosApp(driver, noProxy)).rejects.toThrow(/-MazadUITestProxy/);
    expect(calls).toEqual([]);
  });

  test('no iOS code launches or relaunches the app outside the two guarded functions', () => {
    const root = path.resolve(__dirname, '..', '..');
    const dirs = [
      'src/mobile/ios',
      'src/fixtures',
      'tests-ios',
      'ui-tests/ios',
      'ui-tests/support/ios',
    ];
    const files = dirs.flatMap((d) =>
      fs
        .readdirSync(path.join(root, d), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(d, f)),
    );
    const iosFiles = files.filter((f) => !f.startsWith('src/fixtures') || f.includes('ios'));
    // Launch primitives: only ios.session.ts / ios.config.ts may use them.
    const rules: [RegExp, string[]][] = [
      [
        /['"]mobile: (activateApp|openUrl|deepLink|backgroundApp)['"]|\.(activateApp|launchApp|deepLink)\(|(?<!request)\.url\(/,
        [],
      ],
      [
        /['"]mobile: launchApp['"]/,
        ['src/mobile/ios/ios.session.ts', 'src/mobile/ios/spec-driver.ts'],
      ],
      [/\bremote\(/, ['src/mobile/ios/ios.session.ts']],
      [/appium:processArguments|appium:autoLaunch/, ['src/mobile/ios/ios.config.ts']],
    ];
    expect(iosFiles.length).toBeGreaterThan(10);
    for (const [pattern, allowed] of rules) {
      const hits = iosFiles.filter((f) =>
        pattern.test(fs.readFileSync(path.join(root, f), 'utf8')),
      );
      expect(hits, String(pattern)).toEqual(allowed);
    }
    // Sessions start only through startIosSession, from the known callers.
    const starters = iosFiles.filter((f) =>
      /startIosSession\(/.test(fs.readFileSync(path.join(root, f), 'utf8')),
    );
    expect(starters.sort()).toEqual(
      [
        'src/fixtures/ios.fixture.ts',
        'src/mobile/ios/guarded-launch.runner.ts',
        'src/mobile/ios/ios.session.ts',
        'ui-tests/support/ios/ios-ui-fixtures.ts',
      ].sort(),
    );
  });
});
