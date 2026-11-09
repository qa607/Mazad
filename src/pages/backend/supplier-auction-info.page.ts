import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

export type BidType = 'Standard' | 'Price Offering';

/**
 * "Auction Info" tab of Update Supplier (/backend/users/supplier/update?id=<id>#pane-auction).
 * It has its own form, saved on its own (save-auction-tab), so it changes only the supplier's
 * auction settings: auction type, bid type, display names and logos.
 */
export class SupplierAuctionInfoPage extends BackendPage {
  readonly tab: Locator;
  readonly form: Locator;
  readonly auctionTypeSelect: Locator;
  readonly bidTypeSelect: Locator;
  readonly saveButton: Locator;
  readonly alertTitle: Locator;
  readonly alertOkButton: Locator;

  constructor(page: Page) {
    super(page);
    this.tab = page.locator('a[href="#pane-auction"]');
    this.form = page.locator('#form-supplier-auction');
    this.auctionTypeSelect = this.form.locator('#supplier-auction_type');
    this.bidTypeSelect = this.form.locator('#supplier-bid_type');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.alertTitle = page.locator('.swal2-popup .swal2-title');
    this.alertOkButton = page.locator('.swal2-popup .swal2-confirm');
  }

  /** Opens the supplier's update page on the Auction Info tab. */
  async goto(supplierId: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier/update?id=${supplierId}`);
    await this.tab.click();
    await this.bidTypeSelect.waitFor({ state: 'attached' });
  }

  /** The bid type currently saved (the selected option's label). */
  async bidType(): Promise<BidType> {
    const label = await this.bidTypeSelect.evaluate(
      (select: HTMLSelectElement) => select.selectedOptions[0]?.text.trim() ?? '',
    );
    return label as BidType;
  }

  async chooseBidType(type: BidType): Promise<void> {
    await this.form.locator('#supplier-bid_type + .select2 .select2-selection').click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: new RegExp(`^\\s*${type}\\s*$`) })
      .click();
  }

  /** Saves the tab and closes the success alert. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.alertTitle.waitFor();
  }

  /** Opens the tab, sets the bid type, saves and closes the alert. */
  async setBidType(supplierId: string, type: BidType): Promise<void> {
    await this.goto(supplierId);
    await this.chooseBidType(type);
    await this.save();
    await this.alertOkButton.click();
  }
}
