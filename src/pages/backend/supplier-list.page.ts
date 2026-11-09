import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/backend-list.page';
import { selectOption, selectedOption } from '@utils/widgets';
import { escapeRegExp } from '@utils/text';
import {
  type SortableColumn,
  type SupplierColumn,
  sortableColumns,
  supplierColumns,
} from '@test-data/supplier.data';

export interface SupplierFilters {
  phone?: string;
  /** "English Name" filter (the account name). */
  nameEn?: string;
  /** "Supplier Name En" filter (the company name). */
  supplierNameEn?: string;
  email?: string;
  status?: 'active' | 'inactive';
  commission?: 'Yes' | 'No';
  requestMojaz?: 'Yes' | 'No';
}

/** One grid row as text, keyed by column header. */
export type SupplierRow = Record<SupplierColumn, string>;

/** Mazad back-office Supplier List (/backend/users/supplier/index). */
export class SupplierListPage extends BackendListPage {
  static readonly path = '/backend/users/supplier/index';

  readonly createButton: Locator;

  readonly phoneFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly supplierNameEnFilter: Locator;
  readonly emailFilter: Locator;
  readonly statusFilter: Locator;
  readonly commissionFilter: Locator;
  readonly requestMojazFilter: Locator;

  /** Header labels that are sort links. */
  readonly sortableColumnLabels: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;
  readonly openDropdown: Locator;
  /** In-page "Ok to proceed?" dialog shown before an export is generated. */
  readonly exportConfirmation: Locator;
  readonly exportConfirmButton: Locator;

  constructor(page: Page) {
    // The search form is still found by its generated id; see the pending DOM review.
    super(page, SupplierListPage.path, 'default-id', '#w0');
    this.createButton = page.locator('a[href="/backend/users/supplier/create"]');
    this.phoneFilter = page.locator('#suppliersearch-phone');
    this.nameEnFilter = page.locator('#suppliersearch-name_en');
    this.supplierNameEnFilter = page.locator('#suppliersearch-supplier_name_en');
    this.emailFilter = page.locator('#suppliersearch-email');
    this.statusFilter = page.locator('.field-suppliersearch-status');
    this.commissionFilter = page.locator('.field-suppliersearch-commission');
    this.requestMojazFilter = page.locator('.field-suppliersearch-enable_mojaz_request');

    this.sortableColumnLabels = this.columnHeaders.locator('a[data-sort]');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('#w1-cols-list label');
    this.openDropdown = page.locator('.dropdown-menu.show');
    this.exportConfirmation = page.locator('.modal.show', { hasText: 'Ok to proceed?' });
    this.exportConfirmButton = this.exportConfirmation.getByRole('button', { name: 'Ok' });
  }

  /** Opens the list, optionally with query parameters (e.g. { sort: '-id', page: '2' }). */
  override async goto(query: Record<string, string> = {}): Promise<void> {
    const params = new URLSearchParams(query).toString();
    await this.page.goto(params ? `${SupplierListPage.path}?${params}` : SupplierListPage.path);
  }

  async fillFilters(filters: SupplierFilters): Promise<void> {
    if (filters.phone !== undefined) await this.phoneFilter.fill(filters.phone);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
    if (filters.supplierNameEn !== undefined) {
      await this.supplierNameEnFilter.fill(filters.supplierNameEn);
    }
    if (filters.email !== undefined) await this.emailFilter.fill(filters.email);
    if (filters.status) await selectOption(this.page, this.statusFilter, filters.status);
    if (filters.commission) {
      await selectOption(this.page, this.commissionFilter, filters.commission);
    }
    if (filters.requestMojaz) {
      await selectOption(this.page, this.requestMojazFilter, filters.requestMojaz);
    }
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  override async search(filters: SupplierFilters = {}): Promise<void> {
    await this.fillFilters(filters);
    await super.search();
  }

  /** Runs the search by pressing Enter in a text filter. */
  async submitSearchWithEnter(filter: Locator): Promise<void> {
    await this.waitForPageLoadAfter(() => filter.press('Enter'));
  }

  /** Text shown by a filter dropdown, e.g. "Choose Status" or "Yes". */
  selectedFilterOption(filter: Locator): Locator {
    return selectedOption(filter);
  }

  /** Values of one column for every row on the current page. */
  async columnValues(column: SupplierColumn): Promise<string[]> {
    const index = supplierColumns.indexOf(column) + 1;
    return (await this.rows.locator(`td:nth-child(${index})`).allInnerTexts()).map((text) =>
      text.trim().replace(/\s+/g, ' '),
    );
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<SupplierRow[]> {
    const columns = await Promise.all(supplierColumns.map((column) => this.columnValues(column)));
    return columns[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          supplierColumns.map((column, columnIndex) => [column, columns[columnIndex][rowIndex]]),
        ) as SupplierRow,
    );
  }

  viewLink(id: string): Locator {
    return this.row(id).locator(`a[href="/backend/users/supplier/view?id=${id}"]`);
  }

  updateLink(id: string): Locator {
    return this.row(id).locator(`a[href="/backend/users/supplier/update?id=${id}"]`);
  }

  /** A Delete action in a supplier's row (none is shown today: see PRM-03). */
  deleteLink(id: string): Locator {
    return this.row(id).locator('a[title="Delete"], a[href*="/users/supplier/delete"]');
  }

  sortLink(column: SortableColumn): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${sortableColumns[column]}"]`);
  }

  /** Clicks a column's sort link and waits for the sorted page. */
  async sortBy(column: SortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(column));
  }

  async openExportMenu(): Promise<void> {
    await this.exportMenuToggle.click();
  }

  exportFormat(format: string): Locator {
    return this.openDropdown.locator('a', { hasText: format });
  }

  /**
   * Exports the list in a format ("CSV", "Excel 95 +", "Excel 2007+"), confirming the
   * in-page prompt, and returns the downloaded file. The file may come from a new tab.
   */
  async exportAs(format: string): Promise<Download> {
    await this.openExportMenu();
    await this.exportFormat(format).click();
    const download = new Promise<Download>((resolve) => {
      this.page.once('download', resolve);
      this.page.context().once('page', (tab) => tab.once('download', resolve));
    });
    await this.exportConfirmButton.click();
    return download;
  }

  async openExportColumns(): Promise<void> {
    await this.exportColumnsToggle.click();
  }

  /** Closes the export column picker. */
  async closeExportColumns(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /** Checkbox for a column in the export column picker. */
  exportColumnCheckbox(column: string): Locator {
    return this.page
      .locator('#w1-cols-list li')
      .filter({
        has: this.page.locator('label', { hasText: new RegExp(`^${escapeRegExp(column)}$`) }),
      })
      .locator('input[type="checkbox"]');
  }

  /** Ticks or unticks a column in the export picker by clicking its label, as a user does. */
  async toggleExportColumn(column: string): Promise<void> {
    await this.exportColumnLabels
      .filter({ hasText: new RegExp(`^${escapeRegExp(column)}$`) })
      .click();
  }
}
