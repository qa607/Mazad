import type { Locator, Page } from '@playwright/test';
import type { Download } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Inspection backend > Report by Cars (/report/inspection, model `InspectionReportSearch`).
 * Confirmed live 2026-11-11: grid id `inspected-cars-grid`, 19,067+ rows, no pagination cap other
 * than the grid's own (100/page). Rows carry **no navigation link at all** — this report is
 * tabular only, there is no View/drill-down action per row. Export (CSV/Excel, Kartik grid
 * export — same widget as the main Backend's OperationListPage) is the only action available.
 */
export class CarsReportPage extends BackendListPage {
  static readonly path = '/report/inspection';

  override readonly pageHeading: Locator;
  readonly vinInput: Locator;
  readonly titleInput: Locator;
  readonly exportMenuToggle: Locator;
  readonly exportFormatLinks: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;

  constructor(page: Page) {
    super(page, CarsReportPage.path, 'inspected-cars-grid');
    // This app's own AdminLTE markup, not the main Backend's `.app-page-title` variant.
    this.pageHeading = page.locator('.content-header h1');
    this.vinInput = page.locator('#inspectionreportsearch-vin_number');
    this.titleInput = page.locator('#inspectionreportsearch-title_en');
    this.exportMenuToggle = page.locator('[title="Export data in selected format"]');
    // Confirmed live: this app's Bootstrap 3 dropdown JS never adds a `.show` class to
    // `.dropdown-menu` (unlike Bootstrap 4/5) — the menu is simply shown/hidden in place.
    this.exportFormatLinks = page.locator('.dropdown-menu a');
    this.exportColumnsToggle = page.locator('[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('[id$="-cols-list"] label');
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  override async goto(): Promise<void> {
    await this.page.goto(CarsReportPage.path, { waitUntil: 'domcontentloaded' });
  }

  private waitForListResponse() {
    return this.page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().includes(this.listPath),
    );
  }

  override async search(): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.searchButton.click()]);
  }

  override async reset(): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.resetButton.click()]);
  }

  async selectMake(name: string): Promise<void> {
    await this.selectFilterOption('field-make-id', name);
  }

  /** Picks an inspector by name. The select2 options are each labelled "<name> - <status>"
   * (confirmed live), so this matches by prefix rather than the bare name. */
  async selectInspector(name: string): Promise<void> {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.selectFilterOption(
      'field-inspectionreportsearch-inspected_by',
      new RegExp(`^${escaped} - `),
    );
  }

  async startExport(format: 'CSV' | 'Excel 2007+'): Promise<void> {
    await this.exportMenuToggle.click();
    await this.exportFormatLinks.filter({ hasText: format }).click();
  }

  /** Clicks a format and returns the downloaded file — a safe, read-only action.
   * `timeout` is overridable since the real export is a confirmed no-op on this report: a test
   * asserting that should fail quickly within its own body, not via the whole test timing out. */
  async exportAs(format: 'CSV' | 'Excel 2007+', timeout?: number): Promise<Download> {
    await this.exportMenuToggle.click();
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout }),
      this.exportFormatLinks.filter({ hasText: format }).click(),
    ]);
    return download;
  }
}
