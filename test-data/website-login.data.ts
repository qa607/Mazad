/**
 * Mazad website login and Forgot Password test data. Localized UI text (headings, button
 * labels, error messages) lives in src/locales and is read through the `t` fixture; this file
 * holds only language-independent data. Real account phone numbers are never hardcoded here:
 * see the website fixture's individualAccount/dealerAccount (found in the back office by name).
 */
export const websiteLoginData = {
  /** Well-formed Saudi mobile number with no website account on staging (checked 2026-11-04). */
  unregisteredPhone: '0509999999',
  /** Made-up password for the negative login cases. */
  wrongPassword: 'Not-The-Password-1',
  /** OTP that never matches the real one, for the incorrect-OTP case. */
  wrongOtp: '9999',
  /** Shorter than the website's own 6-character minimum. */
  tooShortPassword: 'abc',
} as const;

/** URL patterns, matched against the full page URL (both languages share the same paths). */
export const websiteUrls = {
  login: /\/(en|ar)\/login\/?(\?|$)/,
  home: /\/(en|ar)\/$/,
} as const;
