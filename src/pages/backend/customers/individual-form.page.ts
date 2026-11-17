import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * Individual update form (/backend/users/individual/update?id=…), with only what the delivery
 * survey test uses: the phone (to sign the buyer in) and the New Password / Confirm fields. The
 * phone is returned to the caller and never written anywhere else. Saving goes back to the list
 * with "Individual Profile has been updated successfully.".
 */
export class IndividualFormPage extends BackendPage {
  readonly form: Locator;
  readonly phoneInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly saveButton: Locator;
  readonly fieldErrors: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('#individual-form');
    this.phoneInput = this.form.locator('#admin-phone');
    this.newPasswordInput = this.form.locator('#admin-new_password');
    this.confirmPasswordInput = this.form.locator('#admin-passwordconfirm');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.fieldErrors = this.form.locator('.invalid-feedback').filter({ hasText: /\S/ });
  }

  async gotoUpdate(id: number): Promise<void> {
    await this.page.goto(`/backend/users/individual/update?id=${id}`);
  }

  /** The account's phone as the form shows it ("5X XXX XXXX"), digits only. */
  async phoneDigits(): Promise<string> {
    return (await this.phoneInput.inputValue()).replace(/\D/g, '');
  }

  /**
   * Sets a new password on the open form and saves; the form goes back to the list. Throws with
   * the form's messages when the back office refuses the save (seen 2026-11-17: an account whose
   * ID / Iqama number another account also has cannot be saved at all).
   */
  async resetPassword(password: string, timeout = 30_000): Promise<void> {
    await this.newPasswordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.saveButton.click();
    const outcome = await Promise.race([
      this.page
        .waitForURL((url) => !url.pathname.endsWith('/update'), { timeout })
        .then(
          () => 'saved' as const,
          () => 'no answer' as const,
        ),
      this.fieldErrors
        .first()
        .waitFor({ state: 'visible', timeout })
        .then(
          () => 'refused' as const,
          () => 'no answer' as const,
        ),
    ]);
    if (outcome !== 'saved') {
      const messages = await this.fieldErrors.allInnerTexts().catch(() => []);
      throw new Error(
        `The back office did not save the account (${outcome}): ${messages.join(' ') || 'no message'}`,
      );
    }
  }
}
