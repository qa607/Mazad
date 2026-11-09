import type { Download, Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';
import { selectOption, selectedOption } from '@utils/widgets';
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
export class SupplierListPage extends BackendPage {
  static readonly path = '/backend/users/supplier/index';

  readonly pageHeading: Locator;
  readonly createButton: Locator;
  readonly searchButton: Locator;
  readonly resetButton: Locator;

  readonly phoneFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly supplierNameEnFilter: Locator;
  readonly emailFilter: Locator;
  readonly statusFilter: Locator;
  readonly commissionFilter: Locator;
  readonly requestMojazFilter: Locator;

  readonly grid: Locator;
  readonly headerCells: Locator;
  readonly rows: Locator;
  readonly emptyState: Locator;
  /** "Showing 1-20 of 63 items." Absent when there are no results. */
  readonly summary: Locator;
  readonly pagination: Locator;
  readonly previousPage: Locator;
  readonly nextPage: Locator;
  readonly activePage: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportColumnsToggle: Locator;
  readonly openDropdown: Locator;
  /** In-page "Ok to proceed?" dialog shown before an export is generated. */
  readonly exportConfirmation: Locator;
  readonly exportConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    const filters = page.locator('#w0');
    this.createButton = page.locator('a[href="/backend/users/supplier/create"]');
    this.searchButton = filters.locator('button[type="submit"]');
    this.resetButton = filters.locator('a', { hasText: 'Reset' });
    this.phoneFilter = page.locator('#suppliersearch-phone');
    this.nameEnFilter = page.locator('#suppliersearch-name_en');
    this.supplierNameEnFilter = page.locator('#suppliersearch-supplier_name_en');
    this.emailFilter = page.locator('#suppliersearch-email');
    this.statusFilter = page.locator('.field-suppliersearch-status');
    this.commissionFilter = page.locator('.field-suppliersearch-commission');
    this.requestMojazFilter = page.locator('.field-suppliersearch-enable_mojaz_request');

    this.grid = page.locator('#default-id table');
    this.headerCells = this.grid.locator('thead tr').first().locator('th');
    this.rows = this.grid.locator('tbody tr[data-key]');
    this.emptyState = this.grid.locator('tbody .empty');
    this.summary = page.locator('#default-id .summary');
    this.pagination = page.locator('#default-id .pagination');
    this.previousPage = this.pagination.locator('li.prev');
    this.nextPage = this.pagination.locator('li.next');
    this.activePage = this.pagination.locator('li.active');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.openDropdown = page.locator('.dropdown-menu.show');
    this.exportConfirmation = page.locator('.modal.show', { hasText: 'Ok to proceed?' });
    this.exportConfirmButton = this.exportConfirmation.getByRole('button', { name: 'Ok' });
  }

  /** Opens the list, optionally with query parameters (e.g. { sort: '-id', page: '2' }). */
  async goto(query: Record<string, string> = {}): Promise<void> {
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
  async search(filters: SupplierFilters): Promise<void> {
    await this.fillFilters(filters);
    await this.submitSearch();
  }

  async submitSearch(): Promise<void> {
    await this.loadsNewPage(() => this.searchButton.click());
  }

  /** Runs the search by pressing Enter in a text filter. */
  async submitSearchWithEnter(filter: Locator): Promise<void> {
    await this.loadsNewPage(() => filter.press('Enter'));
  }

  async reset(): Promise<void> {
    await this.loadsNewPage(() => this.resetButton.click());
  }

  /**
   * Runs an action that loads a new page and waits for that page to finish loading. Waiting on
   * the URL alone is not enough: after a search the URL often already matches.
   */
  private async loadsNewPage(action: () => Promise<void>): Promise<void> {
    const loaded = this.page.waitForEvent('load');
    await action();
    await loaded;
  }

  /** Text shown by a filter dropdown, e.g. "Choose Status" or "Yes". */
  selectedFilterOption(filter: Locator): Locator {
    return selectedOption(filter);
  }

  /** Header texts in display order. */
  async columnHeaders(): Promise<string[]> {
    return (await this.headerCells.allInnerTexts()).map((text) => text.trim());
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

  rowById(id: string): Locator {
    return this.rows.and(this.page.locator(`[data-key="${id}"]`));
  }

  viewLink(id: string): Locator {
    return this.rowById(id).locator(`a[href="/backend/users/supplier/view?id=${id}"]`);
  }

  updateLink(id: string): Locator {
    return this.rowById(id).locator(`a[href="/backend/users/supplier/update?id=${id}"]`);
  }

  sortLink(column: SortableColumn): Locator {
    return this.headerCells.locator(`a[data-sort$="${sortableColumns[column]}"]`);
  }

  /** Clicks a column's sort link and waits for the sorted page. */
  async sortBy(column: SortableColumn): Promise<void> {
    await this.loadsNewPage(() => this.sortLink(column).click());
  }

  pageLink(pageNumber: number): Locator {
    return this.pagination.locator('a.page-link', { hasText: new RegExp(`^${pageNumber}$`) });
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.loadsNewPage(() => this.pageLink(pageNumber).click());
  }

  async goToNextPage(): Promise<void> {
    await this.loadsNewPage(() => this.nextPage.locator('a').click());
  }

  async goToPreviousPage(): Promise<void> {
    await this.loadsNewPage(() => this.previousPage.locator('a').click());
  }

  /** Row actions open in a new browser tab. Clicks the link and returns the loaded tab. */
  async openInNewTab(link: Locator): Promise<Page> {
    const [tab] = await Promise.all([this.page.context().waitForEvent('page'), link.click()]);
    await tab.waitForLoadState();
    return tab;
  }

  /** Parses the summary: { from, to, total }. */
  async summaryCounts(): Promise<{ from: number; to: number; total: number }> {
    const text = await this.summary.innerText();
    const match = /Showing\s+([\d,]+)-([\d,]+)\s+of\s+([\d,]+)/.exec(text);
    if (!match) throw new Error(`Unexpected summary text: "${text}"`);
    const [from, to, total] = match.slice(1).map((n) => Number(n.replace(/,/g, '')));
    return { from, to, total };
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
    await this.page
      .locator('#w1-cols-list label')
      .filter({ hasText: new RegExp(`^${escapeRegExp(column)}$`) })
      .click();
  }

  exportColumnLabels(): Locator {
    return this.page.locator('#w1-cols-list label');
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
