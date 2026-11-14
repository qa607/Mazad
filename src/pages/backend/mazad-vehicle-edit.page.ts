import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

export interface VehicleEditFormCounts {
  total: number;
  enabled: number;
}

/**
 * Back office vehicle edit form (/backend/vehicle/vehicle/update?id=<vehicleId>, model
 * VehicleSellit). Read-only investigation only: no field is ever filled or submitted.
 *
 * Confirmed live: the page carries several other forms of its own (global search, per-image
 * upload widgets) alongside the real edit form, so the edit form is identified by its `action`
 * (`/backend/vehicle/vehicle/update?id=...`), not a bare `form` selector. For a lifecycle status
 * this app locks (e.g. Ongoing), the server redirects this same URL to `/vehicle/vehicle/view`
 * instead of rendering a form at all.
 */
export class MazadVehicleEditPage extends BackendPage {
  static readonly path = '/backend/vehicle/vehicle/update';

  readonly heading: Locator;
  readonly editForm: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.locator('.app-page-title .page-title-head');
    this.editForm = page.locator(`form[action^="${MazadVehicleEditPage.path}"]`);
    this.saveButton = this.editForm.getByRole('button', { name: 'Save', exact: true });
  }

  /** Returns the HTTP status of the response, so a caller can tell a real page from a 403. */
  async goto(vehicleId: number): Promise<number | undefined> {
    const response = await this.page.goto(`${MazadVehicleEditPage.path}?id=${vehicleId}`, {
      waitUntil: 'domcontentloaded',
    });
    return response?.status();
  }

  /** True only when the server rendered the real edit form at this URL (not a redirect to the
   * view page, and not some other error page). */
  async isEditableForm(): Promise<boolean> {
    return (
      (await this.editForm.count()) > 0 && (await this.saveButton.isVisible().catch(() => false))
    );
  }

  /** Total and enabled input/select/textarea fields inside the real edit form. */
  async fieldCounts(): Promise<VehicleEditFormCounts> {
    const fields = this.editForm.locator('input, select, textarea');
    const total = await fields.count();
    const enabled = await fields.evaluateAll(
      (elements) => elements.filter((el) => !(el as HTMLInputElement).disabled).length,
    );
    return { total, enabled };
  }
}
