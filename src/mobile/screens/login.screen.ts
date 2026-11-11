import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — login and the "Forgot your password?" flow.
 *
 * Confirmed on staging (2026-11-04), and deliberately not assumed to match the website:
 * - Tapping "Login / Create account" opens a bottom sheet offering separate "Login" and
 *   "Create a new account" choices; the actual login form is a second screen.
 * - The login form and the forgot-password screens use real native fields (not the website's
 *   4-box web component) with stable resource IDs. The backend-driven messages (invalid
 *   credentials, unregistered phone, the screen headings, the password-length hint) are
 *   identical to the website's (confirmed on staging), so callers can reuse the shared `t()`
 *   locale strings for those. App-only UI labels are not assumed to match: in English the
 *   app's own button says "Log In" (two words) where the website says "Login" (one word) —
 *   those app-specific strings live in test-data/mobile-app.data.ts instead. This screen holds
 *   locators only and takes all expected text as parameters, matching the other Android screens.
 * - After a successful reset the app can show two one-time, account/session-dependent gates
 *   that the website never shows: an updated Terms & Conditions screen, and an "enable
 *   fingerprint login" prompt. Both are dismissed if present; neither is required.
 * - A successful login/reset lands on the "More" (account) tab, not Home.
 */
export class MazadLoginScreen extends MobileScreen {
  // Login form
  get phoneInput() {
    return this.byId('edit_text_phone_number');
  }

  get passwordInput() {
    return this.byId('edit_text_password');
  }

  get loginButton() {
    return this.byId('button_login');
  }

  get forgotPasswordLink() {
    return this.byId('text_view_forget_password');
  }

  // Forgot password — step 1: phone (reuses edit_text_phone_number; button_send is this step's own)
  get sendButton() {
    return this.byId('button_send');
  }

  // Forgot password — step 2: OTP (four separate native fields, unlike the website)
  get otpInputs() {
    return [
      this.byId('edit_text_one'),
      this.byId('edit_text_two'),
      this.byId('edit_text_three'),
      this.byId('edit_text_four'),
    ];
  }

  get verifyButton() {
    return this.byId('button_verify');
  }

  // Forgot password — step 3: new password (single field, no confirm field — same as the website)
  get newPasswordInput() {
    return this.byId('edit_text_password');
  }

  get saveAndLoginButton() {
    return this.byId('button_save_and_login');
  }

  // One-time post-reset gate the app can show; the website never shows it.
  get acceptUpdatedTermsButton() {
    return this.byId('textview_accept_terms_button');
  }

  /** Any visible text on the screen (error/validation messages, dialog buttons, headings). */
  message(text: string) {
    return this.byText(text);
  }

  /** The "More" tab's guest prompt (e.g. "Login/ Create an account"), shown when signed out. */
  guestPrompt(promptLabel: string) {
    return this.byText(promptLabel);
  }

  /** Entry bottom-sheet choice ("Login" vs "Create a new account"), found by its text. */
  loginChoice(loginLabel: string) {
    return this.byText(loginLabel);
  }

  /** Taps the guest prompt, then the "Login" choice in the bottom sheet it opens. */
  async openLoginForm(promptLabel: string, loginLabel: string): Promise<void> {
    const prompt = this.guestPrompt(promptLabel);
    await prompt.waitForDisplayed({ timeout: 15_000 });
    await prompt.click();
    const choice = this.loginChoice(loginLabel);
    await choice.waitForDisplayed({ timeout: 15_000 });
    await choice.click();
  }

  async login(phone: string, password: string): Promise<void> {
    await this.phoneInput.setValue(phone);
    await this.passwordInput.setValue(password);
    await this.loginButton.click();
  }

  async enterPhone(phone: string): Promise<void> {
    await this.phoneInput.setValue(phone);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.setValue(password);
  }

  async openForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
  }

  async requestPasswordReset(phone: string): Promise<void> {
    await this.phoneInput.setValue(phone);
    await this.sendButton.click();
  }

  async enterOtp(otp: string): Promise<void> {
    const inputs = this.otpInputs;
    for (let i = 0; i < otp.length && i < inputs.length; i++) {
      await inputs[i].setValue(otp[i]);
    }
  }

  async verifyOtp(otp: string): Promise<void> {
    await this.enterOtp(otp);
    await this.verifyButton.click();
  }

  async setNewPassword(password: string): Promise<void> {
    await this.newPasswordInput.setValue(password);
    await this.saveAndLoginButton.click();
  }

  /** Dismisses the updated-Terms gate if it appears; does nothing otherwise. */
  async dismissUpdatedTermsIfPresent(): Promise<void> {
    if (await this.acceptUpdatedTermsButton.isExisting()) {
      await this.acceptUpdatedTermsButton.click();
    }
  }

  /** Dismisses a one-off prompt (e.g. "enable fingerprint login") by its dismiss button's text,
   * if it appears; does nothing otherwise. The app has no stable id for this dialog. */
  async dismissPromptIfPresent(dismissLabel: string): Promise<void> {
    const button = this.byText(dismissLabel);
    if (await button.isExisting()) {
      await button.click();
    }
  }

  /**
   * Runs the complete Forgot Password flow (phone → OTP → new password), dismissing the two
   * optional one-time gates the app can show afterward, and leaves the account logged in.
   * Reused by both the Forgot Password tests and the Login test's positive case.
   */
  async resetPasswordViaForgotPassword(
    phone: string,
    otp: string,
    newPassword: string,
    fingerprintDismissLabel: string,
  ): Promise<void> {
    await this.openForgotPassword();
    await this.requestPasswordReset(phone);
    await this.verifyOtp(otp);
    await this.setNewPassword(newPassword);
    await this.dismissUpdatedTermsIfPresent();
    await this.dismissPromptIfPresent(fingerprintDismissLabel);
  }
}
