import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Inspection backend > Report by Inspectors (/report/inspector, model `InspectorReportSearch`).
 * Confirmed live 2026-11-11: grid id `inspected-cars-grid` (shared widget id with the Cars
 * report — a different page instance, no conflict), 15 rows (one per inspector, no pagination
 * needed). Each inspector's car-count cells (B2B / Salvage / ALL) are links that drill down into
 * the Cars report, pre-filtered by `inspected_by` (and `inspection_type` for B2B/Salvage).
 */
export class InspectorReportPage extends BackendListPage {
  static readonly path = '/report/inspector';

  override readonly pageHeading: Locator;
  readonly inspectorSelect: Locator;
  readonly inspectorStatusSelect: Locator;

  constructor(page: Page) {
    super(page, InspectorReportPage.path, 'inspected-cars-grid');
    this.pageHeading = page.locator('.content-header h1');
    this.inspectorSelect = page.locator('#inspectorreportsearch-inspector_id');
    this.inspectorStatusSelect = page.locator('#inspectorreportsearch-inspector_status');
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  override async goto(): Promise<void> {
    await this.page.goto(InspectorReportPage.path, { waitUntil: 'domcontentloaded' });
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

  /** Picks an inspector by name. The select2 options are each labelled "<name> - <status>"
   * (confirmed live), so this matches by prefix rather than the bare name. */
  async selectInspector(name: string): Promise<void> {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.selectFilterOption(
      'field-inspectorreportsearch-inspector_id',
      new RegExp(`^${escaped} - `),
    );
  }

  async selectInspectorStatus(status: string): Promise<void> {
    await this.selectFilterOption('field-inspectorreportsearch-inspector_status', status);
  }

  /** One inspector's row, by name (e.g. "Ahmed Othman"). */
  inspectorRow(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  /** The "No. of cars (ALL)" drill-down link in an inspector's row — opens the Cars report
   * pre-filtered by that inspector, confirmed live to be `target="_blank"` (a new tab, not a
   * same-page navigation). */
  allCarsDrillDownLink(name: string): Locator {
    return this.inspectorRow(name).locator(`a[href*="inspected_by"]`).last();
  }
}
