/**
 * Mazad Inspection backend login test data (stg-224-inspection). This Backend has no
 * localization either (same convention as the main Mazad Backend), so its UI text lives here
 * rather than in src/locales. Credentials are never stored here: see
 * config/credentials.config.ts. All text recorded live from the real application, 2026-11-11.
 */
export const inspectionLoginText = {
  mobileNumberRequired: 'Mobile Number cannot be blank.',
  pinRequired: 'Pin cannot be blank.',
  mobileNumberFormatInvalid: 'The mobile number format is invalid.',
  /** The app's own text, including its "nubmer" typo — asserted verbatim, never "corrected". */
  incorrectCredentials: 'Incorrect mobile nubmer or pin.',
  loginPageTitle: 'Sign In',
  dashboardTitle: 'Motory - Dashboard',
  /** The native confirm() dialog shown by the Logout link's data-confirm attribute. */
  logoutConfirm: 'Want to logout?',
} as const;

export const inspectionLoginData = {
  /** A PIN that is well-formed (4 digits) but not the real one, for the negative login case. */
  wrongPin: '9999',
} as const;

/** URL patterns, matched against the full page URL. */
export const inspectionUrls = {
  login: /\/site\/login(\?|$)/,
  dashboard: /\/$/,
} as const;
