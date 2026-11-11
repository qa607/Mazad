import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import type { TrafficOfficeData } from '@test-data/traffic-office.data';

/**
 * Create a traffic office (/backend/trafficOffice/traffic-office/create) and Update one
 * (/backend/trafficOffice/traffic-office/update?id=N). The form is validated in the browser
 * first; a valid save opens the office's View page. Update also shows a Status dropdown.
 */
export class TrafficOfficeFormPage extends BackendPage {
  static readonly createPath = '/backend/trafficOffice/traffic-office/create';
  static readonly updatePath = '/backend/trafficOffice/traffic-office/update';
  static readonly listPath = '/backend/trafficOffice/traffic-office/index';

  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly form: Locator;
  readonly officeNameInput: Locator;
  readonly officeNameEnInput: Locator;
  /** Inline validation message under each field (empty while the field is valid). */
  readonly officeNameError: Locator;
  readonly officeNameEnError: Locator;
  /** Update only: the selected status, read from its title attribute (select2). */
  readonly statusValue: Locator;
  readonly saveButton: Locator;
  readonly cancelLink: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    // The page also holds an Import form under the same path, so the form is found by its field.
    this.form = page.locator('form', { has: page.locator('#trafficoffice-office_name') });
    this.officeNameInput = this.form.locator('#trafficoffice-office_name');
    this.officeNameEnInput = this.form.locator('#trafficoffice-office_name_en');
    this.officeNameError = this.form.locator('.field-trafficoffice-office_name .invalid-feedback');
    this.officeNameEnError = this.form.locator(
      '.field-trafficoffice-office_name_en .invalid-feedback',
    );
    this.statusValue = this.form.locator('#select2-trafficoffice-status-container');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelLink = this.form.locator(`a[href="${TrafficOfficeFormPage.listPath}"]`);
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto(TrafficOfficeFormPage.createPath);
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`${TrafficOfficeFormPage.updatePath}?id=${id}`);
  }

  /** Fills the fields that are given. */
  async fillForm(data: Partial<TrafficOfficeData>): Promise<void> {
    if (data.officeName !== undefined) await this.officeNameInput.fill(data.officeName);
    if (data.officeNameEn !== undefined) await this.officeNameEnInput.fill(data.officeNameEn);
  }

  /** Clicks Save. Invalid input stays on the form; valid input opens the View page. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** Clicks Save on a valid form and waits for the office's View page to load. */
  async saveAndWaitForPageLoad(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.saveButton);
  }

  async cancel(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.cancelLink);
  }

  /**
   * Creates an office through the form and returns its ID, read from the View page it opens.
   * For tests that need an existing office; tests of the create flow use fillForm() and save().
   */
  async createOffice(data: TrafficOfficeData): Promise<string> {
    await this.gotoCreate();
    await this.fillForm(data);
    await this.saveAndWaitForPageLoad();
    const id = /\/traffic-office\/view\?id=(\d+)$/.exec(this.page.url())?.[1];
    if (!id) throw new Error(`Creating "${data.officeNameEn}" did not open its View page.`);
    return id;
  }

  /** Counts form submissions sent to the server (POSTs to create or update). */
  countSubmissions(): () => number {
    const creates = this.countPostRequests(TrafficOfficeFormPage.createPath);
    const updates = this.countPostRequests(TrafficOfficeFormPage.updatePath);
    return () => creates() + updates();
  }
}
