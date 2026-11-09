import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import type { CustomerGroupSortableColumn } from '@test-data/customer-group.data';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  id: 1,
  name: 2,
  memberCount: 3,
} as const;

/** Mazad back-office Customer Group list (/backend/customerGroup/customer-group/index). */
export class CustomerGroupListPage extends BackendListPage {
  static readonly path = '/backend/customerGroup/customer-group/index';

  readonly createButton: Locator;
  readonly nameSearchInput: Locator;

  // Grid
  readonly idCells: Locator;
  readonly nameCells: Locator;
  readonly memberCountCells: Locator;

  /** "Are you sure to delete this item?" confirmation. */
  readonly deleteDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, CustomerGroupListPage.path, 'default-id');
    this.createButton = page.getByRole('link', { name: 'Create Customer Group' });
    this.nameSearchInput = this.searchForm.getByLabel('Name', { exact: true });

    this.idCells = this.columnCells(column.id);
    this.nameCells = this.columnCells(column.name);
    this.memberCountCells = this.columnCells(column.memberCount);

    this.deleteDialog = new ConfirmDialog(page);
  }

  /** Opens the list, optionally with query parameters (e.g. { sort: 'id', 'per-page': '1' }). */
  override async goto(query: Record<string, string> = {}): Promise<void> {
    const params = new URLSearchParams(query).toString();
    await this.page.goto(
      params ? `${CustomerGroupListPage.path}?${params}` : CustomerGroupListPage.path,
    );
  }

  /** Opens one page of the list with a given page size, to page through a short list. */
  async gotoWithPageSize(pageSize: number, pageNumber = 1): Promise<void> {
    await this.goto({ 'per-page': String(pageSize), page: String(pageNumber) });
  }

  /** Rows whose name is exactly this text. */
  rowsNamed(name: string): Locator {
    return this.rows.filter({
      has: this.page.locator(`td[data-col-seq="${column.name}"]`, { hasText: exactText(name) }),
    });
  }

  nameCell(row: Locator): Locator {
    return this.rowCell(row, column.name);
  }

  memberCountCell(row: Locator): Locator {
    return this.rowCell(row, column.memberCount);
  }

  viewLink(id: string): Locator {
    return this.row(id).getByRole('link', { name: 'View', exact: true });
  }

  updateLink(id: string): Locator {
    return this.row(id).getByRole('link', { name: 'Update', exact: true });
  }

  deleteLink(id: string): Locator {
    return this.row(id).getByRole('link', { name: 'Delete', exact: true });
  }

  /** The sort link in a column header (none for columns that cannot be sorted). */
  sortLink(column: string): Locator {
    return this.columnHeaders.getByRole('link', { name: column, exact: true });
  }

  /** Clicks a column's sort link and waits for the sorted page. */
  async sortBy(column: CustomerGroupSortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(column));
  }

  async searchByName(name: string): Promise<void> {
    await this.nameSearchInput.fill(name);
    await this.search();
  }

  /** Clicks a row's Delete action, which opens the confirmation dialog. */
  async openDeleteConfirmation(id: string): Promise<void> {
    await this.deleteLink(id).click();
  }

  /** Deletes a group from its row action and confirms. The list reloads afterwards. */
  async deleteGroup(id: string): Promise<void> {
    await this.openDeleteConfirmation(id);
    await this.deleteDialog.confirmAndWaitForPageLoad();
  }

  /** IDs of the groups named exactly this, found with the name search. */
  async idsOfGroupsNamed(name: string): Promise<string[]> {
    await this.goto();
    await this.searchByName(name);
    return this.rowsNamed(name).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-key') ?? ''),
    );
  }

  /** Deletes every group named exactly this (used for test clean-up). */
  async deleteGroupsNamed(name: string): Promise<void> {
    for (const id of await this.idsOfGroupsNamed(name)) {
      await this.goto();
      await this.searchByName(name);
      await this.deleteGroup(id);
    }
  }
}
