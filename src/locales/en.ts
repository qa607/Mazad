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
  // Registration, step 1 (recorded from staging, 2026-11-10). Later steps are not yet verified.
  chooseAccountType: 'Choose Account Type',
  personalAccountChoice: 'Personal Account',
  companyAccountChoice: 'Company Account',
  registrationNext: 'Next',
  // Registration, step 2 (recorded from staging, 2026-11-10, via the approved Firebase
  // anonymous-session exception; no account was created). Shared by both account types.
  registrationFullNameLabel: 'Full Name',
  registrationIdIqamaLabel: 'ID/ Iqama Number',
  registrationCityRegionLabel: 'City/ Region',
  registrationMobileNumberLabel: 'Mobile Number',
  registrationPasswordLabel: 'Password',
  registrationCrNumberLabel: 'Commercial Registry Number',
  registrationTaxIdLabel: 'Tax ID',
  registrationCreateAccountButton: 'Create Account',
  registrationSelectCityPlaceholder: 'Select City/ Region',
} satisfies Record<string, string>;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
