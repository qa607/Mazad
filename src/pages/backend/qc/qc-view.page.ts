import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/** A QC account's read-only View page (/backend/users/qc/view?id=). */
export class QcViewPage extends BackendPage {
  readonly pageHeading: Locator;
  readonly breadcrumbLinks: Locator;
  readonly breadcrumbCurrent: Locator;
  /** Main content area, below the header and sidebar. */
  readonly content: Locator;
  readonly sectionTitle: Locator;
  readonly values: Locator;
  readonly labels: Locator;
  /** Any Update or Delete control on the page; there is none. */
  readonly editControls: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbLinks = page.locator('.breadcrumb a');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.content = page.locator('.app-main__inner');
    this.sectionTitle = this.content.locator('.card-header').filter({ hasText: /\S/ });
    this.values = this.content.locator('.form-row .form-control');
    this.labels = this.content.locator('.form-row label');
    this.editControls = this.content.locator('a, button').filter({ hasText: /update|delete/i });
  }

  async goto(id: string): Promise<number> {
    const response = await this.page.goto(`/backend/users/qc/view?id=${id}`);
    return response?.status() ?? 0;
  }

  /** The read-only values keyed by their labels. */
  async fields(): Promise<Record<string, string>> {
    const labels = (await this.labels.allInnerTexts()).map((label) => label.trim());
    const values = await this.values.evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value.trim()),
    );
    return Object.fromEntries(labels.map((label, i) => [label, values[i]]));
  }

  /** Whether every value field is disabled (cannot be edited). */
  async allFieldsDisabled(): Promise<boolean> {
    const states = await this.values.evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).disabled),
    );
    return states.length > 0 && states.every(Boolean);
  }
}
