import type { Language } from '@typings';

/**
 * Mazad Android app — the More tab, as a guest. Recorded on staging (stg-154) from the live screens
 * of 8.2.2-stage on an emulator (Android 17), English and Arabic, 2026-11-11. Inspection was
 * read-only: Rate us and the social icons were never tapped; Privacy Policy was opened once and was
 * found to leave the app (it opens the external browser at the stg-154 website's privacy page,
 * `privacy_policy_link` from GET /v1/configuration).
 *
 * Layout (top to bottom): title; Favorites and Notifications icons (unlabeled Buttons); the guest
 * prompt; Settings → Language (العربية / English); "Follow us on Social Media" with four unlabeled
 * icons (Facebook, Instagram, TikTok, LinkedIn); "Important Links": About Us, Help Center, Terms &
 * Conditions, Privacy Policy, Rate us in Play Store; the app's device ID with Copy; the version line.
 * About Us and Terms open in-app pages (a title, a WebView and a Back button). In Arabic the Terms
 * row and its page title are spelled differently ("الشروط والأحكام" / "الشروط و الأحكام").
 * The device ID is app-specific (not the system android_id), so it is checked through Copy.
 */

/** The More rows that open a page inside the app (opened and closed by the tests). */
export type InAppPage = 'aboutUs' | 'terms';

/** Rows that leave the app (external browser or store): checked for presence only, never tapped. */
export type ExternalLink = 'privacy' | 'rateUs';

export interface MoreText {
  title: string;
  settings: string;
  language: string;
  socialHeading: string;
  importantLinks: string;
  rows: Record<InAppPage | ExternalLink | 'helpCenter', string>;
  /** Title of each in-app page (not always the row's spelling). */
  pageTitles: Record<InAppPage, string>;
  back: string;
  copy: string;
  /** The word before (EN) or after (AR) the version number. */
  versionLabel: string;
}

export const moreText: Record<Language, MoreText> = {
  en: {
    title: 'More',
    settings: 'Settings',
    language: 'Language',
    socialHeading: 'Follow us on Social Media',
    importantLinks: 'Important Links',
    rows: {
      aboutUs: 'About Us',
      helpCenter: 'Help Center',
      terms: 'Terms & Conditions',
      privacy: 'Privacy Policy',
      rateUs: 'Rate us in Play Store',
    },
    pageTitles: { aboutUs: 'About Us', terms: 'Terms & Conditions' },
    back: 'Back',
    copy: 'Copy',
    versionLabel: 'Version',
  },
  ar: {
    title: 'المزيد',
    settings: 'الإعدادات',
    language: 'اللغة',
    socialHeading: 'تابعنا على وسائل التواصل الاجتماعي',
    importantLinks: 'روابط مهمة',
    rows: {
      aboutUs: 'من نحن',
      helpCenter: 'مركز المساعدة',
      terms: 'الشروط والأحكام',
      privacy: 'سياسة الخصوصية',
      rateUs: 'قيّم التطبيق في المتجر',
    },
    pageTitles: { aboutUs: 'من نحن', terms: 'الشروط و الأحكام' },
    back: 'عودة',
    copy: 'نسخ',
    versionLabel: 'الإصدار',
  },
};

export const inAppPages: readonly InAppPage[] = ['aboutUs', 'terms'];
export const externalLinks: readonly ExternalLink[] = ['privacy', 'rateUs'];

/** Unlabeled icons on More: two in the header, four in the social section. */
export const moreIconCounts = { header: 2, social: 4 } as const;

/**
 * The version line for an installed versionName: the build suffix ("-stage") is not shown.
 * "8.2.2-stage" → "Version 8.2.2" / "الإصدار 8.2.2".
 */
export function versionLine(language: Language, versionName: string): string {
  return `${moreText[language].versionLabel} ${versionName.replace(/-.*$/, '')}`;
}

/** The app's device ID as shown on More (a hexadecimal string). */
export const deviceIdPattern = /^[0-9a-f]{16}$/;
