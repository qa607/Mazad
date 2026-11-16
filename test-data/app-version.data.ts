import type { AppVersionInput } from '@pages/backend/app-version/app-version-form.page';
import type { Language } from '@typings';

/**
 * App version control (tests/mobile/android/app-version.backoffice.spec.ts): the back office adds
 * an app version above the installed build with Force Update on, the app shows its update dialog
 * at launch, and once the version is deleted again the app opens normally.
 *
 * Recorded on stg-154, 2026-11-14, with the Android app 8.2.2-stage: an Active Android row
 * "99.0.0" with Force Update on made the app show the dialog below at its next launch; deleting the
 * row (Delete > Confirmation > Ok) let it open normally again. No other row changed.
 */

/**
 * The version the test adds: far above any real build, so it is always "newer" and never mistaken
 * for a real release. The cleanup deletes every row with this device type and version.
 */
export const forceUpdateVersion = {
  android: {
    /** As the list shows it and as its search filter takes it. */
    deviceType: 'android',
    input: {
      appName: 'Mazad',
      deviceType: 'Android',
      appVersion: '99.0.0',
      status: 'Active',
      forceUpdate: true,
    } satisfies AppVersionInput,
  },
  ios: {
    deviceType: 'ios',
    input: {
      appName: 'Mazad',
      deviceType: 'iOS',
      appVersion: '99.0.0',
      status: 'Active',
      forceUpdate: true,
    } satisfies AppVersionInput,
  },
} as const;

/** The test title, shared by both apps (iOS lets exactly this one past its text gate when approved). */
export const appVersionTestTitles = {
  forceUpdate: 'A newer app version with Force Update shows the update dialog until it is deleted',
} as const;

/** The row as the App Versions list shows it after saving. */
export const forceUpdateRow = { appName: 'mazad', forceUpdate: 'Yes', status: 'Active' } as const;

/** The Android update dialog's text (app text, recorded 2026-11-14). */
export const forceUpdateDialogText: Record<
  Language,
  { title: string; description: string; update: string }
> = {
  en: {
    title: 'New Update',
    description: 'A newer version of the app is available now!',
    update: 'Update',
  },
  ar: {
    title: 'تحديث جديد للتطبيق',
    description: 'إصدار أحدث من التطبيق أصبح متوفراً الآن!',
    update: 'تحديث',
  },
};

/**
 * The iOS update dialog's text, recorded on the device 2026-11-14 (8.3 (1491), stg-154): the same
 * words as Android's. Arabic only: the iOS test runs in Arabic (QA owner, 2026-11-14).
 */
export const iosForceUpdateDialogText = {
  ar: forceUpdateDialogText.ar,
} as const;
