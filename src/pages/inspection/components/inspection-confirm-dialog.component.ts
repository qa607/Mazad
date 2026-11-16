import type { Locator, Page } from '@playwright/test';

/**
 * The Inspection backend's grid "Confirmation" dialog, e.g. before QC/Inspector bulk delete.
 * Krajee's dialog-yii.js overrides `yii.confirm` to render a Bootstrap Dialog HTML modal (not
 * the browser's native confirm(), unlike this app's logout link — see InspectionPage) with a
 * fresh random `id` on every open, so the id cannot be a stable selector.
 *
 * Confirmed live 2026-11-11: this page also carries a second, normally-hidden `#confirmationModal`
 * template elsewhere in its markup, sharing the same button classes, so every locator here
 * excludes it explicitly. The dialog is also left with `aria-hidden="true"` while visible (an app
 * bug), so `getByRole('dialog'/'button')` cannot find it; only CSS locators work.
 */
export class InspectionConfirmDialog {
  readonly dialog: Locator;
  readonly message: Locator;
  readonly okButton: Locator;
  readonly cancelButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('.modal.bootstrap-dialog:not(#confirmationModal)');
    this.message = this.dialog.locator('.bootstrap-dialog-message');
    this.okButton = this.dialog.locator('.bootstrap-dialog-footer-buttons button.btn-warning');
    this.cancelButton = this.dialog.locator('.bootstrap-dialog-footer-buttons button.btn-default');
  }

  async waitForVisible(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /**
   * Confirms with Ok and waits for the dialog to close. Not a 'load'-event wait: the grid this
   * dialog appears on refreshes via pjax rather than a full navigation (confirmed live), and a
   * slow/hanging subresource on this app can in any case keep 'load' from ever firing.
   */
  async confirmAndWaitForPageLoad(): Promise<void> {
    await this.okButton.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }
}
