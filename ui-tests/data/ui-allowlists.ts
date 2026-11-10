/**
 * Data for the UI layer. Every entry here is a reviewed decision, so add entries only after the
 * QA owner approves them. This file holds no approved terminology or translations.
 */

/**
 * English (Latin-only) strings allowed in the Arabic interface, such as brand names.
 * Empty until approved: until then every match is reported as "review", never as an error.
 */
export const LATIN_ALLOWED_IN_ARABIC: readonly string[] = [];

/**
 * Elements expected to show the other language: the language switchers. Structural only
 * (they show the target language by design), not terminology.
 */
export const OTHER_LANGUAGE_SELECTORS: readonly string[] = ['.toggle-language', '.language-change'];

/**
 * Dynamic content to mask in screenshots, per screen (CSS selectors). Only content that changes
 * between runs by nature (countdowns, live counts); never layout. Filled from noise-run evidence.
 */
export const DYNAMIC_MASKS: Readonly<Record<string, readonly string[]>> = {};

/**
 * Absolute cap on differing pixels for full-page comparisons. Playwright applies the stricter of
 * this and maxDiffPixelRatio 0.01. Unset until measured in the noise runs and approved.
 */
export const FULL_PAGE_MAX_DIFF_PIXELS: number | undefined = undefined;

/**
 * Findings the QA owner accepted as intended design. They are still reported on every run,
 * marked "accepted" with the reason, and never fail a test. Match: rule + screen.
 */
export const ACCEPTED_FINDINGS: readonly { rule: string; screen: string; reason: string }[] = [
  {
    rule: 'no-back-control',
    screen: 'forgot-password',
    reason:
      'Accepted design behaviour (QA owner, 2026-11-08): Forgot Password has no in-page control back to Login.',
  },
  {
    rule: 'browser-back-observed',
    screen: 'forgot-password',
    reason:
      'Accepted design behaviour (QA owner, 2026-11-08): Back from Forgot Password leaves the login page; kept as documentation.',
  },
];
