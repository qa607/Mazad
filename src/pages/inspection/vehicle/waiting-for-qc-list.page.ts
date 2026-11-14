import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Waiting for QC (/car/waitingforqc). A genuine Kartik/Krajee grid (`#cars-grid`), confirmed live
 * 2026-11-11. The search form's action and the Reset link's href both equal the list path, so
 * BackendListPage's defaults already match (search()/reset()/summaryCounts() are inherited,
 * unchanged). Confirmed real filters: Make, Model (depends on Make), Year, VIN, Plate Number,
 * Supplier, Company, Is For Inspection Only, Inspection Date (range picker), Inspector, City.
 *
 * The VIN and vehicle title in a row both link to the same destination, `/car/update?id=N` (the
 * Basic Info edit form) — there is no separate read-only view those links navigate to.
 */
export class WaitingForQcListPage extends BackendListPage {
  static readonly path = '/car/waitingforqc';

  override readonly pageHeading: Locator;
  readonly vinInput: Locator;

  constructor(page: Page) {
    super(page, WaitingForQcListPage.path, 'cars-grid');
    // This app's own AdminLTE markup, not the main Backend's `.app-page-title` variant.
    this.pageHeading = page.locator('.content-header h1');
    this.vinInput = page.locator('#carsearch-vin_number');
  }

  /**
   * Picks a Make in the search form. The underlying `<select>` is a select2 widget (confirmed
   * live: `aria-hidden="true"`, visually replaced by `.select2-selection`), so a plain
   * `selectOption()` call times out waiting for an element Select2 deliberately hides — this uses
   * BackendListPage's existing select2 helper instead. Model, Supplier, Company, Is For
   * Inspection Only, Inspector and City are select2 widgets too, confirmed live but not yet
   * exposed here: add a method the same way when a test needs one.
   */
  async selectMake(name: string): Promise<void> {
    await this.selectFilterOption('field-make-id', name);
  }

  /** Waits for a new GET response to this list's own path — robust against this app's 'load'
   * event sometimes never firing, and against waitForLoadState() resolving against a state the
   * page was already in before the navigation it's meant to wait for even started. */
  private waitForListResponse() {
    return this.page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().includes(this.listPath),
    );
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  override async goto(): Promise<void> {
    await this.page.goto(WaitingForQcListPage.path, { waitUntil: 'domcontentloaded' });
  }

  override async search(): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.searchButton.click()]);
  }

  override async reset(): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.resetButton.click()]);
  }

  override async goToNextPage(): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.nextPage.locator('a').click()]);
  }

  override async goToPreviousPage(): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.previousPage.locator('a').click()]);
  }

  override async goToPage(pageNumber: number): Promise<void> {
    await Promise.all([this.waitForListResponse(), this.pageLink(pageNumber).click()]);
  }

  /** The title link in a row (navigates to the Basic Info edit form, confirmed live). */
  titleLink(row: Locator): Locator {
    return row.locator(`a[href^="/car/update"]`).first();
  }

  /** The VIN link in a row (same destination as the title link, confirmed live). */
  vinLink(row: Locator): Locator {
    return row.locator(`a[href^="/car/update"]`).nth(1);
  }
}
