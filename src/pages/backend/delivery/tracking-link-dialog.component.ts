import type { Locator, Page } from '@playwright/test';

/**
 * The "Update Tracking Link" popup (#modal-lg, form #update-tracking-link-form) opened by a Tracking
 * row's "Edit Link". It has one optional text area (at most 1,000 characters) and Cancel / Save.
 * The form checks on the server as you type (a validate-only request that carries "ajax=..."); only
 * Save sends a real change, and automation never presses it.
 */
export class TrackingLinkDialog {
  readonly dialog: Locator;
  readonly title: Locator;
  readonly form: Locator;
  readonly linkInput: Locator;
  readonly linkError: Locator;
  readonly cancelButton: Locator;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('.modal.show', { has: page.locator('#update-tracking-link-form') });
    this.title = this.dialog.locator('.modal-title');
    this.form = this.dialog.locator('#update-tracking-link-form');
    this.linkInput = this.form.locator('#pickupstep-tracking_link');
    this.linkError = this.form.locator('.field-pickupstep-tracking_link .invalid-feedback');
    this.cancelButton = this.form.getByRole('button', { name: 'Cancel' });
    this.saveButton = this.form.getByRole('button', { name: 'Save' });
  }

  /** Types into the link box and leaves it, which runs the form's live validation. Nothing is saved. */
  async typeLink(value: string): Promise<void> {
    await this.linkInput.fill(value);
    await this.linkInput.blur();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /**
   * Counts real saves: POSTs to the update address that are not the form's live validation (a
   * validate-only request carries "ajax=..."). Always expected to stay 0.
   */
  countSaves(): () => number {
    let count = 0;
    this.page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/ajax/update-tracking-link'))
        return;
      if (!/(^|&)ajax=/.test(request.postData() ?? '')) count += 1;
    });
    return () => count;
  }
}
