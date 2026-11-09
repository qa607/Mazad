import { execFile } from 'node:child_process';
import { promises as dns } from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GuardedLaunchDeps, LaunchSession } from '@mobile/ios/guarded-launch';
import { IOS_TEST_CA_DIR, startIosGuard } from '@mobile/ios/ios-guard';
import { appiumReady, readInstalledSimApps } from '@mobile/ios/ios-preflight';
import { startIosSession } from '@mobile/ios/ios.session';

/** True when something accepts TCP connections on host:port (local only). */
export function portInUse(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (used: boolean) => {
      socket.destroy();
      resolve(used);
    };
    socket.setTimeout(1_000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** The real implementations. Every external effect of the guarded launch goes through here. */
export function realGuardedLaunchDeps(appiumURL: string): GuardedLaunchDeps {
  return {
    readCaCert: () => {
      const file = path.join(IOS_TEST_CA_DIR, 'mazad-qa-test-ca.pem');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    },
    // Read-only: lists simulators, never boots one.
    listSimulators: async () => {
      const { stdout } = await promisify(execFile)(
        'xcrun',
        ['simctl', 'list', 'devices', '--json'],
        { timeout: 30_000 },
      );
      return JSON.parse(stdout) as unknown;
    },
    readInstalledSimApps,
    // The Mac's system resolver: the one the simulator uses.
    resolveHost: async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address),
    appiumReady: () => appiumReady(appiumURL),
    portInUse,
    startGuard: startIosGuard,
    startSession: async (config): Promise<LaunchSession> => {
      // The session start launches the app with iosLaunchArguments (-MazadUITestProxy).
      const driver = await startIosSession(appiumURL, config);
      return {
        screenshot: () => driver.takeScreenshot(),
        terminateApp: async () => {
          await driver.execute('mobile: terminateApp', { bundleId: config.bundleId });
        },
        close: () => driver.deleteSession(),
      };
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date(),
  };
}
