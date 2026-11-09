import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import type { CustomerGroupData } from '@test-data/customer-group.data';

/**
 * Create Customer Group (/backend/customerGroup/customer-group/create) and Update
 * (/backend/customerGroup/customer-group/update?id=N): step 1 "Basic Info" of the group wizard.
 * The form is validated in the browser first; a valid save loads step 2, the member list.
 */
export class CustomerGroupFormPage extends BackendPage {
  static readonly createPath = '/backend/customerGroup/customer-group/create';
  static readonly updatePath = '/backend/customerGroup/customer-group/update';

  readonly pageHeading: Locator;
  readonly nameInput: Locator;
  readonly notesInput: Locator;
  /** Inline validation message under each field (empty when the field is valid). */
  readonly nameError: Locator;
  readonly notesError: Locator;
  readonly saveButton: Locator;
  /** Wizard steps: "Basic Info" and "Customer". */
  readonly steps: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.nameInput = page.getByLabel('Name', { exact: true });
    this.notesInput = page.getByLabel('General Notes', { exact: true });
    this.nameError = page.locator('.field-customergroup-name .invalid-feedback');
    this.notesError = page.locator('.field-customergroup-general_notes .invalid-feedback');
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.steps = page.locator('.forms-wizard .nav-item');
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto(CustomerGroupFormPage.createPath);
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`${CustomerGroupFormPage.updatePath}?id=${id}`);
  }

  step(name: string): Locator {
    return this.steps.filter({ hasText: name });
  }

  /** Fills the fields that are given. */
  async fillForm(data: Partial<CustomerGroupData>): Promise<void> {
    if (data.name !== undefined) await this.nameInput.fill(data.name);
    if (data.notes !== undefined) await this.notesInput.fill(data.notes);
  }

  /** Clicks Save. Invalid input stays on the form; valid input loads the member list. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** Clicks Save on a valid form and waits for the next page (the member list) to load. */
  async saveAndWaitForPageLoad(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.saveButton);
  }

  /**
   * Creates a group through the form and returns its id. For tests that need an existing group;
   * tests of the create flow itself use fillForm() and save().
   */
  async createGroup(data: CustomerGroupData): Promise<string> {
    await this.gotoCreate();
    await this.fillForm(data);
    await this.saveAndWaitForPageLoad();
    const id = /[?&]group_id=(\d+)/.exec(this.page.url())?.[1];
    if (!id) throw new Error(`Creating group "${data.name}" did not open its member list.`);
    return id;
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
        (url.includes(CustomerGroupFormPage.createPath) ||
          url.includes(CustomerGroupFormPage.updatePath))
      ) {
        submissions += 1;
      }
    });
    return () => submissions;
  }

  /** Group id from the current page URL (update page or member list), or null. */
  currentGroupId(): string | null {
    return /[?&](?:group_)?id=(\d+)/.exec(this.page.url())?.[1] ?? null;
  }
}
