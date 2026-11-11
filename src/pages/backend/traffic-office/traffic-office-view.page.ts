import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * A traffic office's View page (/backend/trafficOffice/traffic-office/view?id=N): its details
 * (ID, names, status, dates) with Back, Update and Delete. Delete asks with the browser's own
 * confirm() and, when accepted, returns to the list. This is the only place an office can be
 * deleted from: the list has no Delete action.
 */
export class TrafficOfficeViewPage extends BackendPage {
  static readonly path = '/backend/trafficOffice/traffic-office/view';

  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  /** Label/value table of the details. */
  readonly details: Locator;
  readonly detailLabels: Locator;
  readonly backLink: Locator;
  readonly updateLink: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.details = page.locator('table.detail-view');
    this.detailLabels = this.details.locator('th');
    this.backLink = page.locator('a.btn[href="/backend/trafficOffice/traffic-office/index"]');
    this.updateLink = page.locator('a.btn[href*="/trafficOffice/traffic-office/update?id="]');
    this.deleteButton = page.locator('a.btn[href*="/trafficOffice/traffic-office/delete?id="]');
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`${TrafficOfficeViewPage.path}?id=${id}`);
  }

  /** The value cell of a details row, by its label ("Office Name En", "Status", ...). */
  value(label: string): Locator {
    return this.details
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: new RegExp(`^\\s*${label}\\s*$`) }) })
      .locator('td');
  }

  /**
   * Clicks Delete and answers the browser's confirm(): accept deletes the office and loads the
   * list. Returns the confirmation message.
   */
  async delete(): Promise<string> {
    let message = '';
    this.page.once('dialog', (dialog) => {
      message = dialog.message();
      void dialog.accept();
    });
    await this.clickAndWaitForPageLoad(this.deleteButton);
    return message;
  }

  /** Deletes an office by ID from its View page (used for test clean-up). */
  async deleteOffice(id: string): Promise<void> {
    await this.goto(id);
    await this.delete();
  }
}
