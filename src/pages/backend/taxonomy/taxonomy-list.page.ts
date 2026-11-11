import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import type { TaxonomySortableColumn } from '@test-data/taxonomy.data';

/** Grid columns, by their data-col-seq attribute (the same for every type). */
const column = {
  id: 1,
  title: 4,
  titleEn: 5,
  active: 7,
} as const;

/**
 * A taxonomy type's term list (/backend/taxonomy/taxonomy/index?type=<key>): search by Title,
 * Title En and Status, the terms grid with row actions, and Create Taxonomy.
 *
 * Without ?type= the same path shows the types page (TaxonomyTypesPage), so the list is always
 * opened with gotoType(); the inherited goto() and gotoPage() would not show a term list.
 */
export class TaxonomyListPage extends BackendListPage {
  static readonly path = '/backend/taxonomy/taxonomy/index';

  readonly createButton: Locator;
  readonly titleSearchInput: Locator;
  readonly titleEnSearchInput: Locator;
  /**
   * Selected Status filter (or its placeholder). Its text also holds select2's "×" clear
   * button, so the selection is read from its title attribute.
   */
  readonly statusFilterValue: Locator;

  // Grid
  readonly idCells: Locator;
  readonly titleCells: Locator;
  readonly titleEnCells: Locator;
  /** Active switches of the rows (checkboxes, checked when the term is active). */
  readonly activeToggles: Locator;

  /** "Are you sure to delete this item?" confirmation of the grid's Delete action. */
  readonly deleteDialog: ConfirmDialog;

  constructor(page: Page) {
    super(
      page,
      TaxonomyListPage.path,
      'default-id',
      `form[action="${TaxonomyListPage.path}"]`,
      // Reset reopens the list of the current type: index?type=<key>.
      `a[href^="${TaxonomyListPage.path}?type="]`,
    );
    // Links with an icon-font glyph in their accessible name ("Create Taxonomy", the sorted
    // column's header) are matched by their text instead of by role and name.
    this.createButton = this.searchForm.locator('a', { hasText: exactText('Create Taxonomy') });
    this.titleSearchInput = this.searchForm.getByLabel('Title', { exact: true });
    this.titleEnSearchInput = this.searchForm.getByLabel('Title En', { exact: true });
    this.statusFilterValue = this.filterValue('taxonomysearch-status');

    this.idCells = this.columnCells(column.id);
    this.titleCells = this.columnCells(column.title);
    this.titleEnCells = this.columnCells(column.titleEn);
    this.activeToggles = this.columnCells(column.active).locator('input[type="checkbox"]');

    this.deleteDialog = new ConfirmDialog(page);
  }

  /**
   * Opens a type's term list, optionally with more query parameters
   * (e.g. { sort: 'id', page: '2' }).
   */
  async gotoType(type: string, query: Record<string, string> = {}): Promise<void> {
    const params = new URLSearchParams({ type, ...query }).toString();
    await this.page.goto(`${TaxonomyListPage.path}?${params}`);
  }

  /** Rows whose Title En is exactly this text (ignoring surrounding spaces). */
  rowsTitledEn(titleEn: string): Locator {
    return this.rows.filter({
      has: this.page.locator(`td[data-col-seq="${column.titleEn}"]`, {
        hasText: exactText(titleEn.trim()),
      }),
    });
  }

  titleCell(row: Locator): Locator {
    return this.rowCell(row, column.title);
  }

  titleEnCell(row: Locator): Locator {
    return this.rowCell(row, column.titleEn);
  }

  activeToggle(row: Locator): Locator {
    return this.rowCell(row, column.active).locator('input[type="checkbox"]');
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
  sortLink(columnName: string): Locator {
    return this.columnHeaders.locator('a', { hasText: exactText(columnName) });
  }

  /** Clicks a column's sort link and waits for the sorted page. */
  async sortBy(columnName: TaxonomySortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(columnName));
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleSearchInput.fill(title);
    await this.search();
  }

  async searchByTitleEn(titleEn: string): Promise<void> {
    await this.titleEnSearchInput.fill(titleEn);
    await this.search();
  }

  /** Picks a Status filter option ("Active" or "Inactive") and searches. */
  async filterByStatus(status: string): Promise<void> {
    await this.selectFilterOption('field-taxonomysearch-status', status);
    await this.search();
  }

  /** Clicks a row's Delete action, which opens the confirmation dialog. */
  async openDeleteConfirmation(id: string): Promise<void> {
    await this.deleteLink(id).click();
  }

  /** Deletes a term from its row action and confirms. The list reloads afterwards. */
  async deleteTerm(id: string): Promise<void> {
    await this.openDeleteConfirmation(id);
    await this.deleteDialog.confirmAndWaitForPageLoad();
  }

  /** IDs of a type's terms whose Title En is exactly this, found with the Title En search. */
  async idsOfTermsTitledEn(type: string, titleEn: string): Promise<string[]> {
    await this.gotoType(type, { 'TaxonomySearch[title_en]': titleEn.trim() });
    return this.rowsTitledEn(titleEn).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-key') ?? ''),
    );
  }

  /** ID of the one term of a type with this Title En. Fails when there is none or several. */
  async idOfTermTitledEn(type: string, titleEn: string): Promise<string> {
    const ids = await this.idsOfTermsTitledEn(type, titleEn);
    if (ids.length !== 1) {
      throw new Error(`Expected one "${type}" term titled "${titleEn}", found ${ids.length}.`);
    }
    return ids[0];
  }

  /** Deletes every term of a type whose Title En is exactly this (used for test clean-up). */
  async deleteTermsTitledEn(type: string, titleEn: string): Promise<void> {
    for (const id of await this.idsOfTermsTitledEn(type, titleEn)) {
      await this.gotoType(type, { 'TaxonomySearch[title_en]': titleEn.trim() });
      await this.deleteTerm(id);
    }
  }
}
