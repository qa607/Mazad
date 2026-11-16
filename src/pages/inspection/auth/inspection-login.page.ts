import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';
import type { InspectionAccount } from '@config/credentials.config';
import { fillSecret } from '@utils/secret-input';

/**
 * Mazad Inspection backend login (/site/login, stg-224-inspection). Confirmed live 2026-11-11:
 * a mobile number + 4-digit PIN form (model `LoginForm`), not the main Backend's phone+password.
 */
export class InspectionLoginPage extends InspectionPage {
  static readonly path = '/site/login';

  readonly form: Locator;
  readonly mobileNumberInput: Locator;
  readonly pinInput: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly submitButton: Locator;
  /** Inline validation message under each field (empty when the field is valid). Also carries
   * the server's "Incorrect mobile nubmer or pin." message (sic — the app's own text) under the
   * PIN field after a failed login; there is no separate top-level alert for that case. */
  readonly mobileNumberError: Locator;
  readonly pinError: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('#login-form');
    this.mobileNumberInput = page.locator('#loginform-mobile_number');
    this.pinInput = page.locator('#loginform-pin');
    this.rememberMeCheckbox = page.locator('#loginform-rememberme');
    this.submitButton = this.form.locator('button[name="login-button"]');
    this.mobileNumberError = page.locator('.field-loginform-mobile_number .help-block-error');
    this.pinError = page.locator('.field-loginform-pin .help-block-error');
  }

  async goto(): Promise<void> {
    await this.page.goto(InspectionLoginPage.path);
  }

  /** For made-up test values only. Use enterAccountMobileNumber() for a real account. */
  async enterMobileNumber(mobileNumber: string): Promise<void> {
    await this.mobileNumberInput.fill(mobileNumber);
  }

  /** For made-up test values only. loginAs() handles a real account's PIN. */
  async enterPin(pin: string): Promise<void> {
    await this.pinInput.fill(pin);
  }

  /** Enters an account's mobile number without it appearing in reports. */
  async enterAccountMobileNumber(account: InspectionAccount): Promise<void> {
    await fillSecret(this.mobileNumberInput, account.mobileNumber);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Signs in with an account's credentials, which are kept out of reports. */
  async loginAs(account: InspectionAccount): Promise<void> {
    await fillSecret(this.mobileNumberInput, account.mobileNumber);
    await fillSecret(this.pinInput, account.pin);
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
      if (request.method() === 'POST' && request.url().includes(InspectionLoginPage.path)) {
        submissions += 1;
      }
    });
    return () => submissions;
  }

  /** Areas that can show credentials, for masking in screenshots. */
  sensitiveAreas(): Locator[] {
    return [this.mobileNumberInput, this.pinInput];
  }
}
