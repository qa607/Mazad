import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { MAZAD_ANDROID_APP } from '@mobile/android.session';

/**
 * Android counterpart of the iOS stored-backend check (src/mobile/ios/app-backend-check.ts), for a
 * release (non-debuggable) build whose settings cannot be read. It reads the INSTALLED build from
 * the device and requires the selected environment's host among the backend addresses compiled
 * into its code. Read-only: the APK is copied to a temporary folder, searched and deleted; nothing
 * on the device changes.
 *
 * Why this check: the 8.2.2-stage build compiles in mazad-v3.motory.dev (and the production host)
 * but not stg-154, and mazad-v3 resolves to the same internal IP as stg-154, so neither DNS nor the
 * open connections can tell them apart. On 2026-11-11 its Contact Us message reached another
 * environment, while the read-only tests passed because both show the same content.
 *
 * Limit: a build that switches its backend at run time (an in-app environment setting) is not
 * detected; like the iOS check, this is about the build, not proof of the server contacted.
 */

const adb = () =>
  path.join(
    process.env.ANDROID_HOME ||
      process.env.ANDROID_SDK_ROOT ||
      path.join(os.homedir(), 'Library/Android/sdk'),
    'platform-tools',
    'adb',
  );
const deviceArgs = () => (process.env.ANDROID_UDID ? ['-s', process.env.ANDROID_UDID] : []);

/** True when any of the APK's dex files contains `needle` (streamed; never held in memory whole). */
function apkCodeContains(apk: string, needle: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const target = Buffer.from(needle, 'utf8');
    const child = spawn('unzip', ['-p', apk, 'classes*.dex']);
    let tail = Buffer.alloc(0);
    let found = false;
    child.stdout.on('data', (chunk: Buffer) => {
      if (found) return;
      const window = Buffer.concat([tail, chunk]);
      if (window.includes(target)) {
        found = true;
        child.kill();
        return;
      }
      tail = window.subarray(Math.max(0, window.length - target.length));
    });
    child.on('error', reject);
    child.on('close', () => resolve(found));
  });
}

/**
 * Why the installed Mazad build must not be used against `expectedHost`, or undefined when its
 * code contains that host. Fails closed: a build that cannot be read is a problem too.
 */
export async function androidBuildBackendProblem(
  expectedHost: string,
  appPackage: string = MAZAD_ANDROID_APP.package,
): Promise<string | undefined> {
  const run = promisify(execFile);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazad-apk-'));
  try {
    const { stdout } = await run(adb(), [...deviceArgs(), 'shell', 'pm', 'path', appPackage], {
      timeout: 30_000,
    });
    const remote = stdout
      .split('\n')
      .map((line) => line.replace(/^package:/, '').trim())
      .find((line) => line.endsWith('/base.apk'));
    if (!remote) return `Android backend check: ${appPackage} is not installed on the device.`;
    const local = path.join(dir, 'base.apk');
    await run(adb(), [...deviceArgs(), 'pull', remote, local], { timeout: 120_000 });
    if (await apkCodeContains(local, expectedHost)) return undefined;
    return (
      `Android backend check: the installed ${appPackage} build has no "${expectedHost}" address ` +
      'compiled in, so it talks to another environment (8.2.2-stage uses mazad-v3.motory.dev). ' +
      'Install a build for this environment before running the Android tests.'
    );
  } catch (error) {
    return `Android backend check: could not read the installed build (${(error as Error).message.split('\n')[0]}).`;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
