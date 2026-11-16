import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

export type CompanyField = 'arabicName' | 'englishName' | 'email' | 'phone';

const fieldIds: Record<CompanyField, string> = {
  arabicName: 'deliverycompany-name',
  englishName: 'deliverycompany-name_en',
  email: 'deliverycompany-email',
  phone: 'deliverycompany-phone_number',
};

/** Values typed into the company form. */
export interface CompanyInput {
  arabicName?: string;
  englishName?: string;
  email?: string;
  phone?: string;
}

/**
 * The Delivery Company create form (/backend/deliveryCompany/delivery-company/create; the update
 * form has the same fields). Arabic Name, English Name (each at most 100 characters) and Email (a
 * valid address, at most 100) are required; Phone is optional (international format, at most 15
 * characters). Fields validate as you leave them. Automation uses only the create form.
 */
export class DeliveryCompanyFormPage extends BackendPage {
  static readonly createPath = '/backend/deliveryCompany/delivery-company/create';

  readonly pageHeading: Locator;
  readonly form: Locator;
  readonly saveButton: Locator;
  readonly cancelLink: Locator;
  readonly visibleErrors: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.form = page
      .locator('.app-main__inner form')
      .filter({ has: page.locator('#deliverycompany-name') });
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelLink = this.form.locator('a', { hasText: /^\s*Cancel\s*$/ });
    this.visibleErrors = this.form.locator('.invalid-feedback').filter({ hasText: /\S/ });
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto(DeliveryCompanyFormPage.createPath);
  }

  input(field: CompanyField): Locator {
    return this.page.locator(`#${fieldIds[field]}`);
  }

  fieldError(field: CompanyField): Locator {
    return this.page.locator(`.field-${fieldIds[field]} .invalid-feedback`);
  }

  /** Fills the given fields without leaving the last one. */
  async fill(input: CompanyInput): Promise<void> {
    if (input.arabicName !== undefined) await this.input('arabicName').fill(input.arabicName);
    if (input.englishName !== undefined) await this.input('englishName').fill(input.englishName);
    if (input.email !== undefined) await this.input('email').fill(input.email);
    if (input.phone !== undefined) await this.input('phone').fill(input.phone);
  }

  /** Types into one field and leaves it, which runs that field's validation. Nothing is saved. */
  async typeAndLeave(field: CompanyField, value: string): Promise<void> {
    await this.input(field).fill(value);
    await this.input(field).blur();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /**
   * Counts create requests that reach the server: POSTs to the create address that are not the
   * form's live validation (those carry "ajax=..."). An invalid form must leave this at 0.
   */
  countCreateRequests(): () => number {
    let count = 0;
    this.page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/delivery-company/create'))
        return;
      if (!/(^|&)ajax=/.test(request.postData() ?? '')) count += 1;
    });
    return () => count;
  }
}
