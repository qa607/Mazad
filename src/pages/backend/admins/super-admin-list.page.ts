import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import { selectOption, selectedOption } from '@utils/widgets';
import {
  type AdminColumn,
  type AdminSortableColumn,
  adminColumns,
  adminSortableColumns,
} from '@test-data/super-admin.data';

export interface AdminFilters {
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
export type AdminRow = Record<AdminColumn, string>;

const filterParams: Record<keyof AdminFilters, string> = {
  phone: 'phone',
  name: 'name',
  nameEn: 'name_en',
  email: 'email',
  status: 'status',
};

/** Mazad back-office Super Admins list (/backend/users/admin/index). */
export class SuperAdminListPage extends BackendListPage {
  static readonly path = '/backend/users/admin/index';

  /** Flash message after a save or delete. Unlike other pages it has no role="alert". */
  readonly flashMessage: Locator;
  readonly createButton: Locator;
  readonly filterLabels: Locator;
  readonly phoneFilter: Locator;
  readonly nameFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly emailFilter: Locator;
  readonly statusFilter: Locator;
  readonly statusOptions: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportFormatLinks: Locator;
  readonly exportColumnsToggle: Locator;
  /** In-page "Confirmation" dialog, shown before an export and before a delete. */
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, SuperAdminListPage.path, 'default-id');
    this.flashMessage = page.locator('.alert-success');
    this.createButton = page.locator('a[href="/backend/users/admin/create"]');
    this.filterLabels = this.searchForm.locator('label');
    this.phoneFilter = page.locator('#adminsearch-phone');
    this.nameFilter = page.locator('#adminsearch-name');
    this.nameEnFilter = page.locator('#adminsearch-name_en');
    this.emailFilter = page.locator('#adminsearch-email');
    this.statusFilter = page.locator('.field-adminsearch-status');
    this.statusOptions = page.locator('#adminsearch-status option');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportFormatLinks = page.locator('.dropdown-menu.show a');
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.confirmDialog = new ConfirmDialog(page);
  }

  /**
   * Opens the list, optionally filtered and with other query parameters (sort, page, per-page).
   * Returns the HTTP status of the page.
   */
  async open(filters: AdminFilters = {}, query: Record<string, string> = {}): Promise<number> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof AdminFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`AdminSearch[${filterParams[key]}]`, value);
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

  /**
   * Opens this list from the sidebar. The link is found by URL: its text is "Super Admins" while
   * the page itself is titled "Admins".
   */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  async fillFilters(filters: AdminFilters): Promise<void> {
    if (filters.phone !== undefined) await this.phoneFilter.fill(filters.phone);
    if (filters.name !== undefined) await this.nameFilter.fill(filters.name);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
    if (filters.email !== undefined) await this.emailFilter.fill(filters.email);
    if (filters.status) await selectOption(this.page, this.statusFilter, filters.status);
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  async searchBy(filters: AdminFilters): Promise<void> {
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
  async columnValues(column: AdminColumn): Promise<string[]> {
    const texts = await this.columnCells(adminColumns.indexOf(column)).allInnerTexts();
    return texts.map((text) => text.trim().replace(/\s+/g, ' '));
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<AdminRow[]> {
    const columns = await Promise.all(adminColumns.map((column) => this.columnValues(column)));
    return columns[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          adminColumns.map((column, columnIndex) => [column, columns[columnIndex][rowIndex]]),
        ) as AdminRow,
    );
  }

  /** Titles of a row's action links. */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('title') ?? ''));
  }

  actionLink(id: string, action: 'view' | 'update' | 'delete'): Locator {
    return this.row(id).locator(`a[href="/backend/users/admin/${action}?id=${id}"]`);
  }

  /** Clicks a row's Delete icon, which opens the in-page confirmation. */
  async clickDelete(id: string): Promise<void> {
    await this.actionLink(id, 'delete').click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Deletes an admin through its row's Delete action and its confirmation. */
  async deleteAdmin(id: string): Promise<void> {
    await this.clickDelete(id);
    await this.confirmDialog.confirmAndWaitForPageLoad();
  }

  sortLink(column: AdminSortableColumn): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${adminSortableColumns[column]}"]`);
  }

  async sortBy(column: AdminSortableColumn): Promise<void> {
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

  /** HTTP status of an admin page (view or update) opened directly by URL. */
  async adminPageStatus(action: 'view' | 'update', id: string): Promise<number> {
    const response = await this.page.request.get(`/backend/users/admin/${action}?id=${id}`);
    return response.status();
  }
}
