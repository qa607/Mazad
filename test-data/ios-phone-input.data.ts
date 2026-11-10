import { websiteLoginData } from '@test-data/website-login.data';

/**
 * How the Forgot Password PHONE field validates locally, as OBSERVED on the physical iPhone by the guest
 * inspection `tests-ios/forgot-password-phone.inspect.ts` (2026-11-09, build 8.3 (1491); results in
 * reports/ios-inspection/forgot-password-phone-{en,ar}.json). The English and Arabic apps behaved identically.
 *
 * This is client behaviour, NOT a backend rule and NOT a requirement: it is the baseline the permanent
 * tests protect, so a change in the app shows up as a failure to review. Every value is synthetic
 * (built from the suite's made-up unregistered number, letters or digits): nothing here is a real number.
 *
 * Observed (each outcome is the one recorded for exactly the probe below it):
 * - nothing typed: the field reports a non-empty value (15 characters in English, 16 in Arabic: its placeholder,
 *   as far as the inspection can tell) and Send is disabled; the tests compare with the value read BEFORE typing;
 * - Latin letters and Arabic-Indic digits are not accepted (the field stays empty, Send stays disabled);
 * - other characters (letters inside digits, spaces) are dropped and the digits are kept;
 * - the length is limited: 10 characters for a number starting with 0 (13 typed), 9 for the 25-digit probe;
 * - a single digit already enables Send, clearing disables it again. What the app does when Send is TAPPED with an
 *   incomplete number was not observed (tapping Send may be an OTP-path request).
 *
 * The recorded inspection holds only lengths and Send states. The permanent tests also assert WHICH characters are
 * kept (the digits, in order); they passed on the device in English and Arabic on 2026-11-09 and are the evidence.
 */
export const OBSERVED_PHONE_INPUT = {
  verifiedOn: '2026-11-09',
  build: '8.3 (1491)',
  /** Ten Latin letters. Expected: not accepted. */
  letters: 'abcdefghij',
  /** The Arabic-Indic digits of a ten-digit number. Expected: not accepted. */
  arabicIndicDigits: '٠٥٠٩٩٩٩٩٩٩',
  /** Digits with letters inside, and digits separated by spaces. Expected: the digits only. */
  withNonDigits: ['05a9999a99', '050 999 9999'],
  /** 13 digits starting with 0 (limit 10), and 25 digits starting with 1 (limit 9). */
  tooLong: [
    { typed: `${websiteLoginData.unregisteredPhone}123`, keptLength: 10 },
    { typed: '1234567890123456789012345', keptLength: 9 },
  ],
  /** A complete made-up number, and its first digit alone. */
  complete: websiteLoginData.unregisteredPhone,
  singleDigit: websiteLoginData.unregisteredPhone.slice(0, 1),
} as const;
