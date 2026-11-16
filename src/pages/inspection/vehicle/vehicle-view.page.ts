import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';

/** Read-only vehicle details (/car/view?id=N). Confirmed live 2026-11-11: this page, the Basic
 * Info edit form, the Inspection page and the Photos page all share the same 3-step progress bar
 * ("Basic Info" / "Inspection" / "Photos"), but each is its own URL, not a tab panel. */
export class VehicleViewPage extends InspectionPage {
  static readonly path = '/car/view';

  readonly pageHeading: Locator;
  readonly vinValue: Locator;
  readonly statusValue: Locator;
  readonly titleEnValue: Locator;
  readonly inspectionLink: Locator;
  readonly photosLink: Locator;
  readonly editLink: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.content-header h1');
    // Confirmed live: each field is `<div class="form-group"><label>Label</label><div>Value</div>
    // </div>`, not a table row — and the Vin Number label's `for` attribute actually points at
    // title_en's id (a real app mislabeling), so fields here are found by their own label text,
    // not by the label's `for`.
    const field = (label: string | RegExp) =>
      page.locator('.form-group', { has: page.locator('label', { hasText: label }) });
    this.vinValue = field('Vin Number').locator('div').first();
    this.statusValue = field(/^Status$/)
      .locator('div')
      .first();
    // Not plain "Title EN": "Sub Title EN" would also match that substring.
    this.titleEnValue = field(/^Title EN$/)
      .locator('div')
      .first();
    this.inspectionLink = page.getByRole('link', { name: 'Inspection', exact: true });
    this.photosLink = page.getByRole('link', { name: 'Photos', exact: true });
    this.editLink = page.locator('#progressbar').getByRole('link', { name: 'Basic Info' });
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  async goto(id: string): Promise<void> {
    await this.page.goto(`${VehicleViewPage.path}?id=${id}`, { waitUntil: 'domcontentloaded' });
  }

  /** Every `label -> value` pair on this read-only page (see this class's own doc comment for the
   * shared `.form-group` markup), for ad-hoc cross-system (Android-to-backend) field comparisons -
   * not meant to replace the named locators above for assertions a spec actually owns. */
  async readAllFields(): Promise<Record<string, string>> {
    const groups = this.page.locator('.form-group');
    return groups.evaluateAll((nodes) => {
      const result: Record<string, string> = {};
      for (const node of nodes) {
        const label = node.querySelector('label')?.textContent?.trim();
        const value = node.querySelector('div')?.textContent?.trim();
        if (label) result[label] = value ?? '';
      }
      return result;
    });
  }
}
