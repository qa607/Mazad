import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/base.page';
import type { Language } from '@typings';
import { fillSecret } from '@utils/secret-input';

/**
 * Mazad customer website login, and the "Forgot your password?" flow that replaces the same
 * form in place (confirmed on staging: no separate URL per step; the heading and fields change
 * under /login). Login and the four Forgot Password steps live here together because they are
 * one Angular component toggling views, not separate pages.
 */
export class MazadWebsiteLoginPage extends BasePage {
  static readonly path = '/login';

  // Login
  readonly mobileNumberInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly forgotPasswordButton: Locator;
  readonly createAccountLink: Locator;

  // Forgot password — step 1: phone
  readonly sendButton: Locator;

  // Forgot password — step 2: OTP (4 unlabeled digit boxes)
  readonly otpInputs: Locator;
  readonly verifyButton: Locator;

  // Forgot password — step 3: new password (no confirm field exists on this screen)
  readonly newPasswordInput: Locator;
  readonly saveAndLoginButton: Locator;

  // Logged-in header (used to verify a successful login, and to log out)
  readonly accountMenuTrigger: Locator;
  readonly logoutMenuItem: Locator;
  /** The account menu's "Log out" opens a confirmation dialog with its own "Log out" button. */
  readonly logoutConfirmButton: Locator;

  // Shared
  readonly heading: Locator;
  readonly errorMessage: Locator;
  readonly cookieDeclineLink: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    this.mobileNumberInput = page.locator('#login-mobile-number');
    this.passwordInput = page.locator('#login-password');
    this.loginButton = page.locator('button', { hasText: this.t('login') });
    this.forgotPasswordButton = page.locator('button', { hasText: this.t('forgotPassword') });
    this.createAccountLink = page.getByRole('link', { name: this.t('createAccount') });

    this.sendButton = page.locator('button', { hasText: this.t('send') });

    this.otpInputs = page.locator('input[inputmode="numeric"]');
    this.verifyButton = page.locator('button', { hasText: this.t('verify') });

    this.newPasswordInput = page.locator('#create-new-password-input');
    this.saveAndLoginButton = page.locator('button', { hasText: this.t('saveAndLogin') });

    // A stable id, independent of the account's own display name.
    this.accountMenuTrigger = page.locator('#header-login-label');
    this.logoutMenuItem = page.getByText(this.t('logout'), { exact: true });
    this.logoutConfirmButton = page.locator('button.logout-button');

    this.heading = page.locator('h1, h2, h3, [class*="title"]').first();
    // Input fields, and the OTP boxes' own wrapper, also carry an "error" class for their own
    // styling (confirmed on staging) — this excludes both and matches only the message element.
    this.errorMessage = page
      .locator(
        ':is(.error, [class*="error"], mat-error, .text-danger, .invalid-feedback):not(input, textarea, select, .otp-wrapper)',
      )
      .first();
    this.cookieDeclineLink = page.getByRole('link', { name: this.t('cookieDecline') });
  }

  async goto(): Promise<void> {
    await this.open(MazadWebsiteLoginPage.path);
    // The cookie consent banner can cover the form on first visit each session.
    if (await this.cookieDeclineLink.isVisible().catch(() => false)) {
      await this.cookieDeclineLink.click({ force: true });
    }
  }

  async login(phone: string, password: string): Promise<void> {
    await fillSecret(this.mobileNumberInput, phone);
    await fillSecret(this.passwordInput, password);
    await this.loginButton.click({ force: true });
  }

  async enterPhone(phone: string): Promise<void> {
    await this.mobileNumberInput.fill(phone);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async openForgotPassword(): Promise<void> {
    await this.forgotPasswordButton.click({ force: true });
  }

  /** Enters the phone and submits step 1 of Forgot Password ("Reset Password" / "Send"). */
  async requestPasswordReset(phone: string): Promise<void> {
    await fillSecret(this.mobileNumberInput, phone);
    await this.sendButton.click({ force: true });
  }

  /** Enters a 4-digit OTP into the four boxes and submits ("Mobile number verification" / "Verify"). */
  async enterOtp(otp: string): Promise<void> {
    for (let i = 0; i < otp.length; i++) {
      await this.otpInputs.nth(i).fill(otp[i]);
    }
  }

  async verifyOtp(otp: string): Promise<void> {
    await this.enterOtp(otp);
    await this.verifyButton.click({ force: true });
  }

  /** Sets the new password and submits ("Create New Password" / "Save and Login"). The
   * application logs the account in automatically on success; there is no separate confirm field. */
  async setNewPassword(password: string): Promise<void> {
    await fillSecret(this.newPasswordInput, password);
    await this.saveAndLoginButton.click({ force: true });
  }

  /**
   * Runs the complete Forgot Password flow (phone → OTP → new password) and leaves the
   * account logged in, as the application does on success. Reused by both the dedicated
   * Forgot Password tests and the Login test's positive case, instead of duplicating the flow.
   */
  async resetPasswordViaForgotPassword(
    phone: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    await this.openForgotPassword();
    await this.requestPasswordReset(phone);
    await this.verifyOtp(otp);
    await this.setNewPassword(newPassword);
  }

  /** Opens the account menu and logs out; the application redirects to the login page. */
  async logout(): Promise<void> {
    await this.accountMenuTrigger.click({ force: true });
    await this.logoutMenuItem.click({ force: true });
    await this.logoutConfirmButton.click({ force: true });
  }

  /** Clears the browser session (cookies and storage), for testing a fresh login afterward. */
  async clearSession(): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage may be unavailable (e.g. blocked in a private context); nothing to clear then */
      }
    });
  }

  /** Areas that can show credentials, for masking in screenshots. */
  sensitiveAreas(): Locator[] {
    return [this.mobileNumberInput, this.passwordInput, this.newPasswordInput, this.otpInputs];
  }
}
