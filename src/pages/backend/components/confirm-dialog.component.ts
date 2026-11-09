import type { Locator, Page } from '@playwright/test';

/**
 * The Backend's in-page "Confirmation" dialog (Bootstrap Dialog), shown instead of the
 * browser's confirm() before destructive grid actions such as Delete.
 */
export class ConfirmDialog {
  readonly dialog: Locator;
  readonly message: Locator;
  readonly okButton: Locator;
  readonly cancelButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Confirmation' });
    this.message = this.dialog.locator('.bootstrap-dialog-message');
    // The buttons start with a Font Awesome icon whose glyph is part of the accessible name, so
    // the names are matched at their end.
    this.okButton = this.dialog.getByRole('button', { name: /Ok$/ });
    this.cancelButton = this.dialog.getByRole('button', { name: /Cancel$/ });
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /** Confirms with Ok and waits for the page the confirmed action loads. */
  async confirmAndWaitForPageLoad(): Promise<void> {
    await Promise.all([this.page.waitForEvent('load'), this.okButton.click()]);
  }
}
