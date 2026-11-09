import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * Step 2 "Customer" of a customer group: its member list. Opened after saving step 1
 * (/backend/customerGroup/group-member/create?group_id=N) or from the details page
 * (/backend/customerGroup/group-member/view?group_id=N).
 */
export class CustomerGroupMembersPage extends BackendPage {
  static readonly addPath = '/backend/customerGroup/group-member/create';
  static readonly listPath = '/backend/customerGroup/group-member/view';

  readonly pageHeading: Locator;
  /** Wizard steps: "Basic Info" and "Customer". */
  readonly steps: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.steps = page.locator('.forms-wizard .nav-item');
  }

  /** Opens the step shown after saving a group. */
  async gotoAdd(groupId: string): Promise<void> {
    await this.page.goto(`${CustomerGroupMembersPage.addPath}?group_id=${groupId}`);
  }

  /** Opens the member list reached from the group's details page. */
  async gotoList(groupId: string): Promise<void> {
    await this.page.goto(`${CustomerGroupMembersPage.listPath}?group_id=${groupId}`);
  }

  step(name: string): Locator {
    return this.steps.filter({ hasText: name });
  }
}
