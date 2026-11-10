import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const isPrivateIPv4 = (ip: string): boolean =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

function adbPath(): string {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(homedir(), 'Library', 'Android', 'sdk');
  const adb = join(sdk, 'platform-tools', 'adb');
  return existsSync(adb) ? adb : 'adb';
}

/** stdout of an adb command, including when it exits non-zero (ping does on lost ICMP). */
async function adb(args: string[]): Promise<string> {
  try {
    return (await run(adbPath(), args, { timeout: 15_000 })).stdout;
  } catch (error) {
    const { stdout } = error as { stdout?: string };
    if (typeof stdout === 'string') return stdout;
    throw error;
  }
}

/** The device Appium will use: ANDROID_UDID, or the only connected device. */
async function deviceSerial(): Promise<string | undefined> {
  if (process.env.ANDROID_UDID) return process.env.ANDROID_UDID;
  const devices = (await adb(['devices']))
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
  return devices.length === 1 ? devices[0] : undefined;
}

/**
 * Infrastructure preflight for the Android tests. When the Mac reaches a host through VPN DNS
 * (it resolves to an internal IP), the device must resolve it to an internal IP too; otherwise
 * the app talks to the public endpoint, which staging rejects (403), and every test would fail
 * for a network reason. Returns the skip reason, or undefined when the network is fine or the
 * check does not apply (no VPN DNS on the Mac, adb unavailable, or no single device to check).
 */
export async function androidNetworkProblem(host: string): Promise<string | undefined> {
  try {
    const { address: macIP } = await lookup(host, { family: 4 });
    if (!isPrivateIPv4(macIP)) return undefined;

    const serial = await deviceSerial();
    if (!serial) return undefined;

    const ping = await adb(['-s', serial, 'shell', 'ping', '-c', '1', '-W', '2', host]);
    const deviceIP = /^PING \S+ \(([\d.]+)\)/m.exec(ping)?.[1];
    if (!deviceIP) {
      return (
        `Environment: the Android device cannot resolve ${host} (VPN DNS unavailable?). ` +
        'Run npm run emulator:check.'
      );
    }
    if (!isPrivateIPv4(deviceIP)) {
      return (
        `Environment: the Android device resolves ${host} to the public endpoint ${deviceIP} ` +
        `instead of the VPN address ${macIP}, so staging would reject it (403). ` +
        'Restart the emulator with NetBird connected: npm run emulator:start.'
      );
    }
    return undefined;
  } catch {
    // The preflight never blocks a run on its own failure; the tests report real problems.
    return undefined;
  }
}
