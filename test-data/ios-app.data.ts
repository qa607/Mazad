import { getTranslator } from '@locales';
import { mobileAppText } from '@test-data/mobile-app.data';
import type { Language } from '@typings';

/**
 * Text the iOS screen objects look for, per language.
 *
 * NOT YET VERIFIED ON iOS: the iOS app has not been inspected (it may not be launched until the
 * staging and network-safety checks pass). The values below are candidates taken from the
 * recorded Android app text (test-data/mobile-app.data.ts) and from backend-driven text shared
 * by every platform (src/locales). Each value must be confirmed against the iOS app's page
 * source at first inspection; set IOS_TEXT_VERIFIED to true only after that.
 */
export const IOS_TEXT_VERIFIED = false;

export type IosContactField = 'name' | 'email' | 'mobile' | 'message';

/**
 * Help Center and Contact Form text, observed on the device 2026-11-11 (build 8.3 (1491)). Flat, with
 * contact-prefixed keys: the coverage selfchecks read every app text one level deep, by key.
 */
export interface IosContactUsText {
  contactHelpCenter: string;
  /** A Help Center category (served by GET /v1/faq-list; recorded so the iOS run needs no API call). */
  contactCategory: string;
  contactCantFindAnswer: string;
  contactUsLink: string;
  contactFormTitle: string;
  contactIntro: string;
  contactNameLabel: string;
  contactEmailLabel: string;
  contactMobileLabel: string;
  contactMessageLabel: string;
  contactNamePlaceholder: string;
  contactEmailPlaceholder: string;
  contactMobilePlaceholder: string;
  contactMessagePlaceholder: string;
}

/** The fixed country code beside Mobile Number (the same in both languages; not language text). */
export const IOS_CONTACT_MOBILE_PREFIX = '+966';

/** Each field's label, from the recorded text. */
export function contactLabels(text: IosContactUsText): Record<IosContactField, string> {
  return {
    name: text.contactNameLabel,
    email: text.contactEmailLabel,
    mobile: text.contactMobileLabel,
    message: text.contactMessageLabel,
  };
}

/** Each field's placeholder, from the recorded text. */
export function contactPlaceholders(text: IosContactUsText): Record<IosContactField, string> {
  return {
    name: text.contactNamePlaceholder,
    email: text.contactEmailPlaceholder,
    mobile: text.contactMobilePlaceholder,
    message: text.contactMessagePlaceholder,
  };
}

export interface IosAppText {
  tabs: { home: string; more: string };
  languageOption: string;
  guestPrompt: string;
  entryChoiceLogin: string;
  loginButton: string;
  forgotPassword: string;
  sendButton: string;
  verifyButton: string;
  saveAndLoginButton: string;
  logoutConfirm: string;
  /** The logout sheet's cancel Button, observed on the device 2026-11-09 (build 8.3 (1491)). */
  logoutBack: string;
  /** The welcome sheet's registration choice and the first registration step, observed 2026-11-09. */
  createAccountChoice: string;
  registrationHeading: string;
  chooseAccountType: string;
  registrationNext: string;
  /** The guest My Bids and My Actions tabs, observed 2026-11-09 (build 8.3 (1491)). */
  bidsTab: string;
  actionsTab: string;
  bidsHeading: string;
  bidsLive: string;
  bidsClosed: string;
  bidsWon: string;
  bidsLost: string;
  bidsGuestMessage: string;
  bidsGuestLogin: string;
  actionsHeading: string;
  actionsNeeded: string;
  actionsPending: string;
  actionsGuestMessage: string;
  actionsGuestLogin: string;
  /** The guest Notifications and Favorites screens, observed 2026-11-09 (build 8.3 (1491)). */
  notificationsHeading: string;
  notificationsMessage: string;
  notificationsEnable: string;
  notificationsLater: string;
  favoritesHeading: string;
  favoritesLive: string;
  favoritesUpcoming: string;
  favoritesGuestMessage: string;
  favoritesGuestLogin: string;
  fingerprintPromptDismiss: string;
  contactUs: IosContactUsText;
  // Backend-driven text, identical on web and Android (confirmed), assumed shared by iOS.
  invalidCredentials: string;
  unregisteredPhone: string;
  incorrectOtp: string;
  passwordTooShort: string;
  resetPasswordHeading: string;
  otpVerificationHeading: string;
  newPasswordHeading: string;
}

const OBSERVED_LOGOUT_BACK = { en: 'Back', ar: 'عودة' } as const;
/** The first registration step (guest inspection 2026-11-09, build 8.3 (1491)). */
const OBSERVED_REGISTRATION = {
  en: { heading: 'Create a new account', chooseAccountType: 'Choose Account Type', next: 'Next' },
  ar: { heading: 'إنشاء حساب جديد', chooseAccountType: 'اختر نوع الحساب', next: 'التالي' },
} as const;

/** The guest My Bids and My Actions tabs (guest inspection 2026-11-09, build 8.3 (1491)). */
const OBSERVED_GUEST_TABS = {
  en: {
    bidsTab: 'Bids',
    actionsTab: 'Actions',
    bidsHeading: 'My Bids',
    bidsLive: 'Live',
    bidsClosed: 'Closed',
    bidsWon: 'Won',
    bidsLost: 'Lost',
    bidsGuestMessage: 'Create an account or log in to start bidding',
    bidsGuestLogin: 'Login/ Create an account',
    actionsHeading: 'My Actions',
    actionsNeeded: 'Action Needed',
    actionsPending: 'Pending',
    actionsGuestMessage: 'Log in to see auctions with actions needed',
    actionsGuestLogin: 'Login',
  },
  ar: {
    bidsTab: 'مزاداتي',
    actionsTab: 'إجراءاتي',
    bidsHeading: 'مزاداتي',
    bidsLive: 'الحالية',
    bidsClosed: 'المغلقة',
    bidsWon: 'الرابحة',
    bidsLost: 'الخاسرة',
    bidsGuestMessage: 'قم بإنشاء حساب أو تسجيل الدخول للمشاركة في أي مزاد',
    bidsGuestLogin: 'تسجيل الدخول/ إنشاء حساب',
    actionsHeading: 'إجراءاتي',
    actionsNeeded: 'تحتاج إلى إجراء',
    actionsPending: 'قيد الانتظار',
    actionsGuestMessage: 'سجّل الدخول لرؤية المزادات التي تحتاج إلى إجراء',
    actionsGuestLogin: 'تسجيل الدخول',
  },
} as const;

