import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/** A local port nothing listens on: every request through it fails at once. */
const DEAD_PROXY = '127.0.0.1:1';

/** `adb shell settings <args>` on the test device (ANDROID_UDID, or the only one connected). */
async function deviceSettings(...args: string[]): Promise<string> {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'Library/Android/sdk');
  const device = process.env.ANDROID_UDID ? ['-s', process.env.ANDROID_UDID] : [];
  const { stdout } = await promisify(execFile)(
    path.join(sdk, 'platform-tools', 'adb'),
    [...device, 'shell', 'settings', ...args],
    { timeout: 15_000 },
  );
  return stdout.trim();
}

/**
 * Runs `action` while every HTTP request of the Android test device fails (global proxy set to a
 * closed local port), then restores the device's proxy setting, also when `action` throws.
 * Emulator/test device only: it changes the device's proxy setting, nothing else.
 *
 * Used instead of turning the network off: offline, the Mazad app shows a "no internet" dialog
 * that cannot be closed; with failing requests it shows a "technical error" dialog that can.
 * Restoring sets ":0" first, because deleting the setting alone leaves the proxy in use (seen on
 * the emulator, 2026-11-15).
 */
export async function withDeviceRequestsFailing<T>(action: () => Promise<T>): Promise<T> {
  const previous = await deviceSettings('get', 'global', 'http_proxy');
  await deviceSettings('put', 'global', 'http_proxy', DEAD_PROXY);
  try {
    return await action();
  } finally {
    await deviceSettings('put', 'global', 'http_proxy', ':0');
    const hadProxy = previous !== '' && !['null', ':0', DEAD_PROXY].includes(previous);
    if (hadProxy) await deviceSettings('put', 'global', 'http_proxy', previous);
    else await deviceSettings('delete', 'global', 'http_proxy');
  }
}
