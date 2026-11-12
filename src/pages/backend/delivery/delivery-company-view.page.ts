import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * A Delivery Company's details page (/backend/deliveryCompany/delivery-company/view?id=<id>):
 * ID, Arabic and English name, Email, Phone Number, Status, Created At and Updated At, plus Back,
 * Update and Delete buttons (Delete only for roles that may delete). Read-only here.
 */
export class DeliveryCompanyViewPage extends BackendPage {
  static readonly path = '/backend/deliveryCompany/delivery-company/view';

  readonly pageHeading: Locator;
  readonly detailRows: Locator;
  readonly backButton: Locator;
  readonly updateButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.detailRows = page.locator('.app-main__inner table tr');
    this.backButton = page.locator('.app-main__inner a', { hasText: /^\s*Back\s*$/ });
    this.updateButton = page.locator('.app-main__inner a', { hasText: /^\s*Update\s*$/ });
    this.deleteButton = page.locator('.app-main__inner a', { hasText: /^\s*Delete\s*$/ });
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`${DeliveryCompanyViewPage.path}?id=${id}`);
  }

  /** The details as label -> value ("ID", "Arabic Name", "English Name", "Email", "Phone Number", "Status", ...). */
  async details(): Promise<Record<string, string>> {
    const pairs: string[][] = await this.detailRows.evaluateAll((rows) =>
      rows.map((row) => [
        (row.querySelector('th')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        (row.querySelector('td')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ]),
    );
    return Object.fromEntries(pairs.filter(([label]) => label !== '')) as Record<string, string>;
  }
}
