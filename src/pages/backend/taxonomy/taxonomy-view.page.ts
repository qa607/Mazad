import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { exactText } from '@utils/text';

/** A term's details page (/backend/taxonomy/taxonomy/view?id=N): read-only values and actions. */
export class TaxonomyViewPage extends BackendPage {
  static readonly path = '/backend/taxonomy/taxonomy/view';

  /** The term's Title En, or the error title when the term cannot be shown. */
  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly breadcrumbRoot: Locator;
  readonly details: Locator;
  readonly idValue: Locator;
  readonly titleValue: Locator;
  readonly titleEnValue: Locator;
  readonly activeValue: Locator;
  /** Editable fields in the page content (none on a read-only page). */
  readonly editableFields: Locator;
  readonly backLink: Locator;
  readonly updateLink: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    const breadcrumb = page.locator('.breadcrumb');
    this.breadcrumbCurrent = breadcrumb.locator('.breadcrumb-item.active');
    this.breadcrumbRoot = breadcrumb.getByRole('link', { name: 'Taxonomies', exact: true });
    this.details = page.locator('table.detail-view');
    this.idValue = this.value('ID');
    this.titleValue = this.value('Title');
    this.titleEnValue = this.value('Title En');
    this.activeValue = this.value('Active');

    const content = page.locator('.app-main__inner');
    this.editableFields = content.locator('input:not([type="hidden"]), textarea, select');
    // The page's hidden upload dialogs also contain links, so the actions are matched as buttons
    // by their exact text.
    const action = (name: string) => content.locator('a.btn', { hasText: exactText(name) });
    this.backLink = action('Back');
    this.updateLink = action('Update');
    this.deleteButton = action('Delete');
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`${TaxonomyViewPage.path}?id=${id}`);
  }

  /** The value cell of one details row, by its label. */
  value(label: string): Locator {
    return this.details
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: exactText(label) }) })
      .locator('td');
  }

  async goBack(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.backLink);
  }

  /**
   * Clicks Delete, which asks with the browser's confirm() dialog, and accepts or dismisses it.
   * Accepting waits for the page the delete loads. Returns the dialog's message.
   */
  async deleteWithBrowserConfirm(accept: boolean): Promise<string> {
    let message = '';
    this.page.once('dialog', (dialog) => {
      message = dialog.message();
      void (accept ? dialog.accept() : dialog.dismiss());
    });
    if (accept) await this.clickAndWaitForPageLoad(this.deleteButton);
    else await this.deleteButton.click();
    return message;
  }
}
