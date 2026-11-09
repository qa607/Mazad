import type { Locator, Page } from '@playwright/test';
import { AuctionListPage } from '@pages/backend/auction-list.page';

/**
 * Mazad back-office "Awaiting" list (/backend/auction/awaiting/index): vehicles in an auction
 * that has not started yet. Rows are keyed by upcoming-item ID.
 */
export class AwaitingPage extends AuctionListPage {
  static readonly path = '/backend/auction/awaiting/index';

  readonly bulkBackToUpcomingButton: Locator;

  constructor(page: Page) {
    super(page, AwaitingPage.path, 'awaiting');
    this.bulkBackToUpcomingButton = this.grid.locator('.kv-grid-toolbar a.back-upcoming-multi-btn');
  }

  /** Rows whose text contains a VIN. */
  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }

  /** Selects one row and opens the bulk "Back to upcoming" confirmation. */
  async openBackToUpcomingConfirmation(row: Locator): Promise<void> {
    await this.rowCheckbox(row).check();
    await this.bulkBackToUpcomingButton.click();
  }

  /** Moves a vehicle out of its auction, back to the Upcoming list, and closes the alert. */
  async backToUpcoming(vin: string): Promise<void> {
    await this.openBackToUpcomingConfirmation(this.rowByVin(vin));
    await this.confirmYesButton.click();
    await this.resultAlertOkButton.click();
  }
}
