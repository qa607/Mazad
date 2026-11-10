import type { Download, Locator, Page, Response } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  item: 1,
  countAuction: 2,
  fees: 3,
  mojazProfit: 4,
} as const;

/** One vehicle as the report shows it. */
export interface VehicleReportRow {
  /** Vehicle ID (the row key). */
  id: string;
  title: string;
  supplier: string;
  vin: string;
  plate: string;
  countAuction: number;
  /** The Fees & Commissions cell ("This vehicle is not sold" for an unsold vehicle). */
  fees: string;
  /** "35.00 SR" */
  mojazProfit: string;
}

/** What the Export button returned: the server's answer, and the file when there is one. */
export interface VehicleExport {
  response: Response;
  download: Download | null;
}

/**
 * Mazad back-office "Vehicles Report" (/backend/report/item-report/index, Report > Vehicles in
 * the sidebar): one row per vehicle that went to auction, with how many auctions it entered and,
 * once sold, the fees and commissions. Rows are keyed by vehicle ID.
 */
export class VehiclesReportPage extends BackendListPage {
  static readonly path = '/backend/report/item-report/index';
  /** Endpoint the Export button posts the current filters to; it answers with the file's URL. */
  static readonly exportEndpoint = '/report/ajax/export-excel';

  // Search form
  readonly vinInput: Locator;
  readonly plateInput: Locator;
  readonly titleInput: Locator;
  readonly makeValue: Locator;
  readonly yearValue: Locator;
  readonly supplierValue: Locator;

  // Grid
  readonly countAuctionSortLink: Locator;
  readonly exportButton: Locator;
  readonly alertTitle: Locator;

  constructor(page: Page) {
    super(page, VehiclesReportPage.path, 'default-id');

    this.vinInput = this.searchForm.locator('#itemreportsearch-vin_number');
    this.plateInput = this.searchForm.locator('#itemreportsearch-plate_number');
    this.titleInput = this.searchForm.locator('#itemreportsearch-item_title');
    this.makeValue = this.filterValue('itemreportsearch-make');
    this.yearValue = this.filterValue('itemreportsearch-year');
    this.supplierValue = this.filterValue('itemreportsearch-supplier_id');

    this.countAuctionSortLink = this.columnHeaders.locator('a', { hasText: /^Count Auction$/ });
    this.exportButton = this.grid.locator('.export-item-btn');
    this.alertTitle = page.locator('.swal2-popup .swal2-title');
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByPlate(plate: string): Promise<void> {
    await this.plateInput.fill(plate);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.search();
  }

  async filterByMake(make: string): Promise<void> {
    await this.selectFilterOption('field-itemreportsearch-make', make);
    await this.search();
  }

  async filterByYear(year: string): Promise<void> {
    await this.selectFilterOption('field-itemreportsearch-year', year);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-itemreportsearch-supplier_id', supplierOption);
    await this.search();
  }

  /** Clicks the Count Auction header: the first click sorts ascending, the next descending. */
  async sortByCountAuction(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.countAuctionSortLink);
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<VehicleReportRow[]> {
    const rows: VehicleReportRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<VehicleReportRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const item = await cell(column.item);
    const part = (pattern: RegExp) => item.match(pattern)?.[1]?.trim() ?? '';
    return {
      id: await this.rowId(row),
      title: part(/Title (.+?) Supplier Name/),
      supplier: part(/Supplier Name (.+?) Vin Number/),
      vin: part(/Vin Number (\S+)/),
      plate: part(/Plate Number (.*)$/),
      countAuction: Number(await cell(column.countAuction)),
      fees: await cell(column.fees),
      mojazProfit: (await cell(column.mojazProfit)).replace(/^Mojaz Profit\s*/, ''),
    };
  }

  /**
   * Presses Export: the page posts the filters in its address to the export endpoint, which
   * answers with the file's URL, and the browser then downloads it. Returns the endpoint's answer
   * and the downloaded file (null when the export fails and nothing is downloaded).
   */
  async export(): Promise<VehicleExport> {
    const response = this.page.waitForResponse((r) =>
      r.url().includes(VehiclesReportPage.exportEndpoint),
    );
    const download = this.page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
    await this.exportButton.click();
    const answer = await response;
    return { response: answer, download: answer.ok() ? await download : null };
  }
}
