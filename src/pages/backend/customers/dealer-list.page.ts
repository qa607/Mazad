import type { Locator, Page } from '@playwright/test';
import { CustomerListPage } from '@pages/backend/customers/customer-list.page';

/** Mazad back-office Dealers list (/backend/users/dealer/index). */
export class DealerListPage extends CustomerListPage {
  static readonly path = '/backend/users/dealer/index';

  /** The "Are you sure?" modal of Convert user type. */
  readonly convertModal: Locator;
  readonly convertYesButton: Locator;
  /** Result popup after the conversion (SweetAlert2). */
  readonly convertResult: Locator;

  constructor(page: Page) {
    super(page, DealerListPage.path, 'DealerSearch', 'dealer');
    this.convertModal = page.locator('.modal.show');
    this.convertYesButton = this.convertModal.getByRole('button', { name: 'Yes' });
    this.convertResult = this.resultAlert;
  }

  convertLink(id: string): Locator {
    return this.row(id).locator('a[title="Convert user type"]');
  }

  /** Clicks a row's "Convert user type" icon, which opens the confirmation modal. */
  async clickConvert(id: string): Promise<void> {
    await this.convertLink(id).click();
    await this.convertYesButton.waitFor();
  }

  /** Converts a dealer to an Individual: Convert user type, then Yes; waits for the result. */
  async convertToIndividual(id: string): Promise<void> {
    await this.clickConvert(id);
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/change-user-type') && r.request().method() === 'POST',
      ),
      this.convertYesButton.click(),
    ]);
    await this.convertResult.waitFor();
  }
}
