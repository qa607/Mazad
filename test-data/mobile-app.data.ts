import type { Language } from '@typings';

/**
 * Mazad Android app text that the API does not serve, recorded from the staging app
 * (version 8.2.2-stage, 2026-11-04). Text the API does serve (My Bids tabs, guest
 * and empty states) is read from GET /v1/configuration at run time instead.
 */
export const mobileAppText: Record<
  Language,
  {
    languageOption: string;
    bottomNav: { home: string; my_bids: string; my_actions: string; more: string };
    myBidsTitle: string;
    myActions: {
      title: string;
      actionNeeded: string;
      pending: string;
      guestMessage: string;
      login: string;
    };
    notifications: { title: string; mine: string; mazad: string };
    /**
     * Login and Forgot Password text that is specific to the app's own screens (not shared
     * with the website). Recorded from the staging app, version 8.2.2-stage, 2026-11-04.
     * Where a message is API/backend-driven (invalid credentials, unregistered phone, screen
     * headings, password-too-short), the app shows the exact same text as the website, so
     * those are read from src/locales instead of duplicated here — confirmed for English and
     * Arabic except where noted below.
     */
    loginFlow: {
      /** "More" tab prompt shown to a guest. Different wording from the website's header prompt. */
      guestPrompt: string;
      /** Entry bottom sheet: tapping the guest prompt offers these two choices before any form. */
      entryChoiceLogin: string;
      entryChoiceCreateAccount: string;
      /** The login form's own labels (its submit button says "Log In", two words, in English —
       * unlike the website's one-word "Login"; confirmed identical to entryChoiceLogin on the app). */
      formForgotPassword: string;
      formCreateAccount: string;
      /** Confirmation dialog shown when logging out (the app has one; confirmed in Arabic only
       * so far — the English wording here is the standard phrasing, to be confirmed on first run). */
      logoutConfirmQuestion: string;
      logoutConfirm: string;
      logoutCancel: string;
      /** Dismiss label on the one-time "enable fingerprint login" prompt shown after a password
       * reset. Confirmed in Arabic only ("ليس الآن"); the English value is a reasonable default,
       * to be confirmed on first run — the dismissal is optional, so a mismatch is harmless. */
      fingerprintPromptDismiss: string;
    };
    /**
     * Registration text confirmed on staging, 2026-11-10/11, that is specific to the app's own
     * Step 2 screens (not shared with the website): screen headings, section headings, the
     * mobile-verification hint, the fuller password note, the City/Region placeholder, and the
     * Commercial Registry label (the app adds "(The 700 Number)" in English where the website's
     * `registrationCrNumberLabel` does not). Everything else on Step 2 (field labels, Tax ID,
     * the submit buttons) reads identically to the website and is read from `t()` instead — see
     * src/mobile/screens/registration.screen.ts.
     */
    registrationFlow: {
      screenHeadingPersonal: string;
      screenHeadingCompany: string;
      personalInfoSectionHeading: string;
      companyInfoSectionHeading: string;
      mobileVerificationHint: string;
      passwordNote: string;
      cityPlaceholder: string;
      commercialRegistryLabel: string;
      /** Shown after a successful registration OTP (Individual; confirmed 2026-11-11). */
      accountCreatedMessage: string;
      continueButtonLabel: string;
    };
  }
> = {
  en: {
    languageOption: 'English',
    bottomNav: { home: 'Home', my_bids: 'Bids', my_actions: 'Actions', more: 'More' },
    myBidsTitle: 'Bids',
    myActions: {
      title: 'Actions',
      actionNeeded: 'Action Needed',
      pending: 'Pending',
      guestMessage: 'Log in to see auctions with actions needed',
      login: 'Login',
    },
    notifications: {
      title: 'Notifications',
      mine: 'My Notifications',
      mazad: 'Mazad Notifications',
    },
    loginFlow: {
      guestPrompt: 'Login/ Create an account',
      entryChoiceLogin: 'Log In',
      entryChoiceCreateAccount: 'Create a new account',
      formForgotPassword: 'Forgot your password?',
      formCreateAccount: 'Create a new account',
      logoutConfirmQuestion: 'Are you sure you want to log out?',
      logoutConfirm: 'Log out',
      logoutCancel: 'Back',
      fingerprintPromptDismiss: 'Not now',
    },
    registrationFlow: {
      screenHeadingPersonal: 'Create Personal Account',
      screenHeadingCompany: 'Create Company Account',
      personalInfoSectionHeading: 'Personal Information',
      companyInfoSectionHeading: 'Company Information',
      mobileVerificationHint: 'A verification code will be sent to verify the mobile number.',
      passwordNote:
        'Password must be at least 6 digits. We recommend using lowercase and uppercase letters, special characters, and numbers',
      cityPlaceholder: 'Select from the list',
      commercialRegistryLabel: 'Commercial Registry Number (The 700 Number)',
      accountCreatedMessage: 'Your account has been successfully created!',
      continueButtonLabel: 'Continue',
    },
  },
  ar: {
    languageOption: 'العربية',
    bottomNav: { home: 'الرئيسية', my_bids: 'مزاداتي', my_actions: 'إجراءاتي', more: 'المزيد' },
    myBidsTitle: 'مزاداتي',
    myActions: {
      title: 'إجراءاتي',
      actionNeeded: 'تحتاج إلى إجراء',
      pending: 'قيد الانتظار',
      guestMessage: 'سجّل الدخول لرؤية المزادات التي تحتاج إلى إجراء',
      login: 'تسجيل الدخول',
    },
    notifications: { title: 'الإشعارات', mine: 'إشعاراتي', mazad: 'إشعارات مزاد' },
    loginFlow: {
      guestPrompt: 'تسجيل الدخول/ إنشاء حساب',
      entryChoiceLogin: 'تسجيل الدخول',
      entryChoiceCreateAccount: 'إنشاء حساب جديد',
      formForgotPassword: 'هل نسيت كلمة المرور؟',
      formCreateAccount: 'إنشاء حساب جديد',
      logoutConfirmQuestion: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
      logoutConfirm: 'تسجيل الخروج',
      logoutCancel: 'عودة',
      fingerprintPromptDismiss: 'ليس الآن',
    },
    registrationFlow: {
      screenHeadingPersonal: 'إنشاء حساب شخصي',
      screenHeadingCompany: 'إنشاء حساب شركة',
      personalInfoSectionHeading: 'المعلومات الشخصية',
      companyInfoSectionHeading: 'معلومات الشركة',
      mobileVerificationHint: 'سيتم إرسال رمز للتحقق من رقم الجوال.',
      passwordNote:
        'يجب أن تتكون كلمة المرور من 6 خانات على الأقل. لزيادة قوة كلمة المرور، ينصح باستخدام أحرف صغيرة وكبيرة، ورموز خاصة وأرقام',
      cityPlaceholder: 'اختر من القائمة',
      commercialRegistryLabel: 'رقم السجل التجاري (رقم الـ 700)',
      accountCreatedMessage: 'تم إنشاء حسابك بنجاح!',
      continueButtonLabel: 'استمرار',
    },
  },
};

/** Language option labels in More → Language (each shown in its own language). */
export const languageOptions: Record<Language, string> = {
  en: mobileAppText.en.languageOption,
  ar: mobileAppText.ar.languageOption,
};
