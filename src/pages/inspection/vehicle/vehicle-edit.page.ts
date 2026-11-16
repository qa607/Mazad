import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';

/**
 * Basic Info edit form for a vehicle (/car/update?id=N), model `CarCreateForm`. Confirmed live
 * 2026-11-11: ~50 fields in total; only a handful are exposed here by name (the ones these specs
 * actually use) plus a generic by-model-attribute lookup for anything else. Two submit buttons
 * exist, "Save as Draft" and "Save" — tests use the plain "Save" button.
 */
export class VehicleEditPage extends InspectionPage {
  static readonly path = '/car/update';

  readonly pageHeading: Locator;
  readonly vinInput: Locator;
  readonly titleEnInput: Locator;
  readonly subTitleEnInput: Locator;
  /** "Transferred To" (`CarCreateForm[city_id]`, Photography/Salvage only) - confirmed live
   * 2026-11-14 that this one field's own `id` is the literal `city-id`, not the
   * `carcreateform-city_id` every other field here follows (a real markup inconsistency in this
   * app), so it cannot go through fieldByAttribute()/selectedOptionText() like the rest. */
  readonly transferredToSelect: Locator;
  readonly saveButton: Locator;
  readonly saveAsDraftButton: Locator;
  readonly cancelLink: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.content-header h1');
    this.vinInput = page.locator('#carcreateform-vin_number');
    this.titleEnInput = page.locator('#carcreateform-title_en');
    this.subTitleEnInput = page.locator('#carcreateform-sub_title_en');
    this.transferredToSelect = page.locator('#city-id');
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.saveAsDraftButton = page.getByRole('button', { name: 'Save as Draft', exact: true });
    this.cancelLink = page.getByRole('link', { name: 'Cancel', exact: true });
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  async goto(id: string): Promise<void> {
    await this.page.goto(`${VehicleEditPage.path}?id=${id}`, { waitUntil: 'domcontentloaded' });
  }

  /** A `CarCreateForm` field by its model attribute name, for fields not exposed above. */
  fieldByAttribute(attribute: string): Locator {
    return this.page.locator(`#carcreateform-${attribute}`);
  }

  /**
   * The visible text of a `<select>` field's currently chosen `<option>`, by the field's model
   * attribute name — for a Select2 widget (confirmed live 2026-11-14: every Select here renders as
   * `aria-hidden="true"`, visually replaced by its own `.select2-selection`, but the real
   * `<select>`'s own `<option selected>` always reflects the persisted value regardless of the
   * widget's visual state). Empty string when no option is selected.
   */
  async selectedOptionText(attribute: string): Promise<string> {
    const value = await this.fieldByAttribute(attribute)
      .locator('option:checked')
      .textContent();
    return value?.trim() ?? '';
  }

  /** Same as selectedOptionText(), for a `<select>` found by an arbitrary locator instead of the
   * usual `carcreateform-{attribute}` id - e.g. transferredToSelect, whose own id doesn't follow
   * that convention. */
  async selectedOptionTextOf(select: Locator): Promise<string> {
    const value = await select.locator('option:checked').textContent();
    return value?.trim() ?? '';
  }

  /**
   * True when this URL actually rendered the editable Basic Info form. Confirmed live
   * 2026-11-11: for an Ongoing-status vehicle, this same `/car/update` URL instead renders the
   * read-only view content (no form fields, no Save button) — a real, status-dependent
   * difference, not a loading timing issue.
   */
  async isEditableForm(): Promise<boolean> {
    return this.saveButton.isVisible().catch(() => false);
  }

  /**
   * Clicks Save and waits for the real submission's HTML response — not the 'load' event or a
   * sequential waitForLoadState() call, either of which can resolve against a state the page was
   * already in before this click's navigation even started.
   */
  async save(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes(VehicleEditPage.path) &&
          (response.headers()['content-type'] ?? '').includes('text/html'),
      ),
      this.saveButton.click(),
    ]);
  }

  /** Clicks Cancel and waits for the resulting navigation (back to the list — a different path,
   * so waiting for the URL to change is safe: it cannot already match before the click).
   * domcontentloaded, not waitForURL()'s own default of 'load': a slow/hanging subresource on
   * this app can keep 'load' from ever firing even though the page is fully usable. */
  async cancel(): Promise<void> {
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.startsWith(VehicleEditPage.path), {
        waitUntil: 'domcontentloaded',
      }),
      this.cancelLink.click(),
    ]);
  }
}
