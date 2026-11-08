import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  title: 4,
  vin: 5,
  city: 7,
  year: 8,
} as const;

/** Mazad back-office "Ready For Pricing" auction list (/backend/auction/ready-for-pricing/index). */
export class ReadyForPricingPage extends BackendListPage {
  static readonly path = '/backend/auction/ready-for-pricing/index';

  // Search form
  readonly vinInput: Locator;
  readonly titleInput: Locator;
  readonly cityValue: Locator;
  readonly yearValue: Locator;

  // Grid
  readonly titleCells: Locator;
  readonly vinCells: Locator;
  readonly cityCells: Locator;
  readonly yearCells: Locator;
  readonly yearSortLink: Locator;
  readonly bulkSuspendButton: Locator;

  // Suspend modal
  readonly suspendModal: Locator;
  readonly suspendModalTitle: Locator;
  readonly suspendReasonLabels: Locator;
  readonly suspendReasonError: Locator;
  readonly suspendModalSubmitButton: Locator;
  readonly suspendModalCloseButton: Locator;

  constructor(page: Page) {
    super(page, ReadyForPricingPage.path, 'ready-for-pricing');

    this.vinInput = this.searchForm.locator('#readyforpricingsearch-vin_number');
    this.titleInput = this.searchForm.locator('#readyforpricingsearch-title_en');
    this.cityValue = this.filterValue('city-id');
    this.yearValue = this.filterValue('readyforpricingsearch-year');

    this.titleCells = this.columnCells(column.title);
    this.vinCells = this.columnCells(column.vin);
    this.cityCells = this.columnCells(column.city);
    this.yearCells = this.columnCells(column.year);
    this.yearSortLink = this.columnHeaders.locator('a', { hasText: /^Year$/ });
    this.bulkSuspendButton = this.grid.locator('.kv-grid-toolbar a.suspend-btn');

    this.suspendModal = page.locator('#modal-m');
    const form = this.suspendModal.locator('#suspend-reason');
    this.suspendModalTitle = this.suspendModal.locator('.modal-title');
    this.suspendReasonLabels = form.locator('#otherreasonvalidation-reason_id label');
    this.suspendReasonError = form.locator(
      '.field-otherreasonvalidation-reason_id .invalid-feedback',
    );
    this.suspendModalSubmitButton = form.locator('button[type="submit"]');
    this.suspendModalCloseButton = form.locator('button[data-dismiss="modal"]');
  }

  /** Opens the list sorted by vehicle ID, oldest first. */
  async gotoSortedById(): Promise<void> {
    await this.page.goto(`${ReadyForPricingPage.path}?sort=id`);
  }

  rowVin(row: Locator): Locator {
    return this.rowCell(row, column.vin);
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.search();
  }

  async filterByCity(city: string): Promise<void> {
    await this.selectFilterOption('field-city-id', city);
    await this.search();
  }

  async filterByYear(year: string): Promise<void> {
    await this.selectFilterOption('field-readyforpricingsearch-year', year);
    await this.search();
  }

  /** Clicks the Year header: the first click sorts ascending, the next descending. */
  async sortByYear(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.yearSortLink);
  }

  /** Years shown on the current page, in grid order. */
  async years(): Promise<number[]> {
    return (await this.yearCells.allInnerTexts()).map((year) => Number(year.trim()));
  }

  async openSuspendModal(vehicleId: string): Promise<void> {
    await this.row(vehicleId).locator('a.suspend-btn').click();
  }

  async chooseSuspendReason(reason: string | RegExp): Promise<void> {
    await this.suspendReasonLabels.filter({ hasText: reason }).click();
  }

  /** Suspends one vehicle with one of the suspend modal's reasons, from its row action. */
  async suspend(vehicleId: string, reason: string | RegExp): Promise<void> {
    await this.openSuspendModal(vehicleId);
    await this.chooseSuspendReason(reason);
    await this.suspendModalSubmitButton.click();
  }
}
