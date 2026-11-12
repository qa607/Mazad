import type { Locator, Page } from '@playwright/test';

/**
 * The "Add To Auction" popup (#modal-xl, form #add-to-auction-form) opened from the Failed List's
 * bulk button. It lists only the LIVE and AWAITING auctions owned by the selected vehicles'
 * supplier, and the selected vehicles below the picker.
 */
export class AddToAuctionDialog {
  readonly dialog: Locator;
  readonly title: Locator;
  readonly form: Locator;
  readonly note: Locator;
  readonly auctionSelect: Locator;
  readonly auctionValue: Locator;
  readonly auctionError: Locator;
  /** Shown instead of the form when the supplier has no live or awaiting auction. */
  readonly noAuctionsMessage: Locator;
  readonly vehicleRows: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('.modal.show', {
      has: page.locator('.modal-title', { hasText: 'Add To Auction' }),
    });
    this.title = this.dialog.locator('.modal-title');
    this.form = this.dialog.locator('#add-to-auction-form');
    this.note = this.form.locator('.alert-info');
    this.auctionSelect = this.form.locator('#auction-select-in-add-auction');
    this.auctionValue = this.form.locator('#select2-auction-select-in-add-auction-container');
    this.auctionError = this.form.locator('.field-auction-select-in-add-auction .invalid-feedback');
    this.noAuctionsMessage = this.dialog.getByText(/Not found a live or awaiting auctions/);
    this.vehicleRows = this.form.locator('tbody tr');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelButton = this.dialog
      .locator('button.btn-secondary, button:has-text("Close"), button[data-dismiss="modal"]')
      .first();
  }

  /** Auctions offered, as "<id>=<title> (LIVE|AWAITING)", without the placeholder. */
  async auctionOptions(): Promise<string[]> {
    return this.auctionSelect
      .locator('option')
      .evaluateAll((options) =>
        options
          .filter((option) => (option as HTMLOptionElement).value !== '')
          .map(
            (option) =>
              `${(option as HTMLOptionElement).value}=${(option.textContent ?? '').trim()}`,
          ),
      );
  }

  async chooseAuction(title: string): Promise<void> {
    await this.form.locator('.field-auction-select-in-add-auction .select2-selection').click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: title })
      .click();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /**
   * Counts real add-to-auction submissions: POSTs that are not the form's live validation (a
   * validate-only request carries "ajax=...").
   */
  countSubmissions(): () => number {
    let count = 0;
    this.page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/ajax/add-to-auction?')) return;
      if (!/(^|&)ajax=/.test(request.postData() ?? '')) count += 1;
    });
    return () => count;
  }
}
