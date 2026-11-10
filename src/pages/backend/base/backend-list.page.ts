import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { exactText } from '@utils/text';

/** Counts parsed from a grid summary such as "Showing 1-20 of 63 items." */
export interface GridSummary {
  from: number;
  to: number;
  total: number;
}

/**
 * Parent of Backend list pages: a GET search form above a Kartik grid (summary, rows keyed
 * by record ID, pager) and the SweetAlert2 result popup shown after grid actions.
 */
export abstract class BackendListPage extends BackendPage {
  readonly pageHeading: Locator;
  readonly breadcrumb: Locator;
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

  // Pager
  readonly pagination: Locator;
  readonly activePage: Locator;
  readonly previousPage: Locator;
  readonly nextPage: Locator;

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
    /** Selector of the search form, when it cannot be found by its action URL. */
    searchFormSelector = `form[action="${listPath}"]`,
  ) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumb = page.locator('.breadcrumb');
    this.breadcrumbCurrent = this.breadcrumb.locator('.breadcrumb-item.active');
    this.sidebarLink = page.locator(`.app-sidebar a[href="${listPath}"]`);

    this.searchForm = page.locator(searchFormSelector);
    this.searchButton = this.searchForm.locator('button[type="submit"]');
    this.resetButton = this.searchForm.locator(`a[href="${listPath}"]`);

    this.grid = page.locator(`#${gridId}`);
    this.summary = this.grid.locator('.summary');
    this.columnHeaders = this.grid.locator('thead tr').first().locator('th');
    this.rows = this.grid.locator('tbody tr[data-key]');
    this.emptyMessage = this.grid.locator('.empty');

    this.pagination = this.grid.locator('.pagination');
    this.activePage = this.pagination.locator('.page-item.active');
    this.previousPage = this.pagination.locator('li.prev');
    this.nextPage = this.pagination.locator('li.next');

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

  /** The grid row of one record, by its ID (the row's data-key). */
  row(id: string): Locator {
    return this.rows.and(this.page.locator(`[data-key="${id}"]`));
  }

  /** The record ID of a grid row. */
  async rowId(row: Locator): Promise<string> {
    const id = await row.getAttribute('data-key');
    if (!id) throw new Error('Grid row has no data-key (record ID).');
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
    return this.pagination.locator('a.page-link', { hasText: new RegExp(`^${pageNumber}$`) });
  }

  /** Clicks Search and waits for the filtered page to load. */
  async search(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.searchButton);
  }

  async reset(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.resetButton);
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.clickAndWaitForPageLoad(this.pageLink(pageNumber));
  }

  async goToNextPage(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.nextPage.locator('a'));
  }

  async goToPreviousPage(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.previousPage.locator('a'));
  }

  /**
   * Picks an option in one of the search form's select2 dropdowns. A string matches the
   * option text exactly (ignoring surrounding spaces); a RegExp is used as given.
   */
  protected async selectFilterOption(fieldClass: string, option: string | RegExp): Promise<void> {
    const text = typeof option === 'string' ? exactText(option) : option;
    await this.searchForm.locator(`.${fieldClass} .select2-selection`).click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: text })
      .click();
  }

  /**
   * Picks an option in a search-as-you-type select2 filter: opens it, types the text and clicks
   * the first option matching `option` (the typed text by default). Does not search.
   */
  protected async pickSearchSuggestion(
    fieldClass: string,
    typed: string,
    option: string | RegExp = typed,
  ): Promise<void> {
    await this.searchForm.locator(`.${fieldClass} .select2-selection`).click();
    await this.page.locator('.select2-container--open .select2-search__field').fill(typed);
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: option })
      .first()
      .click();
  }

  /** Text shown in a select2 dropdown of the search form (the selection or the placeholder). */
  protected filterValue(selectId: string): Locator {
    return this.searchForm.locator(`#select2-${selectId}-container`);
  }

  /** Record IDs of the rows on the current page, in grid order. */
  async rowIds(): Promise<string[]> {
    return this.rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key') ?? ''));
  }

  /** Total number of records matching the current filters (0 when none). */
  async totalCount(): Promise<number> {
    if ((await this.summary.count()) === 0) return 0;
    const total = await this.summary.locator('b').last().innerText();
    return Number(total.replace(/\D/g, ''));
  }

  /** Parses the summary into { from, to, total }. Fails when the grid shows no summary. */
  async summaryCounts(): Promise<GridSummary> {
    const text = await this.summary.innerText();
    const match = /Showing\s+([\d,]+)-([\d,]+)\s+of\s+([\d,]+)/.exec(text);
    if (!match) throw new Error(`Unexpected grid summary text: "${text}"`);
    const [from, to, total] = match.slice(1).map((n) => Number(n.replace(/,/g, '')));
    return { from, to, total };
  }

  /** Opens the list with query parameters (search-form fields, sort, page) given as is. */
  async gotoWithQuery(params: Record<string, string>): Promise<void> {
    await this.page.goto(`${this.listPath}?${new URLSearchParams(params).toString()}`);
  }

  /** The grid's column labels, in order, without the empty ones. */
  async headerLabels(): Promise<string[]> {
    const labels = await this.grid.locator('thead tr').first().locator('th').allInnerTexts();
    return labels.map((label) => label.trim()).filter(Boolean);
  }

  /**
   * One grid row as { column label: cell text } plus its record ID under "key", matching cells to
   * headers by data-col-seq. Picks the row by ID, or the first row. Null when there is no such row.
   */
  async rowValues(rowKey?: string): Promise<Record<string, string> | null> {
    if ((await this.grid.count()) === 0) return null;
    return this.grid.evaluate((grid, key) => {
      const row = key
        ? grid.querySelector(`tbody tr[data-key="${CSS.escape(key)}"]`)
        : grid.querySelector('tbody tr[data-key]');
      if (!row) return null;
      const values: Record<string, string> = { key: row.getAttribute('data-key') ?? '' };
      for (const th of grid.querySelector('thead tr')?.querySelectorAll('th') ?? []) {
        const label = (th as HTMLElement).innerText.trim();
        const seq = th.getAttribute('data-col-seq');
        const cell = seq === null ? null : row.querySelector(`td[data-col-seq="${seq}"]`);
        if (label && cell) values[label] = (cell as HTMLElement).innerText.trim();
      }
      return values;
    }, rowKey);
  }
}
