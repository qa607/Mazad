/**
 * Mazad Backend login test data. The Backend has no localization, so its UI text lives here
 * rather than in src/locales. Credentials are never stored here: see config/credentials.config.ts.
 */
export const backendLoginText = {
  phoneRequired: 'Phone cannot be blank.',
  passwordRequired: 'Password cannot be blank.',
  /** Server message for an unknown phone and for a wrong password alike. */
  invalidCredentials: 'Incorrect username or password.',
  loginPageTitle: 'Login',
  dashboardTitle: 'Mazad V3',
  /** Display name of the Dev Root account in the header greeting (not a credential). */
  devRootWelcome: /Welcome\s+DevRoot/,
} as const;

export const backendLoginData = {
  /** Well-formed Saudi mobile number with no Backend account on staging (checked 2026-11-03). */
  unregisteredPhone: '0599999990',
  /** Made-up password for the negative cases. */
  wrongPassword: 'Not-The-Password-1',
} as const;

/** URL patterns, matched against the full page URL. */
export const backendUrls = {
  login: /\/backend\/authentication\/login(\?|$)/,
  dashboard: /\/backend\/(site\/index)?$/,
} as const;
