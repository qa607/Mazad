import type { Locator, Page } from '@playwright/test';

/**
 * The first Kartik grid of whichever Backend page is open, for specs that visit many report pages
 * (permissions, data scope) and only need the rows, the total and a filter's options. Unlike
 * BackendListPage.totalCount(), it tells "no grid" (error page, 403, login) apart from "no rows".
 */
export class ReportGridComponent {
  readonly grid: Locator;
  readonly summary: Locator;
  readonly rows: Locator;

  constructor(private readonly page: Page) {
    this.grid = page.locator('.grid-view').first();
    this.summary = this.grid.locator('.summary');
    this.rows = this.grid.locator('tbody tr[data-key]');
  }

  /** Opens a Backend page by path (optionally with query parameters) and returns its HTTP status. */
  async open(path: string, params: Record<string, string> = {}): Promise<number | null> {
    const query = new URLSearchParams(params).toString();
    const response = await this.page.goto(query ? `${path}?${query}` : path);
    return response?.status() ?? null;
  }

  /** Records matching the current filters: 0 for an empty grid, null when there is no grid. */
  async totalCount(): Promise<number | null> {
    if ((await this.grid.count()) === 0) return null;
    if ((await this.summary.count()) === 0) return 0;
    return Number((await this.summary.locator('b').last().innerText()).replace(/\D/g, ''));
  }

  /** Record IDs of the rows shown, in grid order. */
  async rowIds(): Promise<string[]> {
    return this.rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key') ?? ''));
  }

  /** Option values of a search-form select, by its field name ("SoldReportViewSearch[supplier_id]"). */
  async filterOptionValues(fieldName: string): Promise<string[]> {
    return this.page
      .locator(`select[name="${fieldName}"] option`)
      .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  }
}
