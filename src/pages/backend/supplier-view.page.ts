import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

/** Supplier details (/backend/users/supplier/view?id=N): read-only fields grouped in sections. */
export class SupplierViewPage extends BackendPage {
  readonly pageHeading: Locator;
  readonly updateButton: Locator;
  readonly breadcrumbList: Locator;
  readonly breadcrumbCurrent: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.updateButton = page.locator('a.btn', { hasText: 'Update' });
    this.breadcrumbList = page.locator('.breadcrumb a[href="/backend/users/supplier/index"]');
    this.breadcrumbCurrent = page.locator('.breadcrumb .active');
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier/view?id=${id}`);
  }

  /** The read-only input shown under a label, e.g. value('Cr Number'). */
  value(label: string): Locator {
    const exact = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.page
      .locator('label')
      .filter({ hasText: exact })
      .locator('xpath=following-sibling::input[1]')
      .first();
  }

  section(title: string): Locator {
    return this.page.locator('button.btn-link', { hasText: title });
  }
}
