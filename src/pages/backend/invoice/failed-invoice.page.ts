import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Mazad back-office "Failed Invoice" list (/backend/invoice/failed-invoice/index): items of the
 * Failed list that have an invoice uploaded. Columns: ID, Type, Customer, Vin Number, Item
 * Title, Supplier Name, Actions. Rows are read by header, so a column order change is caught.
 */
export class FailedInvoicePage extends BackendListPage {
  static readonly path = '/backend/invoice/failed-invoice/index';

  readonly vinInput: Locator;
  readonly itemTitleInput: Locator;
  readonly supplierValue: Locator;
  readonly viewInvoiceLinks: Locator;

  constructor(page: Page) {
    super(page, FailedInvoicePage.path, 'failed_supplier_invoice');
    this.vinInput = this.searchForm.locator('#failedinvoicesearch-vin_number');
    this.itemTitleInput = this.searchForm.locator('#failedinvoicesearch-item_title');
    this.supplierValue = this.filterValue('failedinvoicesearch-supplier_id');
    this.viewInvoiceLinks = this.rows.locator('a[title*="View"], a[href*="view-failed-invoice"]');
  }

  /** Rows whose text contains a VIN. */
  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  /** Opens the list filtered to one VIN. */
  async gotoByVin(vin: string): Promise<void> {
    await this.page.goto(
      `${FailedInvoicePage.path}?FailedInvoiceSearch%5Bvin_number%5D=${encodeURIComponent(vin)}`,
    );
  }

  /** Every row as header -> cell text (Actions has no text). */
  async readRows(): Promise<Record<string, string>[]> {
    const headers = (await this.columnHeaders.allInnerTexts()).map((header) => header.trim());
    const rows = await this.rows.all();
    const records: Record<string, string>[] = [];
    for (const row of rows) {
      const cells = (await row.locator('td').allInnerTexts()).map((cell) => cell.trim());
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = cells[index] ?? '';
      });
      records.push(record);
    }
    return records;
  }
}
