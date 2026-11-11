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

  // Website Contact Us form, /<lang>/contact-us/ (recorded from staging stg-154, 2026-11-10).
  // The Send button reuses `send`.
  contactUsPageTitle: 'Contact Us | Mazad By Motory',
  contactUsHeading: 'We are glad to hear from you!',
  contactUsNameLabel: 'Name',
  contactUsEmailLabel: 'Email',
  contactUsMobileLabel: 'Mobile Number',
  contactUsMessageLabel: 'Message',
  contactUsNamePlaceholder: 'Enter your name',
  contactUsEmailPlaceholder: 'Enter Email',
  contactUsMobilePlaceholder: 'Example: 0554235678',
  contactUsMessagePlaceholder: 'Write your message',
  contactUsNameRequired: 'Name cannot be blank.',
  contactUsEmailRequired: 'Email cannot be blank.',
  contactUsMobileRequired: 'Mobile Number cannot be blank.',
  contactUsMessageRequired: 'Message cannot be blank.',
  contactUsEmailInvalid: 'Incorrect Email',
  contactUsMobileMustStartWith5: 'Mobile Number must start with "5"',
  contactUsMobileMustStartWith05: 'Mobile Number must start with "05"',
  contactUsMobileLength: 'Mobile number must be 10 digits',
  // Website Help Center, /<lang>/help-center/ (recorded from staging stg-154, 2026-11-11).
  helpCenterHeading: 'Help Center',
  /** Shown under Send for 5 seconds after the server accepts the message; the form is cleared. */
  contactUsSent: 'Your message was sent successfully!',
} satisfies Record<string, string>;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
