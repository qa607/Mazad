import type { Locator, Page } from '@playwright/test';

/** Values typed into the Direct Sale popup. Prices are whole riyals, as typed. */
export interface DirectSaleInput {
  /** Customer name as the dropdown shows it. Omit to leave it unchosen. */
  customer?: string;
  supplierPrice?: string;
  commission?: string;
  administrativeExpenses?: string;
}

/**
 * The "Direct Sale" popup (#modal-lg) opened from a Failed List row. It has a Customer dropdown
 * (the item's distinct bidders), three price fields and a read-only Total Price that the page
 * works out as Supplier Price + Commission + Administrative Expenses.
 */
export class DirectSaleDialog {
  readonly dialog: Locator;
  readonly title: Locator;
  readonly form: Locator;
  readonly customerSelect: Locator;
  readonly customerValue: Locator;
  readonly supplierPriceInput: Locator;
  readonly commissionInput: Locator;
  readonly administrativeExpensesInput: Locator;
  readonly totalPriceInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('.modal.show', { has: page.locator('#update-my-auction-form') });
    this.title = this.dialog.locator('.modal-title');
    this.form = this.dialog.locator('#update-my-auction-form');
    this.customerSelect = this.form.locator('#directsaleform-user_id');
    this.customerValue = this.form.locator('#select2-directsaleform-user_id-container');
    this.supplierPriceInput = this.form.locator('input[name="DirectSaleForm[supplier_price]"]');
    this.commissionInput = this.form.locator('input[name="DirectSaleForm[commission]"]');
    this.administrativeExpensesInput = this.form.locator(
      'input[name="DirectSaleForm[administrative_expenses]"]',
    );
    this.totalPriceInput = this.form.locator('input[name="DirectSaleForm[totalPrice]"]');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelButton = this.form.locator('button[data-dismiss="modal"], button.btn-secondary');
    this.errors = this.form.locator('.invalid-feedback').filter({ hasText: /\S/ });
  }

  /** Names offered by the Customer dropdown, without the placeholder. */
  async customerNames(): Promise<string[]> {
    return this.customerSelect
      .locator('option')
      .evaluateAll((options) =>
        options
          .filter((option) => (option as HTMLOptionElement).value !== '')
          .map((option) => (option.textContent ?? '').trim()),
      );
  }

  async chooseCustomer(name: string): Promise<void> {
    await this.form.locator('.field-directsaleform-user_id .select2-selection').click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .getByText(name, { exact: true })
      .click();
  }

  /** Types into the price fields the way a user does, so the total updates. */
  async fill(input: DirectSaleInput): Promise<void> {
    if (input.customer !== undefined) await this.chooseCustomer(input.customer);
    const fields: [Locator, string | undefined][] = [
      [this.supplierPriceInput, input.supplierPrice],
      [this.commissionInput, input.commission],
      [this.administrativeExpensesInput, input.administrativeExpenses],
    ];
    for (const [field, value] of fields) {
      if (value === undefined) continue;
      await field.fill('');
      await field.pressSequentially(value, { delay: 0 });
    }
  }

  /** Clicks Save. A valid form is sent; an invalid one shows its errors in place. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.first().click();
  }

  /**
   * Counts real Direct Sale submissions: POSTs to the sale endpoint that are not the form's live
   * validation. The form validates on the server as values are typed (a POST carrying "ajax=..."
   * that only returns messages), so those are counted separately.
   */
  countSubmissions(): () => number {
    return this.countPosts(false);
  }

  /** Counts the validate-only requests the form sends while values are typed. */
  countValidationRequests(): () => number {
    return this.countPosts(true);
  }

  private countPosts(validationOnly: boolean): () => number {
    let count = 0;
    this.page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/ajax/direct-sale-auction?')) {
        return;
      }
      const isValidation = /(^|&)ajax=/.test(request.postData() ?? '');
      if (isValidation === validationOnly) count += 1;
    });
    return () => count;
  }
}
