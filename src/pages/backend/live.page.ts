import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/backend-list.page';

/**
 * Mazad back-office "Live" list (/backend/auction/live/index): vehicles in an auction that is
 * running now. Rows are keyed by auction-item ID.
 */
export class LivePage extends BackendListPage {
  static readonly path = '/backend/auction/live/index';

  constructor(page: Page) {
    super(page, LivePage.path, 'live');
  }

  /** Opens the list filtered to one VIN. */
  async gotoByVin(vin: string): Promise<void> {
    await this.page.goto(`${LivePage.path}?LiveSearch%5Bvin_number%5D=${encodeURIComponent(vin)}`);
  }

  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }

  /** The row's Auto Extend switch (a bootstrap-switch around a checkbox). */
  autoExtendCheckbox(row: Locator): Locator {
    return row.locator('input.auto-extend');
  }

  /**
   * Turns the row's Auto Extend off. This only affects that vehicle (it posts the item ID to
   * save-auto-extend), not the global Auto Extend button or the Config setting.
   */
  async turnOffAutoExtend(row: Locator): Promise<void> {
    await row.locator('.bootstrap-switch .bootstrap-switch-handle-on').click();
    await this.resultAlertOkButton.click();
  }
}
