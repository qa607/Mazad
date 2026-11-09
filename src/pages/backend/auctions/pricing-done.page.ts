import type { Locator, Page } from '@playwright/test';
import { AuctionListPage } from '@pages/backend/auctions/auction-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  auctionSource: 3,
  title: 4,
  city: 5,
  vin: 6,
  status: 7,
  startingPrice: 8,
  supplier: 14,
} as const;

/** Mazad back-office "Pricing Done" auction list (/backend/auction/pricing-done/index). */
export class PricingDonePage extends AuctionListPage {
  static readonly path = '/backend/auction/pricing-done/index';

  // Search form
  readonly vinInput: Locator;
  readonly titleInput: Locator;
  readonly startingPriceInput: Locator;
  readonly buyNowPriceInput: Locator;
  readonly statusValue: Locator;
  readonly supplierValue: Locator;

  // Grid
  readonly auctionSourceCells: Locator;
  readonly titleCells: Locator;
  readonly vinCells: Locator;
  readonly statusCells: Locator;
  readonly startingPriceCells: Locator;
  readonly supplierCells: Locator;
  readonly startingPriceSortLink: Locator;
  readonly bulkMoveToUpcomingButton: Locator;
  readonly bulkSuspendButton: Locator;

  constructor(page: Page) {
    super(page, PricingDonePage.path, 'pricing-done');

    this.vinInput = this.searchForm.locator('#pricingdonesearch-vin_number');
    this.titleInput = this.searchForm.locator('#pricingdonesearch-title_en');
    this.startingPriceInput = this.searchForm.locator('#pricingdonesearch-starting_price');
    this.buyNowPriceInput = this.searchForm.locator('#pricingdonesearch-buy_now_price');
    this.statusValue = this.filterValue('pricingdonesearch-status');
    this.supplierValue = this.filterValue('pricingdonesearch-supplier_id');

    this.auctionSourceCells = this.columnCells(column.auctionSource);
    this.titleCells = this.columnCells(column.title);
    this.vinCells = this.columnCells(column.vin);
    this.statusCells = this.columnCells(column.status);
    this.startingPriceCells = this.columnCells(column.startingPrice);
    this.supplierCells = this.columnCells(column.supplier);
    this.startingPriceSortLink = this.columnHeaders.locator('a', { hasText: /^Starting Price$/ });
    const toolbar = this.grid.locator('.kv-grid-toolbar');
    this.bulkMoveToUpcomingButton = toolbar.locator('a.upcoming-multi-btn');
    this.bulkSuspendButton = toolbar.locator('a.suspend-btn');
  }

  /** Opens the list sorted by starting price, highest first. */
  async gotoSortedByStartingPriceDesc(): Promise<void> {
    await this.page.goto(`${PricingDonePage.path}?sort=-lastPricing.starting_price`);
  }

  rowVin(row: Locator): Locator {
    return this.rowCell(row, column.vin);
  }

  rowTitle(row: Locator): Locator {
    return this.rowCell(row, column.title);
  }

  rowStartingPrice(row: Locator): Locator {
    return this.rowCell(row, column.startingPrice);
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.search();
  }

  async searchByStartingPrice(price: string): Promise<void> {
    await this.startingPriceInput.fill(price);
    await this.search();
  }

  async searchByBuyNowPrice(price: string): Promise<void> {
    await this.buyNowPriceInput.fill(price);
    await this.search();
  }

  async filterByStatus(status: string): Promise<void> {
    await this.selectFilterOption('field-pricingdonesearch-status', status);
    await this.search();
  }

  async filterByYear(year: string): Promise<void> {
    await this.selectFilterOption('field-pricingdonesearch-year', year);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-pricingdonesearch-supplier_id', supplierOption);
    await this.search();
  }

  async filterByAuctionType(type: string): Promise<void> {
    await this.selectFilterOption('field-pricingdonesearch-auction_type', type);
    await this.search();
  }

  /** Clicks the Starting Price header: the first click sorts ascending, the next descending. */
  async sortByStartingPrice(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.startingPriceSortLink);
  }

  /** Starting prices shown on the current page, in grid order ("22,500" -> 22500). */
  async startingPrices(): Promise<number[]> {
    return this.prices(this.startingPriceCells);
  }

  /** Selects one vehicle and opens the bulk "Move to upcoming" confirmation. */
  async openMoveToUpcomingConfirmation(vehicleId: string): Promise<void> {
    await this.rowCheckbox(this.row(vehicleId)).check();
    await this.bulkMoveToUpcomingButton.click();
  }
}
