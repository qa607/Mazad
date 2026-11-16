import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { MAZAD_ANDROID_APP } from '@mobile/android.session';

const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';

/** stdout of an adb command on the test device (ANDROID_UDID, or the only device). */
async function adb(args: string[]): Promise<string> {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'Library/Android/sdk');
  const device = process.env.ANDROID_UDID ? ['-s', process.env.ANDROID_UDID] : [];
  const { stdout } = await promisify(execFile)(
    path.join(sdk, 'platform-tools', 'adb'),
    [...device, ...args],
    { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout;
}

/** Whether the app may post notifications (Android's notification permission is granted). */
export async function notificationPermissionGranted(
  appPackage: string = MAZAD_ANDROID_APP.package,
): Promise<boolean> {
  const out = await adb(['shell', 'dumpsys', 'package', appPackage]);
  return out.includes(`${POST_NOTIFICATIONS}: granted=true`);
}

/** One notification the app has posted, as the notification shade shows it. */
export interface PostedNotification {
  channel: string;
  title: string;
  text: string;
}

/**
 * The app's notifications currently in the notification shade (read-only, from
 * Android's notification service, so grouped or collapsed ones are included). The staging app's
 * own network logger ("Recording HTTP activity") and group summaries without text are left out.
 * Stopping the app (a restart) clears them.
 */
export async function postedNotifications(
  appPackage: string = MAZAD_ANDROID_APP.package,
): Promise<PostedNotification[]> {
  const out = await adb(['shell', 'dumpsys', 'notification', '--noredact']);
  const found: PostedNotification[] = [];
  for (const block of out.split('NotificationRecord(').slice(1)) {
    if (!block.includes(`pkg=${appPackage} `)) continue;
    const channel = /channel=(\S+)/.exec(block)?.[1] ?? '';
    const title = /android\.title=String \((.*)\)\s*$/m.exec(block)?.[1] ?? '';
    const text = /android\.text=String \((.*)\)\s*$/m.exec(block)?.[1] ?? '';
    if (!text || channel.startsWith('chucker')) continue;
    found.push({ channel, title, text });
  }
  return found;
}
