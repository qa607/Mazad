import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import type { FaqCategoryData } from '@test-data/faq.data';
import { exactText } from '@utils/text';

const BASE = '/backend/helpCenter/faq-category';

/** Grid columns, by their data-col-seq attribute. */
const column = { name: 1, nameEn: 2, createdAt: 3, sorting: 5, actions: 6 } as const;

/**
 * Help Center > Faq Categories (/backend/helpCenter/faq-category/*): the list (search by Name,
 * Name En and Created At, Sorting, Export), the create / update form (icon, Name, Name En, SEO
 * fields) and a category's View page. Deleting from the grid asks in the in-page Confirmation
 * dialog. Rows are keyed by category ID.
 */
export class FaqCategoryPage extends BackendListPage {
  static readonly path = `${BASE}/index`;

  // List
  readonly createButton: Locator;
  readonly sortingButton: Locator;
  readonly filterLabels: Locator;
  readonly nameSearchInput: Locator;
  readonly nameEnSearchInput: Locator;
  /** Shown value of the Created At range filter ("2026-11-11 - 2026-11-11"). */
  readonly createdAtRangeInput: Locator;
  readonly nameCells: Locator;
  readonly nameEnCells: Locator;
  readonly createdAtCells: Locator;
  readonly deleteDialog: ConfirmDialog;

  // Form
  readonly form: Locator;
  readonly iconUploader: Locator;
  /** Set by the page once the chosen icon is uploaded. */
  readonly iconValue: Locator;
  readonly nameInput: Locator;
  readonly nameEnInput: Locator;
  readonly iconError: Locator;
  readonly nameError: Locator;
  readonly nameEnError: Locator;
  readonly saveButton: Locator;
  readonly cancelLink: Locator;

  // View
  readonly details: Locator;

  constructor(page: Page) {
    super(page, FaqCategoryPage.path, 'default-id');
    this.createButton = this.searchForm.locator(`a[href="${BASE}/create"]`);
    this.sortingButton = this.searchForm.locator(`a[href="${BASE}/ordering"]`);
    this.filterLabels = this.searchForm.locator('.form-row label');
    this.nameSearchInput = this.searchForm.locator('#faqcategorysearch-name');
    this.nameEnSearchInput = this.searchForm.locator('#faqcategorysearch-name_en');
    this.createdAtRangeInput = this.searchForm.locator(
      '.field-faqcategorysearch-create_at_range .range-value',
    );
    this.nameCells = this.columnCells(column.name);
    this.nameEnCells = this.columnCells(column.nameEn);
    this.createdAtCells = this.columnCells(column.createdAt);
    this.deleteDialog = new ConfirmDialog(page);

    this.form = page.locator('form', { has: page.locator('#faqcategory-name') });
    this.iconUploader = this.form.locator('#fake-category-icon-add_uploader');
    this.iconValue = this.form.locator('#fake_category_icon_add');
    this.nameInput = this.form.locator('#faqcategory-name');
    this.nameEnInput = this.form.locator('#faqcategory-name_en');
    this.iconError = this.form.locator('.field-fake_category_icon_add .invalid-feedback');
    this.nameError = this.form.locator('.field-faqcategory-name .invalid-feedback');
    this.nameEnError = this.form.locator('.field-faqcategory-name_en .invalid-feedback');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelLink = this.form.locator(`a[href="${FaqCategoryPage.path}"]`);

    this.details = page.locator('table.detail-view');
  }

  // ---- List ----

  /** Opens the list with search parameters, e.g. { name_en: 'About' }. */
  async gotoSearch(query: Partial<Record<'name' | 'name_en' | 'create_at_range', string>>) {
    const params = new URLSearchParams(
      Object.entries(query).map(([field, value]) => [`FaqCategorySearch[${field}]`, value]),
    );
    await this.page.goto(`${FaqCategoryPage.path}?${params.toString()}`);
  }

  /** Rows whose Name En is exactly this text. */
  rowsNamedEn(nameEn: string): Locator {
    return this.rows.filter({
      has: this.page.locator(`td[data-col-seq="${column.nameEn}"]`, {
        hasText: exactText(nameEn),
      }),
    });
  }

