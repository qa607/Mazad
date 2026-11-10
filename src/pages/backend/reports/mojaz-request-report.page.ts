import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { type MojazStatus, mojazStatuses } from '@test-data/backend-mojaz-request-report.data';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  title: 1,
  vin: 2,
  customerName: 3,
  customerPhone: 4,
  mojazAr: 5,
  mojazEn: 6,
  status: 7,
  createdAt: 8,
  updatedAt: 9,
} as const;

/** One Mojaz request as the report shows it. */
export interface MojazRequestRow {
  key: string;
  title: string;
  vin: string;
  customerName: string;
  customerPhone: string;
  /** Links of the generated Arabic and English reports ("" when there is none). */
  mojazArUrl: string;
  mojazEnUrl: string;
  status: string;
  /** "2026-08-06 18:07:41" */
  createdAt: string;
  updatedAt: string;
}


/**
 * Mazad back-office "Request Mojaz" report (/backend/report/mojaz-request/index, Report >
 * Request Mojaz in the sidebar): customers' requests for a Mojaz vehicle-history report, with
 * links to the generated Arabic and English PDFs. Rows are keyed by request ID.
 */
export class MojazRequestReportPage extends BackendListPage {
  static readonly path = '/backend/report/mojaz-request/index';
  private static readonly form = 'MojazRequestSearch';

  // Search form
  readonly vinInput: Locator;
  readonly customerNameInput: Locator;
  readonly customerPhoneInput: Locator;
  readonly statusValue: Locator;

  // Grid
  readonly creationDateSortLink: Locator;
  readonly updatedAtSortLink: Locator;
  readonly exportAllButton: Locator;
  readonly exportCsvLink: Locator;
  readonly exportConfirmDialog: Locator;

  constructor(page: Page) {
    super(page, MojazRequestReportPage.path, 'default-id');

    this.vinInput = this.searchForm.locator('#mojazrequestsearch-vin_number');
    this.customerNameInput = this.searchForm.locator('#mojazrequestsearch-customer_name_en');
    this.customerPhoneInput = this.searchForm.locator('#mojazrequestsearch-customer_phone');
    this.statusValue = this.filterValue('mojazrequestsearch-status');

    // The header's text ends with a space ("Creation Date ").
    this.creationDateSortLink = this.columnHeaders.locator('a', {
      hasText: /^\s*Creation Date\s*$/,
    });
    this.updatedAtSortLink = this.columnHeaders.locator('a', { hasText: /^Updated At$/ });
    this.exportAllButton = this.grid.locator('.kv-grid-toolbar button', { hasText: 'Export All' });
    this.exportCsvLink = this.grid.locator('.kv-grid-toolbar .export-full-csv');
    this.exportConfirmDialog = page.locator('.bootstrap-dialog.show');
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByCustomerName(name: string): Promise<void> {
    await this.customerNameInput.fill(name);
    await this.search();
  }

  async searchByCustomerPhone(phone: string): Promise<void> {
    await this.customerPhoneInput.fill(phone);
    await this.search();
  }

  async filterByStatus(status: MojazStatus): Promise<void> {
    await this.selectFilterOption('field-mojazrequestsearch-status', mojazStatuses[status]);
    await this.search();
  }

  /** Opens the report with only one status listed (by its filter value). */
  async gotoStatus(status: MojazStatus): Promise<void> {
    const query = new URLSearchParams({ [`${MojazRequestReportPage.form}[status]`]: status });
    await this.page.goto(`${MojazRequestReportPage.path}?${query.toString()}`);
  }

  /** Opens the report with requests created between two days ("2026-08-06"), both included. */
  async gotoCreatedBetween(from: string, to: string): Promise<void> {
    const query = new URLSearchParams({
      [`${MojazRequestReportPage.form}[date_range]`]: `${from} - ${to}`,
    });
    await this.page.goto(`${MojazRequestReportPage.path}?${query.toString()}`);
  }

  /** Clicks a date header: the first click sorts ascending, the next descending. */
  async sortBy(column: 'Creation Date' | 'Updated At'): Promise<void> {
    await this.clickAndWaitForPageLoad(
      column === 'Creation Date' ? this.creationDateSortLink : this.updatedAtSortLink,
    );
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<MojazRequestRow[]> {
    const rows: MojazRequestRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<MojazRequestRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const link = async (seq: number) => {
      const anchor = this.rowCell(row, seq).locator('a');
      return (await anchor.count()) ? ((await anchor.first().getAttribute('href')) ?? '') : '';
    };
    return {
      key: await this.rowId(row),
      title: await cell(column.title),
      vin: await cell(column.vin),
      customerName: await cell(column.customerName),
      customerPhone: await cell(column.customerPhone),
      mojazArUrl: await link(column.mojazAr),
      mojazEnUrl: await link(column.mojazEn),
      status: await cell(column.status),
      createdAt: await cell(column.createdAt),
      updatedAt: await cell(column.updatedAt),
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
