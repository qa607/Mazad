import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import {
  type DeletedUserColumn,
  type DeletedUserSortableColumn,
  deletedUserColumns,
  deletedUserSortableColumns,
} from '@test-data/deleted-user.data';

export interface DeletedUserFilters {
  phone?: string;
  /** "Arabic Name" filter. */
  name?: string;
  /** "English Name" filter. */
  nameEn?: string;
  email?: string;
  /** "Ref Number (TXN_ID)" filter. */
  refNum?: string;
  /** "User Type": individual_customer or company_customer. */
  userType?: string;
}

/** One grid row as text, keyed by column header. */
export type DeletedUserRow = Record<DeletedUserColumn, string>;

const filterParams: Record<keyof DeletedUserFilters, string> = {
  phone: 'phone',
  name: 'name',
  nameEn: 'name_en',
  email: 'email',
  refNum: 'ref_num',
  userType: 'user_type_filter',
};

/** Mazad back-office Deleted Users list (/backend/users/deleted-user/index). Read-only grid. */
export class DeletedUserListPage extends BackendListPage {
  static readonly path = '/backend/users/deleted-user/index';

  readonly filterLabels: Locator;
  readonly phoneFilter: Locator;
  readonly nameFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly emailFilter: Locator;
  readonly userTypeField: Locator;
  readonly userTypeOptions: Locator;
  /** Any link inside the grid rows; the grid has no row actions. */
  readonly rowLinks: Locator;
  readonly exportMenuToggle: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;

  constructor(page: Page) {
    super(page, DeletedUserListPage.path, 'default-id');
    this.filterLabels = this.searchForm.locator('label');
    this.phoneFilter = page.locator('#deletedusersearch-phone');
    this.nameFilter = page.locator('#deletedusersearch-name');
    this.nameEnFilter = page.locator('#deletedusersearch-name_en');
    this.emailFilter = page.locator('#deletedusersearch-email');
    this.userTypeField = page.locator('.field-deletedusersearch-user_type_filter');
    this.userTypeOptions = page.locator('#deletedusersearch-user_type_filter option');
    this.rowLinks = this.rows.locator('a');
    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('[id$="-cols-list"] label');
  }

  /**
   * Opens the list, optionally filtered and with other query parameters (sort, page).
   * Returns the HTTP status of the page.
   */
  async open(
    filters: DeletedUserFilters = {},
    query: Record<string, string> = {},
  ): Promise<number> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof DeletedUserFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`DeletedUserSearch[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    const response = await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
    return response?.status() ?? 0;
  }

  /** Opens this list from the sidebar link. */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  /** Picks a User Type in the dropdown by its label ("Individual" or "Dealer"). */
  async chooseUserType(label: string): Promise<void> {
    await this.selectFilterOption('field-deletedusersearch-user_type_filter', label);
  }

  /** Text shown by the User Type dropdown. */
  selectedUserType(): Locator {
    return this.filterValue('deletedusersearch-user_type_filter');
  }

  /** Runs the search by pressing Enter in a text filter. */
  async searchWithEnter(filter: Locator): Promise<void> {
    await this.waitForPageLoadAfter(() => filter.press('Enter'));
  }

  /** Values of one column for every row on the current page. */
  async columnValues(column: DeletedUserColumn): Promise<string[]> {
    const texts = await this.columnCells(deletedUserColumns.indexOf(column)).allInnerTexts();
    return texts.map((text) => text.trim().replace(/\s+/g, ' '));
  }

  /** Every row on the current page, keyed by column header. */
  async readRows(): Promise<DeletedUserRow[]> {
    const columns = await Promise.all(
      deletedUserColumns.map((column) => this.columnValues(column)),
    );
    return columns[0].map(
      (_, rowIndex) =>
        Object.fromEntries(
          deletedUserColumns.map((column, columnIndex) => [column, columns[columnIndex][rowIndex]]),
        ) as DeletedUserRow,
    );
  }

  sortLink(column: DeletedUserSortableColumn): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${deletedUserSortableColumns[column]}"]`);
  }

  async sortBy(column: DeletedUserSortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(column));
  }

  /** Header texts in display order, with line breaks collapsed. */
  async headerTexts(): Promise<string[]> {
    return (await this.columnHeaders.allInnerTexts()).map((text) =>
      text.replace(/\s+/g, ' ').trim(),
    );
  }
}
