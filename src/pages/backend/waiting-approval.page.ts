import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  auction: 1,
  itemInfo: 2,
  statistics: 3,
  prices: 4,
} as const;

/**
 * Mazad back-office "Under Review Auctions" list (/backend/auction/waiting-approval/index,
 * "Waiting Approval" in the sidebar): vehicles from Approval Required auctions that ended with
 * bids, waiting for the price to be accepted, declined or marked failed. Rows are keyed by
 * auction-item ID and pack labelled values ("Total Bids 3", "VIN ...") into a few cells.
 */
export class WaitingApprovalPage extends BackendListPage {
  static readonly path = '/backend/auction/waiting-approval/index';

  // Search form
  readonly vinInput: Locator;
  readonly titleInput: Locator;
  readonly bidTypeValue: Locator;
  readonly auctionValue: Locator;
  readonly supplierValue: Locator;

  // Grid
  readonly auctionCells: Locator;
  readonly itemInfoCells: Locator;

  // Dialogs: Accept/Decline confirmation, Failed (penalty), Bidding Details
  readonly confirmModal: Locator;
  readonly confirmTitle: Locator;
  readonly confirmMessage: Locator;
  readonly failedModal: Locator;
  readonly failedTitle: Locator;
  readonly penaltyInput: Locator;
  readonly biddersModal: Locator;
  readonly biddersTitle: Locator;

  constructor(page: Page) {
    // The grid's container id is "live", as on the Live list.
    super(page, WaitingApprovalPage.path, 'live');

    this.vinInput = this.searchForm.locator('#waitingapprovalsearch-vin_number');
    this.titleInput = this.searchForm.locator('#waitingapprovalsearch-title');
    this.bidTypeValue = this.filterValue('waitingapprovalsearch-bid_type');
    this.auctionValue = this.filterValue('waitingapprovalsearch-auction_id');
    this.supplierValue = this.filterValue('waitingapprovalsearch-supplier_id');

    this.auctionCells = this.columnCells(column.auction);
    this.itemInfoCells = this.columnCells(column.itemInfo);

    this.confirmModal = page.locator('#modal-m:has(#confirm-modal)');
    this.confirmTitle = this.confirmModal.locator('.modal-title');
    this.confirmMessage = this.confirmModal.locator('.modal-body');
    this.failedModal = page.locator('#modal-m:has(#failed-waiting-approval)');
    this.failedTitle = this.failedModal.locator('.modal-title');
    this.penaltyInput = this.failedModal.locator(
      '#remaininginsuranceamount-remaining_insurance_amount',
    );
    this.biddersModal = page.locator('#modal-xl');
    this.biddersTitle = this.biddersModal.locator('.modal-title');
  }

  acceptLink(row: Locator): Locator {
    return row.locator('a.accept-skipped-price-auction');
  }

  declineLink(row: Locator): Locator {
    return row.locator('a.decline-skipped-price-auction');
  }

  failedLink(row: Locator): Locator {
    return row.locator('a.failed-waiting-approval');
  }

  biddersLink(row: Locator): Locator {
    return row.locator('a[data-url*="view-bidders"]');
  }

  vehicleLink(row: Locator): Locator {
    return row.locator('a[href*="/vehicle/vehicle/update"]');
  }

  failureMarkLink(row: Locator): Locator {
    return row.locator('a[href*="/report/failed-report/index"]');
  }

  private async cellText(row: Locator, columnSeq: number): Promise<string> {
    return (await this.rowCell(row, columnSeq).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The vehicle's VIN in a row, without the failure mark ("LVTDB21B3PD053087 #F1" -> VIN). */
  async rowVin(row: Locator): Promise<string> {
    const text = await this.cellText(row, column.itemInfo);
    const match = text.match(/VIN ([A-Z0-9]{11,17})/);
    if (!match) throw new Error(`No VIN in the row: ${text}`);
    return match[1];
  }

  /** A labelled value of the Item Info cell ("Title", "Supplier"...). */
  async rowItemValue(row: Locator, label: 'Title' | 'Supplier'): Promise<string> {
    const text = await this.cellText(row, column.itemInfo);
    const match = text.match(new RegExp(`${label} (.+?) (?:Type|Supplier|VIN|Plate) `));
    if (!match) throw new Error(`No "${label}" in the row: ${text}`);
    return match[1].trim();
  }

  /** The row's auction title, from the Auction cell. */
  async rowAuctionTitle(row: Locator): Promise<string> {
    const text = await this.cellText(row, column.auction);
    const match = text.match(/Title (.+?) Auction Source/);
    if (!match) throw new Error(`No auction title in the row: ${text}`);
    return match[1].trim();
  }

  /** Total bids of a row, from the Statistics cell. */
  async rowTotalBids(row: Locator): Promise<number> {
    const text = await this.cellText(row, column.statistics);
    const match = text.match(/Total Bids (\d+)/);
    if (!match) throw new Error(`No "Total Bids" in the row: ${text}`);
    return Number(match[1]);
  }

  /** A price of the Prices cell, as shown ("12,500 SR"). */
  async rowPrice(
    row: Locator,
    label: 'Highest Price' | 'Net Price (Vat Inclusive)' | 'Net Price without VAT',
  ): Promise<string> {
    const text = await this.cellText(row, column.prices);
    const escaped = label.replace(/[()]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped} ([\\d,]+ SR)`));
    if (!match) throw new Error(`No "${label}" in the row: ${text}`);
    return match[1];
  }

  /** Total bids of every row on the page, in grid order. */
  async totalBids(): Promise<number[]> {
    const bids: number[] = [];
    for (const row of await this.rows.all()) bids.push(await this.rowTotalBids(row));
    return bids;
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
    await this.selectFilterOption('field-waitingapprovalsearch-bid_type', type);
    await this.search();
  }

  async filterByAuction(auctionTitle: string): Promise<void> {
    await this.selectFilterOption('field-waitingapprovalsearch-auction_id', auctionTitle);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-waitingapprovalsearch-supplier_id', supplierOption);
    await this.search();
  }

  /** Opens the list sorted by Statistics (total bids): ascending, or descending. */
  async gotoSortedByStatistics(descending = false): Promise<void> {
    await this.page.goto(`${WaitingApprovalPage.path}?sort=${descending ? '-' : ''}statistics`);
  }

  /**
   * Reset may reload only the grid (PJAX, as on Live) rather than the page, so it waits for the
   * plain list URL instead of a page load.
   */
  override async reset(): Promise<void> {
    await this.resetButton.click();
    await this.page.waitForURL(
      (url) => url.pathname === WaitingApprovalPage.path && url.search === '',
    );
    await this.grid.waitFor();
  }

  /** Closes a dialog with its own Cancel/Close button, and waits until it is hidden. */
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
