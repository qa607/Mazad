import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { readSaleRow } from '@pages/backend/mazad-sold-list.page';
import type { SoldListRow } from '@typings/mazad';

/**
 * Back office Delivered List (Sold → Delivered List, /backend/auction/delivered/index): sales whose
 * buyer confirmed delivery (or that the back office marked delivered). Same row layout as the Sold
 * List; each row also offers the buyer's "Signature". Read-only: rows are found by VIN and read.
 */
export class MazadDeliveredListPage extends BackendPage {
  static readonly path = '/backend/auction/delivered/index';

  readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.locator('table tbody tr.sold');
  }

  /** Opens the list filtered to one VIN. */
  async gotoVin(vin: string): Promise<void> {
    const query = new URLSearchParams({ 'DeliveredListViewSearch[vin_number]': vin });
    await this.page.goto(`${MazadDeliveredListPage.path}?${query.toString()}`);
  }

  /** The row of one sale (its auction item ID). */
  row(saleId: number): Locator {
    return this.rows.and(this.page.locator(`[data-key="${saleId}"]`));
  }

  async readRow(row: Locator): Promise<SoldListRow> {
    return readSaleRow(row);
  }
}
