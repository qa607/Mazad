/**
 * Accessibility identifiers of the Mazad iOS screens, filled from the first guest-screen
 * inspection (tests-ios/guest-screens.inspect.ts proposes each value from the real page source).
 * An empty string means "not recorded yet": the screen object then uses its provisional
 * fallback (element type and visible text). Set IOS_SELECTORS_VERIFIED to true only after the
 * recorded values were reviewed. Screens reachable only through an OTP request (OTP, new
 * password) stay provisional until account actions are approved.
 */
export const IOS_SELECTORS_VERIFIED = false;

export const IOS_ACCESSIBILITY_IDS = {
  // Tab bar and the guest prompt on More. Logout (signed-in account screen) is deferred until an
  // authenticated inspection is approved; it stays text-based until then.
  appShell: {
    homeTab: '',
    moreTab: '',
    guestPrompt: '',
  },
  login: {
    phoneInput: '',
    passwordInput: '',
    passwordInputShown: '',
    passwordVisibilityToggle: '',
    loginButton: '',
    forgotPasswordLink: '',
  },
  forgotPassword: {
    phoneInput: '',
    sendButton: '',
    // The screen shows a Close button, not a Back button (inspected 2026-11-09).
    closeButton: '',
  },
  // Signed-in account (More): not inspected yet, since that needs a login. Ids are required
  // (no label or position fallback), so the sign-out cleanup fails clearly until they exist.
  account: {
    logoutItem: '',
    logoutConfirm: '',
  },
  otp: {
    verifyButton: '',
  },
  newPassword: {
    passwordInput: '',
    saveAndLoginButton: '',
  },
  // Contact Form (Help Center -> category -> Contact Us), inspected 2026-11-11: Send and the WhatsApp
  // button are both Buttons with NO accessible name or label (their text is not exposed), so
  // neither can be told apart without position. Send stays id-only until the iOS team adds one.
  contactForm: {
    sendButton: '',
  },
  // More tab (guest), inspected 2026-11-11: the Favorites/Notifications header icons and the four
  // social icons are Buttons with no accessible name or label; id-only until the iOS team adds ids.
  more: {
    favoritesIcon: '',
    notificationsIcon: '',
    facebookIcon: '',
    instagramIcon: '',
    tiktokIcon: '',
    linkedinIcon: '',
  },
} as const satisfies Record<string, Record<string, string>>;
