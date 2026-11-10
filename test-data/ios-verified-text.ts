import type { Language } from '@typings';
import { type IosAppText, iosAppText } from '@test-data/ios-app.data';

/**
 * NARROW iOS text gate: the exact English and Arabic text that the two guest display tests need,
 * as seen by the first physical-device inspection (reports/ios-inspection/{en,ar}.json,
 * 2026-11-09, build 8.3 (1491)). It is NOT IOS_TEXT_VERIFIED: that stays false and keeps every
 * other text-dependent test blocked. This gate only lets the tests named below run, and only
 * while the app text data still equals these recorded strings.
 *
 * The two tests need: the Home and More tab labels (language detection and navigation), the
 * language option labels (switching language), the guest prompt on More, the "Log In" choice on
 * the welcome sheet, the Forgot Password link and the Forgot Password heading. They type nothing
 * and submit nothing.
 */
export const GUEST_FORM_TEXT_SCOPE = 'guest-form-display' as const;

/** The only tests the narrow gate covers (titles, as declared in tests-ios/*.spec.ts). */
export const GUEST_FORM_TEST_TITLES = [
  'Login form shows the phone and password fields and Forgot Password',
  'Forgot Password opens from Login with the phone field',
  // Navigation only; needs no text beyond the Forgot Password link and the login form above.
  'Close returns from Forgot Password to Login',
  // Local validation: only synthetic values are typed (nothing is submitted), and no UI text beyond
  // the verified text is needed. Primary buttons are the only unlabeled Button of their screen.
  'Login form shows the Log In button',
  'Empty fields keep Log In disabled',
  'Empty phone number keeps Log In disabled',
  'Empty password keeps Log In disabled',
  'Empty phone number keeps Send disabled',
  // The enabled side of the same rules: made-up values are typed, and the button is checked but
  // NEVER tapped, so nothing is submitted.
  'Filled phone and password enable Log In',
  'A filled phone number enables Send',
  // Dealer login and logout: the logout item, the confirmation sheet and the signed-out state (guest prompt)
  // were observed on the device on 2026-11-09 in both languages.
  'Dealer login signs in and logout returns to the guest state',
  // Registration entry: navigation and display only (nothing is selected, typed or submitted); the text
  // below was observed on the device on 2026-11-09 in both languages.
  'Registration form opens from the welcome sheet',
  // Guest My Bids and My Actions tabs: navigation and display only (nothing is tapped but the tab); the text
  // below was observed on the device on 2026-11-09 in both languages.
  'Guest My Bids tab asks the guest to log in',
  'Guest My Actions tab asks the guest to log in',
  // Guest Notifications and Favorites screens (opened by the header icons of My Bids): navigation and display only;
  // the text below was observed on the device on 2026-11-09 in both languages.
  'Guest Notifications screen offers to turn on notifications',
  'Guest Favorites screen asks the guest to log in',
  // The Forgot Password phone field's local behaviour, as observed on the device on 2026-11-09 (see
  // test-data/ios-phone-input.data.ts). Only synthetic values are typed and Send is never tapped; no UI text
  // beyond the verified text is needed.
  'Letters and Arabic-Indic digits are not accepted in the phone number',
  'Non-digit characters typed into the phone number are dropped',
  'The phone number is limited in length',
  'Clearing the phone number disables Send again',
  'A single digit already enables Send',
  // Recovery: closing the screen and opening it again (navigation and local typing only; nothing is sent).
  'Reopening Forgot Password after Close shows an empty phone field',
] as const;

export const IOS_GUEST_FORM_TEXT = {
  verifiedOn: '2026-11-09',
  build: '8.3 (1491)',
  en: {
    homeTab: 'Home',
    moreTab: 'More',
    languageOption: 'English',
    guestPrompt: 'Login/ Create an account',
    entryChoiceLogin: 'Log In',
    forgotPassword: 'Forgot your password?',
    resetPasswordHeading: 'Reset Password',
    logoutItem: 'Log out',
    logoutConfirmation: 'Log out',
    logoutBack: 'Back',
    createAccountChoice: 'Create a new account',
    registrationHeading: 'Create a new account',
    chooseAccountType: 'Choose Account Type',
    registrationNext: 'Next',
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
    homeTab: 'الرئيسية',
    moreTab: 'المزيد',
    languageOption: 'العربية',
    guestPrompt: 'تسجيل الدخول/ إنشاء حساب',
    entryChoiceLogin: 'تسجيل الدخول',
    forgotPassword: 'هل نسيت كلمة المرور؟',
    resetPasswordHeading: 'إعادة تعيين كلمة المرور',
    logoutItem: 'تسجيل الخروج',
    logoutConfirmation: 'تسجيل الخروج',
    logoutBack: 'عودة',
    createAccountChoice: 'إنشاء حساب جديد',
    registrationHeading: 'إنشاء حساب جديد',
    chooseAccountType: 'اختر نوع الحساب',
    registrationNext: 'التالي',
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

/** What the app text data currently holds for the covered keys. */
function currentText(text: IosAppText) {
  return {
    homeTab: text.tabs.home,
    moreTab: text.tabs.more,
    languageOption: text.languageOption,
    guestPrompt: text.guestPrompt,
    entryChoiceLogin: text.entryChoiceLogin,
    forgotPassword: text.forgotPassword,
    resetPasswordHeading: text.resetPasswordHeading,
    logoutItem: text.logoutConfirm,
    logoutConfirmation: text.logoutConfirm,
    logoutBack: text.logoutBack,
    createAccountChoice: text.createAccountChoice,
    registrationHeading: text.registrationHeading,
    chooseAccountType: text.chooseAccountType,
    registrationNext: text.registrationNext,
    bidsTab: text.bidsTab,
    actionsTab: text.actionsTab,
    bidsHeading: text.bidsHeading,
    bidsLive: text.bidsLive,
    bidsClosed: text.bidsClosed,
    bidsWon: text.bidsWon,
    bidsLost: text.bidsLost,
    bidsGuestMessage: text.bidsGuestMessage,
    bidsGuestLogin: text.bidsGuestLogin,
    actionsHeading: text.actionsHeading,
    actionsNeeded: text.actionsNeeded,
    actionsPending: text.actionsPending,
    actionsGuestMessage: text.actionsGuestMessage,
    actionsGuestLogin: text.actionsGuestLogin,
    notificationsHeading: text.notificationsHeading,
    notificationsMessage: text.notificationsMessage,
    notificationsEnable: text.notificationsEnable,
    notificationsLater: text.notificationsLater,
    favoritesHeading: text.favoritesHeading,
    favoritesLive: text.favoritesLive,
    favoritesUpcoming: text.favoritesUpcoming,
    favoritesGuestMessage: text.favoritesGuestMessage,
    favoritesGuestLogin: text.favoritesGuestLogin,
  };
}

/**
 * Why the narrow text gate is closed, or undefined when every covered string in both languages
 * equals the verified one. (`textFor` lets the selfchecks pass altered text.)
 */
export function guestFormTextProblem(
  textFor: (language: Language) => IosAppText = iosAppText,
): string | undefined {
  const differing: string[] = [];
  for (const language of ['en', 'ar'] as const) {
    const actual: Record<string, string> = currentText(textFor(language));
    for (const [key, verified] of Object.entries(IOS_GUEST_FORM_TEXT[language])) {
      if (actual[key] !== verified) differing.push(`${language}.${key}`);
    }
  }
  return differing.length
    ? `The text for the guest display tests differs from the verified text (${differing.join(', ')}).`
    : undefined;
}
