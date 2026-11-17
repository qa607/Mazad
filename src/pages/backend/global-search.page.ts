import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/** A vehicle's titles as Global Search lists them. */
export interface VehicleTitles {
  /** The Arabic title, as the apps show it in Arabic. */
  title: string;
  titleEn: string;
}

/**
 * Back office Global Search (/backend/globalSearch/global-search/index): one row per vehicle
 * matching a text (VIN, title…), with its Arabic and English titles. Read-only.
 */
export class GlobalSearchPage extends BackendPage {
  static readonly path = '/backend/globalSearch/global-search/index';

  readonly headers: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.headers = page.locator('table thead tr').first().locator('th');
    this.rows = page.locator('table tbody tr');
  }

  async search(text: string): Promise<void> {
    const query = new URLSearchParams({ 'GlobalSearch[search_text]': text });
    await this.page.goto(`${GlobalSearchPage.path}?${query.toString()}`);
  }

  /** The titles of the vehicle with this VIN, or null when Global Search does not list it. */
  async vehicleTitles(vin: string): Promise<VehicleTitles | null> {
    await this.search(vin);
    const headers = (await this.headers.allInnerTexts()).map((h) => h.trim());
    const column = (name: string) => headers.indexOf(name);
    for (const row of await this.rows.all()) {
      const cells = (await row.locator('td').allInnerTexts()).map((c) =>
        c.replace(/\s+/g, ' ').trim(),
      );
      if (cells[column('VIN')] === vin) {
        return { title: cells[column('Title')], titleEn: cells[column('Title En')] };
      }
    }
    return null;
  }
}
