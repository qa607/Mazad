import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';

/** Shared View page behind both QC Users (/operation/view) and Inspectors (/inspector/view), read-only. */
export abstract class UserViewPage extends InspectionPage {
  readonly pageHeading: Locator;
  readonly fullNameEnValue: Locator;
  readonly fullNameArValue: Locator;
  readonly statusValue: Locator;
  /** Rendered as a disabled intl-tel-input text input, not plain text (confirmed live). */
  readonly mobileNumberInput: Locator;
  readonly updateLink: Locator;

  protected constructor(
    page: Page,
    private readonly viewPath: string,
  ) {
    super(page);
    // This app's own AdminLTE markup, not the main Backend's `.app-page-title` variant.
    this.pageHeading = page.locator('.content-header h1');
    const row = (label: string) =>
      page.locator('tr', { has: page.locator('th', { hasText: label }) });
    this.fullNameEnValue = row('Full Name En').locator('td');
    this.fullNameArValue = row('Full Name Ar').locator('td');
    this.statusValue = row('Status').locator('td button');
    this.mobileNumberInput = page.locator('#user-mobile_number');
    this.updateLink = page.getByRole('link', { name: 'Update', exact: true });
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  async goto(id: string): Promise<void> {
    await this.page.goto(`${this.viewPath}?id=${id}`, { waitUntil: 'domcontentloaded' });
  }
}