  nameCell(row: Locator): Locator {
    return this.rowCell(row, column.name);
  }

  nameEnCell(row: Locator): Locator {
    return this.rowCell(row, column.nameEn);
  }

  /** The row's "Sort" link (opens the ordering page for that category). */
  sortLink(row: Locator): Locator {
    return this.rowCell(row, column.sorting).locator('a');
  }

  /** The row's action links (View, Update, Delete), in display order. */
  actionLinks(row: Locator): Locator {
    return this.rowCell(row, column.actions).locator('a');
  }

  deleteLink(id: string): Locator {
    return this.row(id).locator(`a[href="${BASE}/delete?id=${id}"]`);
  }

  async searchByName(name: string): Promise<void> {
    await this.nameSearchInput.fill(name);
    await this.search();
  }

  async searchByNameEn(nameEn: string): Promise<void> {
    await this.nameEnSearchInput.fill(nameEn);
    await this.search();
  }

  /** Picks a preset of the Created At range picker ("Today", "Last 7 Days" ...) and searches. */
  async filterCreatedAt(preset: string): Promise<void> {
    await this.createdAtRangeInput.click();
    await this.page
      .locator('.daterangepicker')
      .filter({ visible: true })
      .locator('.ranges li', { hasText: exactText(preset) })
      .click();
    await this.search();
  }

  async openSorting(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortingButton);
  }

  async openCreateForm(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.createButton);
  }

  /** Clicks a row's Delete, which opens the Confirmation dialog. */
  async openDeleteConfirmation(id: string): Promise<void> {
    await this.deleteLink(id).click();
  }

  /**
   * Deletes a category from the grid, filtered to its Name En so its row is on the page, and
   * confirms. The list reloads with a message. Its questions are deleted with it.
   */
  async deleteCategory(id: string, nameEn: string): Promise<void> {
    await this.gotoSearch({ name_en: nameEn });
    await this.openDeleteConfirmation(id);
    await this.deleteDialog.confirmAndWaitForPageLoad();
  }

  /** IDs of the categories whose Name En is exactly this (found with the Name En search). */
  async idsOfCategoriesNamedEn(nameEn: string): Promise<string[]> {
    await this.gotoSearch({ name_en: nameEn });
    return this.rowsNamedEn(nameEn).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-key') ?? ''),
    );
  }

  // ---- Form ----

  async gotoCreate(): Promise<void> {
    await this.page.goto(`${BASE}/create`);
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`${BASE}/update?id=${id}`);
  }

  /** Chooses an icon file and waits until the page has uploaded it. */
  async uploadIcon(file: string): Promise<void> {
    await this.iconUploader.setInputFiles(file);
    await this.page.waitForFunction(
      (input) => (input as HTMLInputElement).value !== '',
      await this.iconValue.elementHandle(),
    );
  }

  /** Fills the name fields that are given. */
  async fillForm(data: Partial<FaqCategoryData>): Promise<void> {
    if (data.name !== undefined) await this.nameInput.fill(data.name);
    if (data.nameEn !== undefined) await this.nameEnInput.fill(data.nameEn);
  }

  /** Clicks Save. Invalid input stays on the form; valid input opens the View page. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async saveAndWaitForPageLoad(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.saveButton);
  }

  /** Creates a category with an icon through the form; returns its ID (from its View page). */
  async createCategory(data: FaqCategoryData, icon: string): Promise<string> {
    await this.gotoCreate();
    await this.uploadIcon(icon);
    await this.fillForm(data);
    await this.saveAndWaitForPageLoad();
    return this.idFromViewUrl(data.nameEn);
  }

  /** The record ID of the View page this tab shows. */
  idFromViewUrl(label: string): string {
    const id = /\/faq-category\/view\?id=(\d+)$/.exec(this.page.url())?.[1];
    if (!id) throw new Error(`Saving category "${label}" did not open its View page.`);
    return id;
  }

  // ---- View ----

  async gotoView(id: string): Promise<void> {
    await this.page.goto(`${BASE}/view?id=${id}`);
  }

  /** A value on the View page, by its label ("Name En", "Slug En", ...). */
  viewValue(label: string): Locator {
    return this.details
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: exactText(label) }) })
      .locator('td');
  }
}
