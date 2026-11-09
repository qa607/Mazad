import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  auction: 2,
  itemInfo: 3,
  date: 6,
  actions: 7,
} as const;

/**
 * Mazad back-office "Live Auctions" list (/backend/auction/live/index): vehicles in an auction
 * that is running now. Rows are keyed by auction-item ID. Each row packs several labelled values
 * ("Bidding Type Standard", "VIN ...") into a few cells.
 */
export class LivePage extends BackendListPage {
  static readonly path = '/backend/auction/live/index';

  // Search form
  readonly titleInput: Locator;
  readonly vinInput: Locator;
  readonly bidTypeValue: Locator;
  readonly auctionTypeValue: Locator;

  // Grid
  readonly auctionCells: Locator;
  readonly itemInfoCells: Locator;
  readonly bulkExtendButton: Locator;

  // Dialogs opened from a row or the toolbar (all share these generic parts)
  readonly confirmModal: Locator;
  readonly confirmMessage: Locator;
  readonly confirmCancelButton: Locator;
  readonly largeModal: Locator;
  readonly extraLargeModal: Locator;

  constructor(page: Page) {
    super(page, LivePage.path, 'live');

    this.titleInput = this.searchForm.locator('#livesearch-title');
    this.vinInput = this.searchForm.locator('#livesearch-vin_number');
    this.bidTypeValue = this.filterValue('livesearch-bid_type');
    this.auctionTypeValue = this.filterValue('livesearch-auction_type');

    this.auctionCells = this.columnCells(column.auction);
    this.itemInfoCells = this.columnCells(column.itemInfo);
    this.bulkExtendButton = this.grid.locator('.kv-grid-toolbar a.extend-auction');

    this.confirmModal = page.locator('#modal-m');
    this.confirmMessage = this.confirmModal.locator('.modal-body');
    this.confirmCancelButton = this.confirmModal.locator('button[data-dismiss="modal"]');
    this.largeModal = page.locator('#modal-lg');
    this.extraLargeModal = page.locator('#modal-xl');
  }

  /** Opens the list filtered to one VIN. */
  async gotoByVin(vin: string): Promise<void> {
    await this.page.goto(`${LivePage.path}?LiveSearch%5Bvin_number%5D=${encodeURIComponent(vin)}`);
  }

  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }

  /** The vehicle's VIN in a row, without the failure mark ("JTNAG4CK4S3052913 #F2" -> VIN). */
  async rowVin(row: Locator): Promise<string> {
    const text = await this.rowCell(row, column.itemInfo).innerText();
    const match = text.match(/VIN\s+([A-Z0-9]{11,17})/);
    if (!match) throw new Error(`No VIN in the Live row: ${text}`);
    return match[1];
  }

  /** The row's labelled value from the Item Info cell ("Supplier", "City", "Title"...). */
  async rowItemValue(row: Locator, label: string): Promise<string> {
    const text = (await this.rowCell(row, column.itemInfo).innerText()).replace(/\s+/g, ' ');
    const labels = 'Title|Supplier|VIN|City|Plate';
    const match = text.match(new RegExp(`${label} (.+?)(?= (?:${labels}) |$)`));
    if (!match) throw new Error(`No "${label}" in the Live row: ${text}`);
    return match[1].trim();
  }

  /** The row's auction title, from the Auction cell. */
  async rowAuctionTitle(row: Locator): Promise<string> {
    const text = (await this.rowCell(row, column.auction).innerText()).replace(/\s+/g, ' ');
    const match = text.match(/Title (.+?) Auction Source/);
    if (!match) throw new Error(`No auction title in the Live row: ${text}`);
    return match[1].trim();
  }

  /** The row's Auto Extend switch (a bootstrap-switch around a checkbox). */
  autoExtendCheckbox(row: Locator): Locator {
    return row.locator('input.auto-extend');
  }

  disableLink(row: Locator): Locator {
    return row.locator('a.failed-btn');
  }

  viewLink(row: Locator): Locator {
    return row.locator('a[title="View"]');
  }

  /** Links in a row that open a dialog, by the endpoint the dialog is loaded from. */
  dialogLink(row: Locator, endpoint: string): Locator {
    return row.locator(`a[data-url*="${endpoint}"]`);
  }

  /**
   * Reset on this page reloads only the grid (PJAX), not the whole page, so it waits for that
   * grid response and the plain list URL instead of a page load.
   */
  override async reset(): Promise<void> {
    const gridReloaded = this.page.waitForResponse(
      (response) => response.url().includes('_pjax=') && response.url().includes(LivePage.path),
    );
    await this.resetButton.click();
    await gridReloaded;
    await this.page.waitForURL((url) => url.pathname === LivePage.path && url.search === '');
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.search();
  }

  async filterByBidType(type: 'Standard' | 'Price Offering'): Promise<void> {
    await this.selectFilterOption('field-livesearch-bid_type', type);
    await this.search();
  }

  async filterByAuctionType(type: 'Instant Auction' | 'Approval Required Auction'): Promise<void> {
    await this.selectFilterOption('field-livesearch-auction_type', type);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-livesearch-supplier_id', supplierOption);
    await this.search();
  }

  /** Closes whichever dialog is open with its own Cancel/close button, and waits until hidden. */
  async closeDialog(dialog: Locator): Promise<void> {
    const close = dialog.locator('button[data-dismiss="modal"]').last();
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (await close.isVisible()) await close.click();
      try {
        await dialog.waitFor({ state: 'hidden', timeout: 1_000 });
        return;
      } catch {
        // Still open: the click landed during the opening animation. Try again.
      }
    }
  }
}
