import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { exactText } from '@utils/text';

/** Supplier details (/backend/users/supplier/view?id=N): read-only fields grouped in sections. */
export class SupplierViewPage extends BackendPage {
  readonly pageHeading: Locator;
  readonly updateButton: Locator;
  /** A Delete button next to Update (none is shown today: see PRM-03). */
  readonly deleteButton: Locator;
  readonly breadcrumbList: Locator;
  readonly breadcrumbCurrent: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.updateButton = page.locator('a.btn', { hasText: 'Update' });
    this.deleteButton = page.locator('a.btn, button.btn').filter({ hasText: exactText('Delete') });
    this.breadcrumbList = page.locator('.breadcrumb a[href="/backend/users/supplier/index"]');
    this.breadcrumbCurrent = page.locator('.breadcrumb .active');
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier/view?id=${id}`);
  }

  /** The read-only input shown under a label, e.g. value('Cr Number'). */
  value(label: string): Locator {
    // Pending DOM review: replace the XPath with getByLabel once the label markup is confirmed.
    return this.page
      .locator('label')
      .filter({ hasText: exactText(label) })
      .locator('xpath=following-sibling::input[1]')
      .first();
  }

  section(title: string): Locator {
    return this.page.locator('button.btn-link', { hasText: title });
  }
}
