import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/** Values typed into the pricing form, as the page shows them (digits, no "SR"). */
export interface PricingInput {
  buyNowPrice?: string;
  startingPrice?: string;
  minIncrement?: string;
  startingBid?: string;
  supplierPrice?: string;
  commission?: string;
  administrativeExpenses?: string;
}

/**
 * The vehicle "Update Pricing" form (/backend/vehicle/pricing/update?id=<vehicleId>), reached from
 * the Failed List's Repricing action. Saving it is what moves the vehicle to Pricing Done as
 * "RePricing"; the form posts to its own URL. Reserve Price is read-only (calculated).
 */
export class PricingUpdatePage extends BackendPage {
  static readonly path = '/backend/vehicle/pricing/update';

  readonly form: Locator;
  readonly buyNowPriceInput: Locator;
  readonly startingPriceInput: Locator;
  readonly minIncrementInput: Locator;
  readonly startingBidInput: Locator;
  readonly supplierPriceInput: Locator;
  readonly commissionInput: Locator;
  readonly administrativeExpensesInput: Locator;
  readonly reservePriceInput: Locator;
  readonly showBuyNowCheckbox: Locator;
  readonly saveButton: Locator;
  readonly errors: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('form#w0');
    this.buyNowPriceInput = this.form.locator('#pricing-buy_now_price');
    this.startingPriceInput = this.form.locator('#pricing-starting_price');
    this.minIncrementInput = this.form.locator('#pricing-min_increment');
    this.startingBidInput = this.form.locator('#pricing-min_bid');
    this.supplierPriceInput = this.form.locator('#supplier_price');
    this.commissionInput = this.form.locator('#commission_amount');
    this.administrativeExpensesInput = this.form.locator('#administrative_expenses');
    this.reservePriceInput = this.form.locator('#reserve_price');
    this.showBuyNowCheckbox = this.form.locator('#pricing-enabled_buy_now');
    this.saveButton = this.form.locator('button[type="submit"]', { hasText: 'Save' });
    this.errors = this.form.locator('.invalid-feedback').filter({ hasText: /\S/ });
  }

  async goto(vehicleId: string): Promise<void> {
    await this.page.goto(`${PricingUpdatePage.path}?id=${vehicleId}`);
  }

  /** Types into the given fields. */
  async fill(input: PricingInput): Promise<void> {
    const fields: [Locator, string | undefined][] = [
      [this.buyNowPriceInput, input.buyNowPrice],
      [this.startingPriceInput, input.startingPrice],
      [this.minIncrementInput, input.minIncrement],
      [this.startingBidInput, input.startingBid],
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

  /** Ticks or unticks "Show Buy Now?" (a styled checkbox, so its label is clicked). */
  async setShowBuyNow(on: boolean): Promise<void> {
    if ((await this.showBuyNowCheckbox.isChecked()) !== on) {
      await this.form.locator('label[for="pricing-enabled_buy_now"]').click();
    }
  }

  /** Clicks Save. The result (success or errors) is judged by the test. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** Counts form submissions (POSTs to the pricing update URL), to prove an invalid form sends nothing. */
  countSaves(): () => number {
    return this.countPostRequests(PricingUpdatePage.path);
  }
}
