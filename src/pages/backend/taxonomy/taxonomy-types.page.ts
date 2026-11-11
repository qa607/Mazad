import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { exactText } from '@utils/text';

/**
 * Taxonomy types page (/backend/taxonomy/taxonomy/index, "List All Types"): one row per
 * vocabulary type (Makes, Colors, Cities, ...) with links to manage, order and map its terms.
 */
export class TaxonomyTypesPage extends BackendPage {
  static readonly path = '/backend/taxonomy/taxonomy/index';

  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly sidebarLink: Locator;
  readonly typeRows: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.sidebarLink = page.locator(`.app-sidebar a[href="${TaxonomyTypesPage.path}"]`);
    // The types table has no header row or model-based id; it is the page's only grid table.
    this.typeRows = page.locator('.kv-grid-table tbody tr');
  }

  async goto(): Promise<void> {
    await this.page.goto(TaxonomyTypesPage.path);
  }

  /** The row of one type, by its name. */
  typeRow(typeName: string): Locator {
    return this.typeRows.filter({
      has: this.page.getByRole('cell', { name: typeName, exact: true }),
    });
  }

  /** Type names in display order (the second cell of each row). */
  async typeNames(): Promise<string[]> {
    return this.typeRows.evaluateAll((rows) =>
      rows.map((row) => (row as HTMLTableRowElement).cells[1]?.textContent?.trim() ?? ''),
    );
  }

  manageLink(typeName: string): Locator {
    return this.typeRow(typeName).getByRole('link', { name: exactText('Manage / View List') });
  }

  orderLink(typeName: string): Locator {
    return this.typeRow(typeName).getByRole('link', { name: exactText('Order / Sort') });
  }

  /** Opens a type's term list with its "Manage / View List" link. */
  async openTypeList(typeName: string): Promise<void> {
    await this.clickAndWaitForPageLoad(this.manageLink(typeName));
  }
}
