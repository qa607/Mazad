import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { IosConfig } from '@mobile/ios/ios.config';

/**
 * The app's STORED backend setting, checked before (preflight) and after (fixture teardown) a
 * physical-device run. It must equal the selected staging environment's approved origin; any
 * failure to read it refuses the run (fail closed).
 *
 * What it does NOT show: which server the app actually contacted, or that the setting stayed
 * the same during the run. Firebase Remote Config, DebugSwift, deep links and push
 * notifications are unverified ways the backend might change (see README, open questions).
 */

/** Reads one value from the app's preferences file on the device (read-only devicectl copy). */
export async function readStoredBackendFromDevice(
  udid: string,
  bundleId: string,
  stored: { preferencesFile: string; key: string },
): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-backend-'));
  const copy = path.join(dir, 'prefs.plist');
  const run = promisify(execFile);
  try {
    await run(
      'xcrun',
      [
        'devicectl',
        'device',
        'copy',
        'from',
        '--device',
        udid,
        '--domain-type',
        'appDataContainer',
        '--domain-identifier',
        bundleId,
        '--source',
        stored.preferencesFile,
        '--destination',
        copy,
      ],
      { timeout: 60_000 },
    );
    const { stdout } = await run('plutil', ['-extract', stored.key, 'raw', '-o', '-', copy], {
      timeout: 10_000,
    });
    return stdout.trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Why the stored value is not the expected staging origin, or undefined. */
export function storedBackendProblem(
  value: string | undefined,
  expectedOrigin: string,
  where: string,
): string | undefined {
  if (!value) return `The app's stored backend (${where}) is empty or missing: run refused.`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `The app's stored backend (${where}) is not a URL: run refused.`;
  }
  if (url.origin !== expectedOrigin) {
    return `The app's stored backend (${where}) is ${url.origin}, not the selected staging environment ${expectedOrigin}: run refused.`;
  }
  return undefined;
}

export type StoredBackendReader = typeof readStoredBackendFromDevice;

/**
 * Full check for one moment (before or after a run). Physical device only; the simulator has no
 * implementation and is therefore refused (fail closed).
 */
export async function storedBackendCheck(
  config: IosConfig,
  expectedOrigin: string,
  read: StoredBackendReader = readStoredBackendFromDevice,
): Promise<string | undefined> {
  const stored = config.approvedBuild.storedBackend;
  const where = `${stored.preferencesFile}: ${stored.key}`;
  if (config.target !== 'device') {
    return 'Stored backend verification is implemented for the physical device only: run refused.';
  }
  let value: string;
  try {
    value = await read(config.udid, config.bundleId, stored);
  } catch (error) {
    return `The app's stored backend (${where}) could not be read (${(error as Error).message.split('\n')[0]}): run refused.`;
  }
  return storedBackendProblem(value, expectedOrigin, where);
}
