import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import { selectOption, selectedOption } from '@utils/widgets';
import {
  type MemberColumn,
  type MemberSortableColumn,
  type MemberStatus,
  memberColumns,
  memberSortableColumns,
} from '@test-data/backend-supplier-member.data';

export interface MemberFilters {
  phone?: string;
  /** "Arabic Name" filter. */
  name?: string;
  /** "English Name" filter. */
  nameEn?: string;
  email?: string;
  status?: MemberStatus;
}

/** One grid row as text, keyed by column header. */
export type MemberRow = Record<MemberColumn, string>;

const filterParams: Record<keyof MemberFilters, string> = {
  phone: 'phone',
  name: 'name',
  nameEn: 'name_en',
  email: 'email',
  status: 'status',
};

/** Mazad back-office Supplier Members list (/backend/users/supplier-member/index). */
export class SupplierMemberListPage extends BackendListPage {
  static readonly path = '/backend/users/supplier-member/index';

  readonly createButton: Locator;
  /** Header links that sort the grid. */
  readonly sortableHeaderLinks: Locator;
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
  readonly exportColumnLabels: Locator;
  readonly exportColumnCheckboxes: Locator;
  /** In-page "Confirmation" dialog, shown before an export and before a delete. */
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, SupplierMemberListPage.path, 'default-id');
    this.createButton = page.locator('a[href="/backend/users/supplier-member/create"]');
    this.sortableHeaderLinks = this.columnHeaders.locator('a[data-sort]');
    this.filterLabels = this.searchForm.locator('label');
    this.phoneFilter = page.locator('#suppliermembersearch-phone');
    this.nameFilter = page.locator('#suppliermembersearch-name');
    this.nameEnFilter = page.locator('#suppliermembersearch-name_en');
    this.emailFilter = page.locator('#suppliermembersearch-email');
    this.statusFilter = page.locator('.field-suppliermembersearch-status');
    this.statusOptions = page.locator('#suppliermembersearch-status option');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportFormatLinks = page.locator('.dropdown-menu.show a');
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('#w1-cols-list label');
    this.exportColumnCheckboxes = page.locator(
      '#w1-cols-list input[name="export_columns_selector[]"]',
    );
    this.confirmDialog = new ConfirmDialog(page);
  }

  /** Opens the list, optionally filtered and with other query parameters (sort, page, per-page). */
  async open(filters: MemberFilters = {}, query: Record<string, string> = {}): Promise<void> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof MemberFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`SupplierMemberSearch[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
  }

  /** Opens one page of the list with a given page size. */
  async openPage(
    pageNumber: number | string,
    pageSize: number,
    query: Record<string, string> = {},
  ) {
    await this.open({}, { ...query, 'per-page': String(pageSize), page: String(pageNumber) });
  }

  async fillFilters(filters: MemberFilters): Promise<void> {
    if (filters.phone !== undefined) await this.phoneFilter.fill(filters.phone);
    if (filters.name !== undefined) await this.nameFilter.fill(filters.name);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
    if (filters.email !== undefined) await this.emailFilter.fill(filters.email);
    if (filters.status) await selectOption(this.page, this.statusFilter, filters.status);
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  async searchBy(filters: MemberFilters): Promise<void> {
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
  async columnValues(column: MemberColumn): Promise<string[]> {
    const texts = await this.columnCells(memberColumns.indexOf(column)).allInnerTexts();
    return texts.map((text) => text.trim().replace(/\s+/g, ' '));
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<MemberRow[]> {
    const columns = await Promise.all(memberColumns.map((column) => this.columnValues(column)));
    return columns[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          memberColumns.map((column, columnIndex) => [column, columns[columnIndex][rowIndex]]),
        ) as MemberRow,
    );
  }

  /** Titles of a row's action links; the permissions (key) link has no title. */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) =>
        links.map((link) =>
          link.getAttribute('href')?.includes('update-permission')
            ? 'Permission'
            : (link.getAttribute('title') ?? ''),
        ),
      );
  }

  actionLink(id: string, action: 'view' | 'update' | 'delete' | 'update-permission'): Locator {
    return this.row(id).locator(`a[href="/backend/users/supplier-member/${action}?id=${id}"]`);
  }

  /** Clicks a row's Delete icon, which opens the in-page confirmation. */
  async clickDelete(id: string): Promise<void> {
    await this.actionLink(id, 'delete').click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Deletes a member through its row's Delete action and its confirmation. */
  async deleteMember(id: string): Promise<void> {
    await this.clickDelete(id);
    await this.confirmDialog.confirmAndWaitForPageLoad();
  }

  sortLink(column: MemberSortableColumn): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${memberSortableColumns[column]}"]`);
  }

  async sortBy(column: MemberSortableColumn): Promise<void> {
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

  /** Waits briefly for a download; resolves false when none starts. */
  async downloadStarts(timeoutMs: number): Promise<boolean> {
    return this.page
      .waitForEvent('download', { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
  }

  /** Opens or closes the export column picker. */
  async toggleExportColumns(): Promise<void> {
    await this.exportColumnsToggle.click();
  }

  /** Ticks or unticks a column in the export picker by clicking its label. */
  async toggleExportColumn(column: string): Promise<void> {
    await this.exportColumnLabels.filter({ hasText: exactText(column) }).click();
  }
}
