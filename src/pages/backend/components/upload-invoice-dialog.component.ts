import type { Locator, Page } from '@playwright/test';

/**
 * The "Upload Invoice" popup (#modal-m) opened from a Failed List row. The page only accepts
 * PNG, JPG, JPEG and PDF; the file picker is a hidden input behind an image placeholder.
 */
export class UploadInvoiceDialog {
  readonly dialog: Locator;
  readonly title: Locator;
  readonly form: Locator;
  readonly fileInput: Locator;
  /** Message shown by the page's own script for a file with a wrong extension. */
  readonly extensionError: Locator;
  /** Validation message under the Invoice field ("Invoice cannot be blank"). */
  readonly fieldError: Locator;
  readonly submitButton: Locator;
  readonly closeButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('.modal.show', { has: page.locator('#upload-failed-invoice') });
    this.title = this.dialog.locator('.modal-title');
    this.form = this.dialog.locator('#upload-failed-invoice');
    this.fileInput = this.form.locator('#failed-add-invoice-uploader');
    this.extensionError = this.form.locator('.invalid-feedback-upload-js');
    this.fieldError = this.form.locator('.field-fake_inspection_invoice_add .invalid-feedback');
    this.submitButton = this.form.locator('button[type="submit"]');
    this.closeButton = this.form.locator('button[data-dismiss="modal"], button.btn-secondary');
  }

  /** Chooses a file in the hidden picker. */
  async chooseFile(
    file: string | { name: string; mimeType: string; buffer: Buffer },
  ): Promise<void> {
    await this.fileInput.setInputFiles(file);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async close(): Promise<void> {
    await this.closeButton.first().click();
  }

  /**
   * Counts real uploads: POSTs to the upload endpoint that are not the form's live validation
   * (a validate-only request carries "ajax=...").
   */
  countSubmissions(): () => number {
    let count = 0;
    this.page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/ajax/upload-failed-invoice'))
        return;
      if (!/(^|&)ajax=/.test(request.postData() ?? '')) count += 1;
    });
    return () => count;
  }
}
