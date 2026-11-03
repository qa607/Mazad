import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';
import type { BackendAccount } from '@config/credentials.config';
import { fillSecret } from '@utils/secret-input';

/** Mazad back-office login (/backend/authentication/login). */
export class MazadLoginPage extends BackendPage {
  static readonly path = '/backend/authentication/login';

  readonly form: Locator;
  readonly phoneInput: Locator;
  readonly passwordInput: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly submitButton: Locator;
  /** Inline validation message under each field (empty when the field is valid). */
  readonly phoneError: Locator;
  readonly passwordError: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('#login-form');
    this.phoneInput = page.locator('#loginform-phone');
    this.passwordInput = page.locator('#loginform-password');
    this.rememberMeCheckbox = page.locator('#loginform-rememberme');
    this.submitButton = this.form.locator('button[name="login-button"]');
    this.phoneError = page.locator('.field-loginform-phone .invalid-feedback');
    this.passwordError = page.locator('.field-loginform-password .invalid-feedback');
  }

  async goto(): Promise<void> {
    await this.page.goto(MazadLoginPage.path);
  }

  /** For made-up test phones only. Use enterAccountPhone() for a real account. */
  async enterPhone(phone: string): Promise<void> {
    await this.phoneInput.fill(phone);
  }

  /** For made-up test passwords only. loginAs() handles real passwords. */
  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  /** Enters an account's phone without it appearing in reports. */
  async enterAccountPhone(account: BackendAccount): Promise<void> {
    await fillSecret(this.phoneInput, account.phone);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Signs in with an account's credentials, which are kept out of reports. */
  async loginAs(account: BackendAccount): Promise<void> {
    await fillSecret(this.phoneInput, account.phone);
    await fillSecret(this.passwordInput, account.password);
    await this.submit();
  }

  /**
   * Starts counting login form submissions that reach the network (POSTs to the login URL).
   * Returns a function giving the count so far, so tests can tell client-side validation
   * (nothing sent) from a server response.
   */
  countSubmissions(): () => number {
    let submissions = 0;
    this.page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes(MazadLoginPage.path)) {
        submissions += 1;
      }
    });
    return () => submissions;
  }

  /** Areas that can show credentials, for masking in screenshots. */
  sensitiveAreas(): Locator[] {
    return [this.phoneInput, this.passwordInput];
  }
}
