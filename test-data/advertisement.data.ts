import type { AdvertisementInput } from '@pages/backend/content/advertisement.page';
import type { Language } from '@typings';
import { uniqueDigits } from '@utils/unique';

/**
 * Advertisements end to end: what the back office publishes opens in the Android and iOS apps.
 *
 * Recorded on stg-154, 2026-11-15 (Android 8.2.2-stage, iOS 8.3):
 * - The apps show the published advertisement as a bottom sheet at launch: an "إعلان" badge, the
 *   title, the sub title and one button. GET /v1/configuration returns it as `advertisement`
 *   (null when none is published). Only one advertisement can be published at a time: publishing
 *   one unpublishes the others (the back office says so when publishing).
 * - An app shows each advertisement once per install (it remembers the IDs it has shown), so every
 *   run creates its own QA-AUTO advertisement. The back office has no Delete button; its delete
 *   action marks the advertisement Deleted, but the list still shows it.
 * - Tapping the button closes the sheet and adds 1 to the advertisement's Click Count.
 * - The Android app shows no advertisement while an app update is pending (configuration
 *   update_available ≠ 0). On stg-154 the 8.2.2-stage build always has one, because the Active
 *   Android row "8.2.2" ranks above it, so the Android test sets that row In Active while the app
 *   opens, then back to Active (QA owner, 2026-11-15). iOS 8.3 has no pending update.
 */
export const testAdvertisementPrefix = 'QA-AUTO';

/** A new QA-AUTO advertisement for the apps only (Platform Mobile), ending tomorrow. */
export function newQaAdvertisement(): AdvertisementInput {
  const stamp = uniqueDigits(7);
  return {
    title: `${testAdvertisementPrefix} ${stamp} إعلان تجريبي`,
    titleEn: `${testAdvertisementPrefix} ${stamp} Test advertisement`,
    subTitle: 'إعلان اختبار آلي يُحذف خلال دقائق',
    subTitleEn: 'Automated test advertisement, removed within minutes',
    btnText: 'حسناً',
    btnTextEn: 'OK',
    // The app's own home page, opened inside the app (Internal).
    btnLink: 'https://motorymazad.com/ar',
    btnLinkEn: 'https://motorymazad.com/en',
    linkType: 'internal',
    platform: 'mobile',
    endInDays: 1,
  };
}

/** What the app shows of an advertisement, in the app language. */
export function advertisementShown(
  ad: AdvertisementInput,
  lang: Language,
): { title: string; subTitle: string; button: string; link: string } {
  return lang === 'ar'
    ? { title: ad.title, subTitle: ad.subTitle, button: ad.btnText, link: ad.btnLink }
    : { title: ad.titleEn, subTitle: ad.subTitleEn, button: ad.btnTextEn, link: ad.btnLinkEn };
}

/** The badge above the title (recorded in Arabic only). */
export const advertisementBadge = { ar: 'إعلان' } as const;

/** Apps in this suite run in Arabic (one advertisement, shown once, per device and run). */
export const advertisementAppLanguages = [
  'ar',
] as const satisfies readonly (keyof typeof advertisementBadge)[];

/**
 * The App Versions row that keeps an update pending for the Android test build on stg-154, and
 * the status it is paused to while the app opens.
 */
export const androidPendingUpdateRow = {
  /** As the list shows it and as its search filter takes it. */
  deviceType: 'android',
  appVersion: '8.2.2',
  activeStatus: 'Active',
  pausedStatus: 'In Active',
} as const;

/**
 * Test titles. The iOS one is also how its own approval lets it past the iOS text gate
 * (iosAdvertisementBlocked in src/mobile/ios/ios-preflight.ts).
 */
export const advertisementTestTitles = {
  ios: 'A published advertisement opens at launch with its text, and its button counts a click',
} as const;

/** How long an app gets after a launch to show the advertisement. */
export const advertisementShowTimeout = 30_000;

/**
 * How long the Android app gets at the first launch after publishing. It decides at launch from
 * the configuration it loaded at its previous launch, so the advertisement can first open at the
 * second launch; and an advertisement unpublished since then still opens once (seen 2026-11-15).
 */
export const androidFirstLaunchWait = 15_000;
