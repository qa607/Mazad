import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import type { TaxonomyTermData } from '@test-data/taxonomy.data';

/**
 * Create a term (/backend/taxonomy/taxonomy/create?type=<key>) and Update a term
 * (/backend/taxonomy/taxonomy/update?id=N). The form is validated in the browser first; a valid
 * save returns to the type's term list.
 */
export class TaxonomyFormPage extends BackendPage {
  static readonly createPath = '/backend/taxonomy/taxonomy/create';
  static readonly updatePath = '/backend/taxonomy/taxonomy/update';

  readonly pageHeading: Locator;
  readonly titleInput: Locator;
  readonly titleEnInput: Locator;
  /** Inline validation message under each field (empty when the field is valid). */
  readonly titleError: Locator;
  readonly titleEnError: Locator;
  readonly saveButton: Locator;
  readonly cancelLink: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.titleInput = page.getByLabel('Title', { exact: true });
    this.titleEnInput = page.getByLabel('Title En', { exact: true });
    this.titleError = page.locator('.field-taxonomy-title .invalid-feedback');
    this.titleEnError = page.locator('.field-taxonomy-title_en .invalid-feedback');
    this.saveButton = page.getByRole('button', { name: 'Save & Publish', exact: true });
    this.cancelLink = page.locator('form').getByRole('link', { name: 'Cancel', exact: true });
  }

  async gotoCreate(type: string): Promise<void> {
    await this.page.goto(`${TaxonomyFormPage.createPath}?type=${encodeURIComponent(type)}`);
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`${TaxonomyFormPage.updatePath}?id=${id}`);
  }

  /** Fills the fields that are given. */
  async fillForm(data: Partial<TaxonomyTermData>): Promise<void> {
    if (data.title !== undefined) await this.titleInput.fill(data.title);
    if (data.titleEn !== undefined) await this.titleEnInput.fill(data.titleEn);
  }

  /** Clicks Save & Publish. Invalid input stays on the form; valid input loads the list. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** Clicks Save & Publish on a valid form and waits for the term list to load. */
  async saveAndWaitForPageLoad(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.saveButton);
  }

  async cancel(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.cancelLink);
  }

  /**
   * Creates a term through the form. For tests that need an existing term; tests of the create
   * flow itself use fillForm() and save(). The new term's id is read from the list afterwards.
   */
  async createTerm(type: string, data: TaxonomyTermData): Promise<void> {
    await this.gotoCreate(type);
    await this.fillForm(data);
    await this.saveAndWaitForPageLoad();
  }

  /**
   * Starts counting form submissions that reach the server (POSTs to the create or update
   * URL). Returns a function giving the count so far, so tests can tell browser validation
   * (nothing sent) from a server response.
   */
  countSubmissions(): () => number {
    let submissions = 0;
    this.page.on('request', (request) => {
      const url = request.url();
      if (
        request.method() === 'POST' &&
        (url.includes(TaxonomyFormPage.createPath) || url.includes(TaxonomyFormPage.updatePath))
      ) {
        submissions += 1;
      }
    });
    return () => submissions;
  }
}
