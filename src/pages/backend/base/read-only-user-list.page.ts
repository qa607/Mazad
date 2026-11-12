import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import { selectOption, selectedOption } from '@utils/widgets';

export interface UserListFilters {
  phone?: string;
  /** "Arabic Name" filter. */
  name?: string;
  /** "English Name" filter. */
  nameEn?: string;
  email?: string;
  /** "active", "inactive", or any other value to test how the list handles it. */
  status?: string;
}

const filterParams: Record<keyof UserListFilters, string> = {
  phone: 'phone',
  name: 'name',
  nameEn: 'name_en',
  email: 'email',
  status: 'status',
};

/**
 * A read-only Backend Users list (/backend/users/<route>/index) such as QC or Inspectors: a
 * search form (phone, names, email, status), a grid whose rows have View only, sorting, and
 * Export All. The subclass gives the route, the search model and the grid columns.
 */
export abstract class ReadOnlyUserListPage<Column extends string> extends BackendListPage {
  /** Any Create link; these pages have none. */
  readonly createButton: Locator;
  readonly filterLabels: Locator;
  readonly phoneFilter: Locator;
  readonly nameFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly emailFilter: Locator;
  readonly statusFilter: Locator;
  readonly statusOptions: Locator;
  /** Every row's Update or Delete link; these pages have none. */
  readonly editLinks: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportFormatLinks: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;
  /** In-page "Confirmation" dialog, shown before an export. */
  readonly confirmDialog: ConfirmDialog;

  protected constructor(
    page: Page,
    /** Route segment after /backend/users/, e.g. "qc". */
    protected readonly route: string,
    /** Name of the search model in the query string, e.g. "QcSearch". */
    private readonly searchModel: string,
    /** Grid columns in display order (the Actions column left out). */
    private readonly columns: readonly Column[],
  ) {
    super(page, `/backend/users/${route}/index`, 'default-id');
    const idPrefix = searchModel.toLowerCase();
    this.createButton = page.locator(`a[href*="/users/${route}/create"]`);
    this.filterLabels = this.searchForm.locator('label');
    this.phoneFilter = page.locator(`#${idPrefix}-phone`);
    this.nameFilter = page.locator(`#${idPrefix}-name`);
    this.nameEnFilter = page.locator(`#${idPrefix}-name_en`);
    this.emailFilter = page.locator(`#${idPrefix}-email`);
    this.statusFilter = page.locator(`.field-${idPrefix}-status`);
    this.statusOptions = page.locator(`#${idPrefix}-status option`);
    this.editLinks = this.rows.locator(
      `a[href*="/users/${route}/update"], a[href*="/users/${route}/delete"]`,
    );

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
  async open(filters: UserListFilters = {}, query: Record<string, string> = {}): Promise<number> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof UserListFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`${this.searchModel}[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    const response = await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
    return response?.status() ?? 0;
  }

  /** Opens this list from the sidebar link. */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  async fillFilters(filters: UserListFilters): Promise<void> {
    if (filters.phone !== undefined) await this.phoneFilter.fill(filters.phone);
    if (filters.name !== undefined) await this.nameFilter.fill(filters.name);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
    if (filters.email !== undefined) await this.emailFilter.fill(filters.email);
    if (filters.status) await selectOption(this.page, this.statusFilter, filters.status);
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  async searchBy(filters: UserListFilters): Promise<void> {
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
  async columnValues(column: Column): Promise<string[]> {
    const texts = await this.columnCells(this.columns.indexOf(column)).allInnerTexts();
    return texts.map((text) => text.trim().replace(/\s+/g, ' '));
  }

  /**
   * Values of one column as stored, for every row: spaces kept as they are (the browser shows a
   * double space as one, so the displayed text may differ).
   */
  async rawColumnValues(column: Column): Promise<string[]> {
    const texts = await this.columnCells(this.columns.indexOf(column)).allTextContents();
    return texts.map((text) => text.trim());
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<Record<Column, string>[]> {
    const values = await Promise.all(this.columns.map((column) => this.columnValues(column)));
    return values[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          this.columns.map((column, columnIndex) => [column, values[columnIndex][rowIndex]]),
        ) as Record<Column, string>,
    );
  }

  /** Titles of a row's action links. */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('title') ?? ''));
  }

  viewLink(id: string): Locator {
    return this.row(id).locator(`a[href="/backend/users/${this.route}/view?id=${id}"]`);
  }

  /** Opens a row's View page (in a new tab when the link targets one) and returns that tab. */
  async openView(id: string): Promise<Page> {
    const link = this.viewLink(id);
    if ((await link.getAttribute('target')) === '_blank') return this.openInNewTab(link);
    await this.clickAndWaitForPageLoad(link);
    return this.page;
  }

  /** The header link that sorts by a sort key (e.g. "id", "phone", "created_at"). */
  protected sortLinkFor(sortKey: string): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${sortKey}"]`);
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

  /**
   * HTTP status of a page of this route opened by URL (GET only), e.g. "create" or
   * "update?id=1", to check which pages exist.
   */
  async routeStatus(pathAndQuery: string): Promise<number> {
    const response = await this.page.request.get(`/backend/users/${this.route}/${pathAndQuery}`);
    return response.status();
  }

  /** Starts collecting uncaught script errors of this tab; returns a function giving them. */
  trackScriptErrors(): () => string[] {
    const errors: string[] = [];
    this.page.on('pageerror', (error) => errors.push(error.message));
    return () => errors;
  }
}
