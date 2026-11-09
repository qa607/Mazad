import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * Customer Group details (/backend/customerGroup/customer-group/view?id=N): step 1 "Basic Info"
 * shown read-only. Step 2 "Customer" lists the group's members.
 */
export class CustomerGroupViewPage extends BackendPage {
  static readonly path = '/backend/customerGroup/customer-group/view';

  /** "View : <name>", or the error title when the group cannot be shown. */
  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly breadcrumbList: Locator;
  readonly nameValue: Locator;
  readonly notesValue: Locator;
  /** Wizard steps: "Basic Info" and "Customer". */
  readonly steps: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    const breadcrumb = page.locator('.breadcrumb');
    this.breadcrumbCurrent = breadcrumb.locator('.breadcrumb-item.active');
    this.breadcrumbList = breadcrumb.locator(
      'a[href="/backend/customerGroup/customer-group/index"]',
    );
    this.nameValue = page.getByLabel('Name', { exact: true });
    this.notesValue = page.getByLabel('General Notes', { exact: true });
    this.steps = page.locator('.forms-wizard .nav-item');
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`${CustomerGroupViewPage.path}?id=${id}`);
  }

  step(name: string): Locator {
    return this.steps.filter({ hasText: name });
  }
}
