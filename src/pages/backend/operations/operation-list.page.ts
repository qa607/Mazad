import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import { selectOption, selectedOption } from '@utils/widgets';
import {
  type OperationColumn,
  type OperationSortableColumn,
  operationColumns,
  operationSortableColumns,
} from '@test-data/operation.data';

export interface OperationFilters {
  /** "Arabic Name" filter. */
  name?: string;
  /** "English Name" filter. */
  nameEn?: string;
  phone?: string;
  email?: string;
  /** "active", "inactive", or any other value to test how the list handles it. */
  status?: string;
}

/** One grid row as text, keyed by column header. */
export type OperationRow = Record<OperationColumn, string>;

const filterParams: Record<keyof OperationFilters, string> = {
  name: 'name',
  nameEn: 'name_en',
  phone: 'phone',
  email: 'email',
  status: 'status',
};

/** Mazad back-office Operations list (/backend/users/operation/index). */
export class OperationListPage extends BackendListPage {
  static readonly path = '/backend/users/operation/index';

  /** Flash message after a save or delete. Unlike other pages it has no role="alert". */
  readonly flashMessage: Locator;
  readonly createButton: Locator;
  readonly filterLabels: Locator;
  readonly nameFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly phoneFilter: Locator;
  readonly emailFilter: Locator;
  readonly statusFilter: Locator;
  readonly statusOptions: Locator;
  /** Every row's Delete link; the page has none. */
  readonly deleteLinks: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportFormatLinks: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;
  /** In-page "Confirmation" dialog, shown before an export. */
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, OperationListPage.path, 'default-id');
    this.flashMessage = page.locator('.alert-success');
    this.createButton = page.locator('a[href="/backend/users/operation/create"]');
    this.filterLabels = this.searchForm.locator('label');
    this.nameFilter = page.locator('#operationsearch-name');
    this.nameEnFilter = page.locator('#operationsearch-name_en');
    this.phoneFilter = page.locator('#operationsearch-phone');
    this.emailFilter = page.locator('#operationsearch-email');
    this.statusFilter = page.locator('.field-operationsearch-status');
    this.statusOptions = page.locator('#operationsearch-status option');
    this.deleteLinks = this.rows.locator('a[href*="/users/operation/delete"]');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportFormatLinks = page.locator('.dropdown-menu.show a');
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('[id$="-cols-list"] label');
    this.confirmDialog = new ConfirmDialog(page);
  }

  /**
   * Opens the list, optionally filtered and with other query parameters (sort, page, per-page).
   * Returns the HTTP status of the page.
   */
  async open(filters: OperationFilters = {}, query: Record<string, string> = {}): Promise<number> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof OperationFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`OperationSearch[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    const response = await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
    return response?.status() ?? 0;
  }

  /** Opens one page of the list with a given page size. */
  async openPage(
    pageNumber: number | string,
    pageSize: number,
    query: Record<string, string> = {},
  ): Promise<number> {
    return this.open({}, { ...query, 'per-page': String(pageSize), page: String(pageNumber) });
  }

  /** Opens this list from the sidebar link. */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  async fillFilters(filters: OperationFilters): Promise<void> {
    if (filters.name !== undefined) await this.nameFilter.fill(filters.name);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
    if (filters.phone !== undefined) await this.phoneFilter.fill(filters.phone);
    if (filters.email !== undefined) await this.emailFilter.fill(filters.email);
    if (filters.status) await selectOption(this.page, this.statusFilter, filters.status);
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  async searchBy(filters: OperationFilters): Promise<void> {
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
  async columnValues(column: OperationColumn): Promise<string[]> {
    const texts = await this.columnCells(operationColumns.indexOf(column)).allInnerTexts();
    return texts.map((text) => text.trim().replace(/\s+/g, ' '));
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<OperationRow[]> {
    const columns = await Promise.all(operationColumns.map((column) => this.columnValues(column)));
    return columns[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          operationColumns.map((column, columnIndex) => [column, columns[columnIndex][rowIndex]]),
        ) as OperationRow,
    );
  }

  /** Titles of a row's action links. */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('title') ?? ''));
  }

  actionLink(id: string, action: 'view' | 'update'): Locator {
    return this.row(id).locator(`a[href="/backend/users/operation/${action}?id=${id}"]`);
  }

  /**
   * Deletes an operation through the server's delete route, the way a Delete link would (POST
   * with the page's CSRF token), since the page itself offers no Delete. Call it on a loaded
   * Backend page. Returns the HTTP status (302 back to the list when deleted).
   */
  async deleteById(id: string): Promise<number> {
    return this.postAction(`/backend/users/operation/delete?id=${id}`);
  }

  sortLink(column: OperationSortableColumn): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${operationSortableColumns[column]}"]`);
  }

  async sortBy(column: OperationSortableColumn): Promise<void> {
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

  /** HTTP status of an operation page (view or update) opened directly by URL. */
  async operationPageStatus(action: 'view' | 'update', id: string): Promise<number> {
    const response = await this.page.request.get(`/backend/users/operation/${action}?id=${id}`);
    return response.status();
  }

  /** Starts collecting uncaught script errors of this tab; returns a function giving them. */
  trackScriptErrors(): () => string[] {
    const errors: string[] = [];
    this.page.on('pageerror', (error) => errors.push(error.message));
    return () => errors;
  }
}
