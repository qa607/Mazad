import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';

/**
 * Inspection points (/car/viewinspection?id=N), read-only. Confirmed live 2026-11-11: every
 * checkbox here is HTML-disabled and the page has no submit button — this holds for both the QC
 * role and Admin, so it is not a QC-specific restriction. Inspection points can only be set
 * through the Android Inspector app's own physical-inspection flow; the Backend only displays
 * them.
 */
export class VehicleInspectionPage extends InspectionPage {
  static readonly path = '/car/viewinspection';

  readonly pageHeading: Locator;
  /** Each inspection point's row: a `<tr>` whose first cell is the point's name. */
  readonly pointRows: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.content-header h1');
    this.pointRows = page
      .locator('table tr')
      .filter({ has: page.locator('input[type="checkbox"]') });
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  async goto(id: string): Promise<void> {
    await this.page.goto(`${VehicleInspectionPage.path}?id=${id}`, {
      waitUntil: 'domcontentloaded',
    });
  }

  /** Every inspection point's name, in display order. */
  async pointNames(): Promise<string[]> {
    return this.pointRows.evaluateAll((rows) =>
      rows.map((row) => row.querySelector('td')?.textContent?.trim() ?? ''),
    );
  }

  /** One point's row, by its name (e.g. "Hood", "Engine"). */
  point(name: string): Locator {
    return this.pointRows.filter({ has: this.page.locator('td', { hasText: name }) }).first();
  }

  /** The option label(s) currently selected (checked) for one point; empty when none is set. */
  async selectedOptions(name: string): Promise<string[]> {
    return this.point(name)
      .locator('label')
      .filter({ has: this.page.locator('input:checked') })
      .evaluateAll((labels) => labels.map((label) => label.textContent?.trim() ?? ''));
  }

  /** Confirms no checkbox on this page can be interacted with (read-only, confirmed for every role). */
  async isReadOnly(): Promise<boolean> {
    const total = await this.page.locator('input[type="checkbox"], input[type="radio"]').count();
    const enabled = await this.page
      .locator('input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled)')
      .count();
    return total > 0 && enabled === 0;
  }
}
