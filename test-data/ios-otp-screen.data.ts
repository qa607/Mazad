import type { Language } from '@typings';

/**
 * Text of the iOS OTP screen that NOBODY has recorded yet, kept as configurable inputs instead of guesses.
 *
 * The OTP screen has never been seen on iOS, and neither the website nor the Android suite recorded a text,
 * label or id for a Resend control (docs/ios-login-forgot-password-flow-plan.md). A scenario that needs such
 * text stays declared and pending until a value is recorded here from device evidence: the first authorized
 * OTP run attaches `otp-screen.elements.json` (tests-ios/forgot-password.spec.ts), and the QA owner copies the
 * exact label from it, together with the date and build. `null` means "not recorded": nothing is guessed,
 * nothing is copied from another platform.
 */
export interface OtpScreenText {
  /** The exact label of the control that sends another OTP (observed on the iOS OTP screen). */
  resendControl: string | null;
}

export const OBSERVED_OTP_SCREEN_TEXT: {
  /** When and on which build the values below were read from the device (null while none is recorded). */
  verifiedOn: string | null;
  build: string | null;
  en: OtpScreenText;
  ar: OtpScreenText;
} = {
  verifiedOn: null,
  build: null,
  en: { resendControl: null },
  ar: { resendControl: null },
};

/** Why the OTP-screen text a scenario needs is not recorded yet (undefined = every needed key is recorded). */
export function otpScreenTextProblem(
  language: Language,
  keys: readonly (keyof OtpScreenText)[],
  record: Pick<typeof OBSERVED_OTP_SCREEN_TEXT, Language> = OBSERVED_OTP_SCREEN_TEXT,
): string | undefined {
  const missing = keys.filter((key) => {
    const value = record[language][key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
  return missing.length
    ? `Pending: the iOS OTP screen text ${missing.join(', ')} is not recorded (${language}); it is recorded from the first authorized run's otp-screen evidence, never guessed or copied from another platform.`
    : undefined;
}
