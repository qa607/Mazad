import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { MAZAD_ANDROID_APP } from '@mobile/android.session';

/**
 * The installed Mazad app's versionName, read from the device with adb (read-only), e.g.
 * "8.2.2-stage". Used as the expected value of the version line on More.
 */
export async function installedAndroidVersion(
  appPackage: string = MAZAD_ANDROID_APP.package,
): Promise<string> {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'Library/Android/sdk');
  const device = process.env.ANDROID_UDID ? ['-s', process.env.ANDROID_UDID] : [];
  const { stdout } = await promisify(execFile)(
    path.join(sdk, 'platform-tools', 'adb'),
    [...device, 'shell', 'dumpsys', 'package', appPackage],
    { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const version = /versionName=(\S+)/.exec(stdout)?.[1];
  if (!version) throw new Error(`Could not read the versionName of ${appPackage} from the device.`);
  return version;
}
