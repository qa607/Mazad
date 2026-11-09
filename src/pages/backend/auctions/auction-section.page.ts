import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import type { AuctionSection } from '@test-data/auction-visibility.data';

/**
 * One auction section list (/backend/auction/<section>/index), as seen by Dev Root or by a
 * supplier: a search form with a supplier filter above a grid keyed by vehicle ID.
 */
export class AuctionSectionPage extends BackendPage {
  readonly path: string;
  readonly content: Locator;
  /** Whole page text; a refused page has no layout, only a short message. */
  readonly body: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  readonly nextPage: Locator;
  readonly supplierFilter: Locator;

  constructor(
    page: Page,
    readonly section: AuctionSection,
  ) {
    super(page);
    this.path = `/backend/auction/${section.slug}/index`;
    this.content = page.locator('.app-main__inner');
    this.body = page.locator('body');
    this.columnHeaders = page.locator('table thead tr:first-child th');
    this.rows = page.locator('table tbody tr[data-key]');
    this.nextPage = page.locator('.pagination li.next:not(.disabled)');
    this.supplierFilter = page.locator(`select[name="${section.form}[supplier_id]"]`);
  }

  /**
   * Opens the list sorted by ID, optionally filtered by supplier ID and at a given page.
   * Sorting by ID matters: the default order repeats and skips rows across pages (AUC-03).
   */
  async goto(options: { supplierId?: string; page?: number } = {}): Promise<void> {
    const query = new URLSearchParams({ sort: 'id' });
    if (options.supplierId) query.set(`${this.section.form}[supplier_id]`, options.supplierId);
    if (options.page) query.set('page', String(options.page));
    await this.page.goto(`${this.path}?${query.toString()}`);
  }

  async rowIds(): Promise<string[]> {
    return this.rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key') ?? ''));
  }

  /** Row keys across every page of the list (optionally filtered by supplier). */
  async allRowIds(supplierId?: string): Promise<string[]> {
    const ids: string[] = [];
    for (let n = 1; n <= 50; n++) {
      await this.goto({ supplierId, page: n });
      ids.push(...(await this.rowIds()));
      if ((await this.nextPage.count()) === 0) break;
    }
    return ids;
  }

  /** Supplier IDs offered in the search form's supplier filter (Dev Root sees them all). */
  async supplierOptions(): Promise<string[]> {
    return this.supplierFilter.evaluate((select: HTMLSelectElement) =>
      [...select.options].map((option) => option.value).filter(Boolean),
    );
  }

  async headerTexts(): Promise<string[]> {
    return this.columnHeaders.evaluateAll((cells) =>
      cells.map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
    );
  }

  /**
   * The details ("view") link of each row on the current page. Row keys are vehicle IDs in
   * some sections and auction IDs in others, so the row's own link is used, not its key.
   */
  async viewLinks(): Promise<string[]> {
    return this.rows.evaluateAll((rows) =>
      rows
        .map((row) => row.querySelector('a[href*="/view?id="]')?.getAttribute('href') ?? '')
        .filter(Boolean),
    );
  }

  /** Opens a details page by its link; returns the HTTP status. */
  async openDetails(link: string): Promise<number> {
    const response = await this.page.goto(link);
    return response?.status() ?? 0;
  }
}
