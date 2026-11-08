import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parent of Backend list pages: a GET search form above a Kartik grid (summary, rows keyed
 * by vehicle ID, pager) and the SweetAlert2 result popup shown after grid actions.
 */
export abstract class BackendListPage extends BackendPage {
  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly sidebarLink: Locator;

  // Search form
  readonly searchForm: Locator;
  readonly searchButton: Locator;
  readonly resetButton: Locator;

  // Grid
  readonly grid: Locator;
  /** "Showing 1-20 of 422 items." Not rendered when there are no results. */
  readonly summary: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  readonly emptyMessage: Locator;
  readonly activePage: Locator;

  // Result alert (SweetAlert2)
  readonly resultAlert: Locator;
  readonly resultAlertTitle: Locator;
  readonly resultAlertSuccessIcon: Locator;
  readonly resultAlertOkButton: Locator;

  protected constructor(
    page: Page,
    /** List URL path, relative to baseURL. */
    protected readonly listPath: string,
    /** id of the grid container. */
    gridId: string,
  ) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.sidebarLink = page.locator(`.app-sidebar a[href="${listPath}"]`);

    this.searchForm = page.locator(`form[action="${listPath}"]`);
    this.searchButton = this.searchForm.locator('button[type="submit"]');
    this.resetButton = this.searchForm.locator(`a[href="${listPath}"]`);

    this.grid = page.locator(`#${gridId}`);
    this.summary = this.grid.locator('.summary');
    this.columnHeaders = this.grid.locator('thead tr').first().locator('th');
    this.rows = this.grid.locator('tbody tr[data-key]');
    this.emptyMessage = this.grid.locator('.empty');
    this.activePage = this.grid.locator('.pagination .page-item.active');

    this.resultAlert = page.locator('.swal2-popup');
    this.resultAlertTitle = this.resultAlert.locator('.swal2-title');
    this.resultAlertSuccessIcon = this.resultAlert.locator('.swal2-icon.swal2-success');
    this.resultAlertOkButton = this.resultAlert.locator('.swal2-confirm');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.listPath);
  }

  /** Opens a page of the unfiltered list directly by URL. */
  async gotoPage(pageNumber: number): Promise<void> {
    await this.page.goto(`${this.listPath}?page=${pageNumber}`);
  }

  row(vehicleId: string): Locator {
    return this.rows.and(this.page.locator(`[data-key="${vehicleId}"]`));
  }

  /** The vehicle ID of a grid row. */
  async rowId(row: Locator): Promise<string> {
    const id = await row.getAttribute('data-key');
    if (!id) throw new Error('Grid row has no data-key (vehicle ID).');
    return id;
  }

  rowCheckbox(row: Locator): Locator {
    return row.locator('input.checkbox-row');
  }

  /** Cells of one grid column, by the column's data-col-seq attribute. */
  protected columnCells(columnSeq: number): Locator {
    return this.rows.locator(`td[data-col-seq="${columnSeq}"]`);
  }

  protected rowCell(row: Locator, columnSeq: number): Locator {
    return row.locator(`td[data-col-seq="${columnSeq}"]`);
  }

  pageLink(pageNumber: number): Locator {
    return this.grid.locator('.pagination a.page-link', { hasText: new RegExp(`^${pageNumber}$`) });
  }

  async search(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.searchButton);
  }

  async reset(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.resetButton);
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.clickAndWaitForPageLoad(this.pageLink(pageNumber));
  }

  /**
   * Picks an option in one of the search form's select2 dropdowns. A string matches the
   * option text exactly (ignoring surrounding spaces); a RegExp is used as given.
   */
  protected async selectFilterOption(fieldClass: string, option: string | RegExp): Promise<void> {
    const text =
      typeof option === 'string' ? new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) : option;
    await this.searchForm.locator(`.${fieldClass} .select2-selection`).click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: text })
      .click();
  }

  /** Text shown in a select2 dropdown of the search form (the selection or the placeholder). */
  protected filterValue(selectId: string): Locator {
    return this.searchForm.locator(`#select2-${selectId}-container`);
  }

  /** Vehicle IDs of the rows on the current page, in grid order. */
  async rowIds(): Promise<string[]> {
    return this.rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key') ?? ''));
  }

  /** Total number of vehicles matching the current filters (0 when none). */
  async totalCount(): Promise<number> {
    if ((await this.summary.count()) === 0) return 0;
    const total = await this.summary.locator('b').last().innerText();
    return Number(total.replace(/\D/g, ''));
  }
}
