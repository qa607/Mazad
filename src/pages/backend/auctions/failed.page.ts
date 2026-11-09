import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Mazad back-office "Failed" list (/backend/auction/failed/index): vehicles whose auction ended
 * without a sale. Rows are keyed by auction-item ID.
 */
export class FailedPage extends BackendListPage {
  static readonly path = '/backend/auction/failed/index';

  constructor(page: Page) {
    super(page, FailedPage.path, 'failed');
  }

  /** Opens the list filtered to one VIN. */
  async gotoByVin(vin: string): Promise<void> {
    await this.page.goto(
      `${FailedPage.path}?FailedListViewSearch%5Bvin_number%5D=${encodeURIComponent(vin)}`,
    );
  }

  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }
}
