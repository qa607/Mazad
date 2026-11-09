import type { Locator, Page } from '@playwright/test';
import { AuctionListPage } from '@pages/backend/auctions/auction-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  auctionSource: 3,
  title: 4,
  city: 5,
  vin: 6,
  startingPrice: 7,
  supplier: 13,
} as const;

/**
 * Mazad back-office "Upcoming" auction list (/backend/auction/upcoming/index): priced vehicles
 * waiting to be put in an auction. Rows are keyed by upcoming-item ID, not vehicle ID.
 */
export class UpcomingPage extends AuctionListPage {
  static readonly path = '/backend/auction/upcoming/index';
  static readonly createAuctionPath = '/backend/auction/upcoming/create';

  // Search form
  readonly vinInput: Locator;
  readonly titleInput: Locator;
  readonly startingPriceInput: Locator;
  readonly buyNowPriceInput: Locator;
  readonly supplierValue: Locator;

  // Grid
  readonly auctionSourceCells: Locator;
  readonly titleCells: Locator;
  readonly vinCells: Locator;
  readonly startingPriceCells: Locator;
  readonly supplierCells: Locator;
  readonly startingPriceSortLink: Locator;
  readonly bulkAddToAuctionButton: Locator;
  readonly createAuctionButton: Locator;
  readonly bulkBackToPricingDoneButton: Locator;
  readonly bulkSuspendButton: Locator;

  // "Add To Auction" modal (lists the live and awaiting auctions to add vehicles to)
  readonly addToAuctionModal: Locator;
  readonly addToAuctionModalTitle: Locator;
  readonly addToAuctionModalCloseButton: Locator;

  constructor(page: Page) {
    super(page, UpcomingPage.path, 'upcoming');

    this.vinInput = this.searchForm.locator('#upcomingsearch-vin_number');
    this.titleInput = this.searchForm.locator('#upcomingsearch-title');
    this.startingPriceInput = this.searchForm.locator('#upcomingsearch-starting_price');
    this.buyNowPriceInput = this.searchForm.locator('#upcomingsearch-buy_now_price');
    this.supplierValue = this.filterValue('upcomingsearch-supplier_id');

    this.auctionSourceCells = this.columnCells(column.auctionSource);
    this.titleCells = this.columnCells(column.title);
    this.vinCells = this.columnCells(column.vin);
    this.startingPriceCells = this.columnCells(column.startingPrice);
    this.supplierCells = this.columnCells(column.supplier);
    this.startingPriceSortLink = this.columnHeaders.locator('a', { hasText: /^Starting Price$/ });
    const toolbar = this.grid.locator('.kv-grid-toolbar');
    this.bulkAddToAuctionButton = toolbar.locator('a.add-to-auction');
    this.createAuctionButton = toolbar.locator(`a[href="${UpcomingPage.createAuctionPath}"]`);
    this.bulkBackToPricingDoneButton = toolbar.locator('a.pricing-done-back-auction-type');
    this.bulkSuspendButton = toolbar.locator('a.suspend-btn');

    this.addToAuctionModal = page.locator('#modal-xl');
    this.addToAuctionModalTitle = this.addToAuctionModal.locator('.modal-title');
    this.addToAuctionModalCloseButton = this.addToAuctionModal
      .locator('button[data-dismiss="modal"]')
      .last();
  }

  /** Opens the list sorted by starting price, highest first. */
  async gotoSortedByStartingPriceDesc(): Promise<void> {
    await this.page.goto(`${UpcomingPage.path}?sort=-pricing.starting_price`);
  }

  rowStartingPrice(row: Locator): Locator {
    return this.rowCell(row, column.startingPrice);
  }

  rowVin(row: Locator): Locator {
    return this.rowCell(row, column.vin);
  }

  rowTitle(row: Locator): Locator {
    return this.rowCell(row, column.title);
  }

  rowSupplier(row: Locator): Locator {
    return this.rowCell(row, column.supplier);
  }

  /** The vehicle ID behind a row (rows themselves are keyed by upcoming-item ID). */
  async rowVehicleId(row: Locator): Promise<string> {
    const value = await this.rowCheckbox(row).getAttribute('value');
    if (!value) throw new Error('Grid row checkbox has no vehicle ID.');
    return value;
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.search();
  }

  async filterByYear(year: string): Promise<void> {
    await this.selectFilterOption('field-upcomingsearch-year', year);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-upcomingsearch-supplier_id', supplierOption);
    await this.search();
  }

  async filterByType(type: string): Promise<void> {
    await this.selectFilterOption('field-upcomingsearch-type', type);
    await this.search();
  }

  /** Clicks the Starting Price header: the first click sorts ascending, the next descending. */
  async sortByStartingPrice(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.startingPriceSortLink);
  }

  /** Starting prices shown on the current page, in grid order ("22,500 SR" -> 22500). */
  async startingPrices(): Promise<number[]> {
    return this.prices(this.startingPriceCells);
  }

  /** Selects one row and opens the bulk "Back to pricing done" confirmation. */
  async openBackToPricingDoneConfirmation(rowKey: string): Promise<void> {
    await this.rowCheckbox(this.row(rowKey)).check();
    await this.bulkBackToPricingDoneButton.click();
  }

  /** Selects one row and opens the "Add To Auction" modal. */
  async openAddToAuction(rowKey: string): Promise<void> {
    await this.rowCheckbox(this.row(rowKey)).check();
    await this.bulkAddToAuctionButton.click();
  }

  /** Closes the "Add To Auction" modal and waits until it has closed. */
  async closeAddToAuction(): Promise<void> {
    await this.closeModal(this.addToAuctionModal, this.addToAuctionModalCloseButton);
  }

  async openCreateAuction(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.createAuctionButton);
  }
}
