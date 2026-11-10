/** English UI strings. Every key added here must also be added to ar.ts. */
export const en = {
  // Website login and "Forgot your password?" (recorded from staging, 2026-11-04).
  login: 'Login',
  forgotPassword: 'Forgot your password?',
  createAccount: 'Create a new account',
  send: 'Send',
  verify: 'Verify',
  saveAndLogin: 'Save and Login',
  cookieDecline: 'Decline',
  resetPasswordHeading: 'Reset Password',
  otpVerificationHeading: 'Mobile number verification',
  newPasswordHeading: 'Create New Password',
  invalidCredentials: 'The entered information is incorrect, please try again',
  unregisteredPhone: 'The entered mobile number is not registered',
  incorrectOtp: 'The entered code is incorrect',
  passwordTooShort: 'Password must be at least 6 characters',
  logout: 'Log out',
  /** Header prompt shown instead of the account name when signed out (home page, any page). */
  headerGuestPrompt: 'Create an Account / Log In',
} satisfies Record<string, string>;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
