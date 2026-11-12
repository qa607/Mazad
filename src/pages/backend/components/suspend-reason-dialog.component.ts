import type { Locator, Page } from '@playwright/test';

/**
 * The "Suspend Vehicle Reason" popup (#modal-m, form #suspend-reason): four reasons as radio
 * buttons and a free-text "Reason Other" that is needed for "Other Reasons".
 */
export class SuspendReasonDialog {
  readonly dialog: Locator;
  readonly title: Locator;
  readonly form: Locator;
  readonly reasonLabels: Locator;
  readonly reasonRadios: Locator;
  readonly reasonError: Locator;
  readonly otherInput: Locator;
  readonly otherError: Locator;
  readonly submitButton: Locator;
  readonly closeButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('.modal.show', { has: page.locator('#suspend-reason') });
    this.title = this.dialog.locator('.modal-title');
    this.form = this.dialog.locator('#suspend-reason');
    this.reasonLabels = this.form.locator('#otherreasonvalidation-reason_id label');
    this.reasonRadios = this.form.locator(
      'input[type="radio"][name="OtherReasonValidation[reason_id]"]',
    );
    this.reasonError = this.form.locator(
      '.field-otherreasonvalidation-reason_id .invalid-feedback',
    );
    this.otherInput = this.form.locator('#otherreasonvalidation-reason_other');
    this.otherError = this.form.locator(
      '.field-otherreasonvalidation-reason_other .invalid-feedback',
    );
    this.submitButton = this.form.locator('button[type="submit"]');
    this.closeButton = this.form.locator('button[data-dismiss="modal"]');
  }

  /** Picks a reason by the text of its label. */
  async chooseReason(reason: string): Promise<void> {
    await this.reasonLabels.filter({ hasText: reason }).click();
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
  }

  /**
   * Counts real suspend submissions: POSTs that are not the form's live validation. Pressing
   * Suspend with no reason only sends a validate-only request (it carries "ajax=...").
   */
  countSubmissions(): () => number {
    return this.countPosts(false);
  }

  /** Counts the validate-only requests the form sends. */
  countValidationRequests(): () => number {
    return this.countPosts(true);
  }

  private countPosts(validationOnly: boolean): () => number {
    let count = 0;
    this.page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/ajax/suspend-vehicle')) return;
      const isValidation = /(^|&)ajax=/.test(request.postData() ?? '');
      if (isValidation === validationOnly) count += 1;
    });
    return () => count;
  }
}