/** The guest Notifications (a push-notification pitch) and Favorites screens (inspection 2026-11-09, build 8.3 (1491)). */
const OBSERVED_GUEST_SCREENS = {
  en: {
    notificationsHeading: 'Turn on notifications now',
    notificationsMessage: 'To stay updated about auction status, and when new auctions are added',
    notificationsEnable: 'Turn on notifications',
    notificationsLater: 'Later',
    favoritesHeading: 'Favorite Auctions',
    favoritesLive: 'Live',
    favoritesUpcoming: 'Upcoming',
    favoritesGuestMessage: 'Create a new account or log in to add the auction to your favorites',
    favoritesGuestLogin: 'Login/ Create an account',
  },
  ar: {
    notificationsHeading: 'فعّل الإشعارات الآن ',
    notificationsMessage: 'لتصلك آخر الإشعارات عن حالة المزاد، وليتم إعلامك عند إضافة مزادات جديدة',
    notificationsEnable: 'تفعيل الإشعارات',
    notificationsLater: 'لاحقاً',
    favoritesHeading: 'المزادات المفضلة',
    favoritesLive: 'الحالية',
    favoritesUpcoming: 'القادمة',
    favoritesGuestMessage: 'قم بإنشاء حساب أو تسجيل الدخول لإضافة مزاد إلى المفضلة',
    favoritesGuestLogin: 'تسجيل الدخول/ إنشاء حساب',
  },
} as const;

/**
 * Help Center and Contact Form (guest inspection 2026-11-11, iPhone 11 Pro Max, build 8.3 (1491)).
 * The English intro uses a straight apostrophe ("we'll"), unlike the Android app's curly one.
 */
const OBSERVED_CONTACT_US: Record<Language, IosContactUsText> = {
  en: {
    contactHelpCenter: 'Help Center',
    contactCategory: 'About Company',
    contactCantFindAnswer: 'Can’t find your answer?',
    contactUsLink: 'Contact Us',
    contactFormTitle: 'Contact Form',
    contactIntro: "Or enter your information & we'll contact you",
    contactNameLabel: 'Name',
    contactEmailLabel: 'E-mail',
    contactMobileLabel: 'Mobile Number',
    contactMessageLabel: 'Message',
    contactNamePlaceholder: 'Enter your name',
    contactEmailPlaceholder: 'Enter your email',
    contactMobilePlaceholder: 'e.g. 0554235678',
    contactMessagePlaceholder: 'Enter your message',
  },
  ar: {
    contactHelpCenter: 'مركز المساعدة',
    contactCategory: 'عن الشركة',
    contactCantFindAnswer: 'لم تجد إجابة على استفسارك؟',
    contactUsLink: 'تواصل معنا',
    contactFormTitle: 'نموذج الاتصال',
    contactIntro: 'أو أدخل معلوماتك وسنتواصل معك',
    contactNameLabel: 'الاسم',
    contactEmailLabel: 'البريد الإلكتروني',
    contactMobileLabel: 'رقم الجوال',
    contactMessageLabel: 'الرسالة',
    contactNamePlaceholder: 'أدخل الاسم',
    contactEmailPlaceholder: 'أدخل البريد الإلكتروني',
    contactMobilePlaceholder: 'مثال: 0554235678',
    contactMessagePlaceholder: 'أدخل رسالتك',
  },
};

export function iosAppText(language: Language): IosAppText {
  const app = mobileAppText[language];
  const t = getTranslator(language);
  return {
    tabs: { home: app.bottomNav.home, more: app.bottomNav.more },
    languageOption: app.languageOption,
    guestPrompt: app.loginFlow.guestPrompt,
    entryChoiceLogin: app.loginFlow.entryChoiceLogin,
    loginButton: app.loginFlow.entryChoiceLogin,
    forgotPassword: app.loginFlow.formForgotPassword,
    sendButton: t('send'),
    verifyButton: t('verify'),
    saveAndLoginButton: t('saveAndLogin'),
    logoutConfirm: app.loginFlow.logoutConfirm,
    logoutBack: OBSERVED_LOGOUT_BACK[language],
    createAccountChoice: app.loginFlow.entryChoiceCreateAccount,
    registrationHeading: OBSERVED_REGISTRATION[language].heading,
    chooseAccountType: OBSERVED_REGISTRATION[language].chooseAccountType,
    registrationNext: OBSERVED_REGISTRATION[language].next,
    ...OBSERVED_GUEST_TABS[language],
    ...OBSERVED_GUEST_SCREENS[language],
    fingerprintPromptDismiss: app.loginFlow.fingerprintPromptDismiss,
    contactUs: OBSERVED_CONTACT_US[language],
    invalidCredentials: t('invalidCredentials'),
    unregisteredPhone: t('unregisteredPhone'),
    incorrectOtp: t('incorrectOtp'),
    passwordTooShort: t('passwordTooShort'),
    resetPasswordHeading: t('resetPasswordHeading'),
    otpVerificationHeading: t('otpVerificationHeading'),
    newPasswordHeading: t('newPasswordHeading'),
  };
}
