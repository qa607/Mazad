import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import { selectOption, selectedOption } from '@utils/widgets';
import {
  type QcColumn,
  type QcSortableColumn,
  qcColumns,
  qcSortableColumns,
} from '@test-data/qc.data';

export interface QcFilters {
  phone?: string;
  /** "Arabic Name" filter. */
  name?: string;
  /** "English Name" filter. */
  nameEn?: string;
  email?: string;
  /** "active", "inactive", or any other value to test how the list handles it. */
  status?: string;
}

/** One grid row as text, keyed by column header. */
export type QcRow = Record<QcColumn, string>;

const filterParams: Record<keyof QcFilters, string> = {
  phone: 'phone',
  name: 'name',
  nameEn: 'name_en',
  email: 'email',
  status: 'status',
};

/** Mazad back-office QC list (/backend/users/qc/index). Read-only: rows have View only. */
export class QcListPage extends BackendListPage {
  static readonly path = '/backend/users/qc/index';

  /** Any Create link; the page has none. */
  readonly createButton: Locator;
  readonly filterLabels: Locator;
  readonly phoneFilter: Locator;
  readonly nameFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly emailFilter: Locator;
  readonly statusFilter: Locator;
  readonly statusOptions: Locator;
  /** Every row's Update or Delete link; the page has none. */
  readonly editLinks: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportFormatLinks: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;
  /** In-page "Confirmation" dialog, shown before an export. */
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, QcListPage.path, 'default-id');
    this.createButton = page.locator('a[href*="/users/qc/create"]');
    this.filterLabels = this.searchForm.locator('label');
    this.phoneFilter = page.locator('#qcsearch-phone');
    this.nameFilter = page.locator('#qcsearch-name');
    this.nameEnFilter = page.locator('#qcsearch-name_en');
    this.emailFilter = page.locator('#qcsearch-email');
    this.statusFilter = page.locator('.field-qcsearch-status');
    this.statusOptions = page.locator('#qcsearch-status option');
    this.editLinks = this.rows.locator('a[href*="/users/qc/update"], a[href*="/users/qc/delete"]');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportFormatLinks = page.locator('.dropdown-menu.show a');
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('[id$="-cols-list"] label');
    this.confirmDialog = new ConfirmDialog(page);
  }

  /**
   * Opens the list, optionally filtered and with other query parameters (sort, page).
   * Returns the HTTP status of the page.
   */
  async open(filters: QcFilters = {}, query: Record<string, string> = {}): Promise<number> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof QcFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`QcSearch[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    const response = await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
    return response?.status() ?? 0;
  }

  /** Opens this list from the sidebar link. */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  async fillFilters(filters: QcFilters): Promise<void> {
    if (filters.phone !== undefined) await this.phoneFilter.fill(filters.phone);
    if (filters.name !== undefined) await this.nameFilter.fill(filters.name);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
    if (filters.email !== undefined) await this.emailFilter.fill(filters.email);
    if (filters.status) await selectOption(this.page, this.statusFilter, filters.status);
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  async searchBy(filters: QcFilters): Promise<void> {
    await this.fillFilters(filters);
    await this.search();
  }

  /** Runs the search by pressing Enter in a text filter. */
  async searchWithEnter(filter: Locator): Promise<void> {
    await this.waitForPageLoadAfter(() => filter.press('Enter'));
  }

  /** Text shown by the Status dropdown, e.g. "Choose Status" or "active". */
  selectedStatus(): Locator {
    return selectedOption(this.statusFilter);
  }

  /** Values of one column for every row on the current page. */
  async columnValues(column: QcColumn): Promise<string[]> {
    const texts = await this.columnCells(qcColumns.indexOf(column)).allInnerTexts();
    return texts.map((text) => text.trim().replace(/\s+/g, ' '));
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<QcRow[]> {
    const columns = await Promise.all(qcColumns.map((column) => this.columnValues(column)));
    return columns[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          qcColumns.map((column, columnIndex) => [column, columns[columnIndex][rowIndex]]),
        ) as QcRow,
    );
  }

  /** Titles of a row's action links. */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('title') ?? ''));
  }

  viewLink(id: string): Locator {
    return this.row(id).locator(`a[href="/backend/users/qc/view?id=${id}"]`);
  }

  /** Opens a row's View page (in a new tab when the link targets one) and returns that tab. */
  async openView(id: string): Promise<Page> {
    const link = this.viewLink(id);
    if ((await link.getAttribute('target')) === '_blank') return this.openInNewTab(link);
    await this.clickAndWaitForPageLoad(link);
    return this.page;
  }

  sortLink(column: QcSortableColumn): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${qcSortableColumns[column]}"]`);
  }

  async sortBy(column: QcSortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(column));
  }

  /** Header texts in display order, with line breaks collapsed. */
  async headerTexts(): Promise<string[]> {
    return (await this.columnHeaders.allInnerTexts()).map((text) =>
      text.replace(/\s+/g, ' ').trim(),
    );
  }

  /** Opens Export All and picks a format, which opens the confirmation. */
  async startExport(format: string): Promise<void> {
    await this.exportMenuToggle.click();
    await this.exportFormatLinks.filter({ hasText: exactText(format) }).click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Exports the list in a format, confirming the prompt, and returns the downloaded file. */
  async exportAs(format: string): Promise<Download> {
    await this.startExport(format);
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.confirmDialog.okButton.click(),
    ]);
    return download;
  }

  /** HTTP status of a QC View page opened directly by URL. */
  async viewPageStatus(id: string): Promise<number> {
    const response = await this.page.request.get(`/backend/users/qc/view?id=${id}`);
    return response.status();
  }

  /** Starts collecting uncaught script errors of this tab; returns a function giving them. */
  trackScriptErrors(): () => string[] {
    const errors: string[] = [];
    this.page.on('pageerror', (error) => errors.push(error.message));
    return () => errors;
  }
}
