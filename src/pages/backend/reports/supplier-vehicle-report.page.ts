import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import {
  type AuctionStage,
  type InspectionStage,
  auctionStages,
  inspectionStages,
} from '@test-data/backend-supplier-vehicle-report.data';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  name: 0,
  status: 1,
  all: 2,
  auction: 3,
  inspection: 4,
  suspended: 5,
  auctionDetails: 6,
  inspectionDetails: 7,
} as const;


/** One supplier as the report shows it. */
export interface SupplierVehicleRow {
  /** Supplier ID (the row key). */
  id: string;
  name: string;
  status: string;
  all: number;
  auction: number;
  inspection: number;
  suspended: number;
  auctionDetails: Record<AuctionStage, number>;
  inspectionDetails: Record<InspectionStage, number>;
}

/**
 * Mazad back-office "Supplier Vehicle Report" (/backend/report/supplier-vehicle-report/index,
 * Report > Supplier Vehicle in the sidebar): one row per supplier with how many of its vehicles
 * are in each auction and inspection stage. Rows are keyed by supplier ID.
 */
export class SupplierVehicleReportPage extends BackendListPage {
  static readonly path = '/backend/report/supplier-vehicle-report/index';
  private static readonly form = 'SupplierVehicleSearch';

  // Search form
  readonly supplierValue: Locator;
  readonly statusValue: Locator;

  // Grid
  readonly countAllSortLink: Locator;
  readonly exportAllButton: Locator;
  readonly exportCsvLink: Locator;
  readonly exportConfirmDialog: Locator;

  constructor(page: Page) {
    super(page, SupplierVehicleReportPage.path, 'default-id');

    this.supplierValue = this.filterValue('suppliervehiclesearch-supplier_id');
    this.statusValue = this.filterValue('suppliervehiclesearch-supplier_status');

    this.countAllSortLink = this.columnHeaders.locator('a', { hasText: /^Count All$/ });
    this.exportAllButton = this.grid.locator('.kv-grid-toolbar button', { hasText: 'Export All' });
    this.exportCsvLink = this.grid.locator('.kv-grid-toolbar .export-full-csv');
    this.exportConfirmDialog = page.locator('.bootstrap-dialog.show');
  }

  /**
   * Opens the report with some filters set. Supplier status defaults to Active on the page, so
   * "all" is needed to include inactive suppliers.
   */
  async gotoFiltered(filters: {
    status?: 'all' | 'active' | 'inactive';
    haveInspection?: boolean;
    haveAuction?: boolean;
    supplierId?: string;
    sort?: string;
    page?: number;
  }): Promise<void> {
    const form = SupplierVehicleReportPage.form;
    const query = new URLSearchParams();
    if (filters.status) query.set(`${form}[supplier_status]`, filters.status);
    if (filters.haveInspection !== undefined) {
      query.set(`${form}[have_inspection]`, filters.haveInspection ? '1' : '0');
    }
    if (filters.haveAuction !== undefined) {
      query.set(`${form}[have_auction]`, filters.haveAuction ? '1' : '0');
    }
    if (filters.supplierId) query.set(`${form}[supplier_id]`, filters.supplierId);
    if (filters.sort) query.set('sort', filters.sort);
    if (filters.page) query.set('page', String(filters.page));
    await this.page.goto(`${SupplierVehicleReportPage.path}?${query.toString()}`);
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-suppliervehiclesearch-supplier_id', supplierOption);
    await this.search();
  }

  /** Clicks the Count All header: the first click sorts ascending, the next descending. */
  async sortByCountAll(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.countAllSortLink);
  }

  /** Every row on the current page, read into numbers. */
  async readRows(): Promise<SupplierVehicleRow[]> {
    const rows: SupplierVehicleRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  /** Every row across all pages of the current filter (the report has few suppliers). */
  async readAllRows(): Promise<SupplierVehicleRow[]> {
    const rows = await this.readRows();
    for (let pageNumber = 2; await this.pageLink(pageNumber).count(); pageNumber++) {
      await this.goToPage(pageNumber);
      rows.push(...(await this.readRows()));
    }
    return rows;
  }

  async readRow(row: Locator): Promise<SupplierVehicleRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const details = <T extends string>(text: string, labels: readonly T[]): Record<T, number> => {
      const values = {} as Record<T, number>;
      for (const label of labels) {
        // Match the label as a whole: at the start, after "Vehicles in", or after the previous
        // count, so "Completed" never matches inside "QC Completed".
        const match = text.match(new RegExp(`(?:^|in |\\d )${label} (\\d+)`));
        if (!match) throw new Error(`"${label}" not found in: ${text}`);
        values[label] = Number(match[1]);
      }
      return values;
    };
    return {
      id: await this.rowId(row),
      name: await cell(column.name),
      status: await cell(column.status),
      all: Number(await cell(column.all)),
      auction: Number(await cell(column.auction)),
      inspection: Number(await cell(column.inspection)),
      suspended: Number(await cell(column.suspended)),
      auctionDetails: details(await cell(column.auctionDetails), auctionStages),
      inspectionDetails: details(await cell(column.inspectionDetails), inspectionStages),
    };
  }

  /** Exports the whole report as CSV (Export All > CSV > Ok) and returns the download. */
  async exportCsv(): Promise<Download> {
    await this.exportAllButton.click();
    await this.exportCsvLink.click();
    await this.exportConfirmDialog.waitFor();
    const download = this.page.waitForEvent('download', { timeout: 90_000 });
    await this.exportConfirmDialog.getByRole('button', { name: /Ok/ }).click();
    return download;
  }
}
