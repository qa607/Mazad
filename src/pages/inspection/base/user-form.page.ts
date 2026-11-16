import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';
import type { UserFormData } from '@test-data/inspection/user-form.data';

/**
 * Shared Create/Update form behind both QC Users (/operation) and Inspectors (/inspector):
 * confirmed live 2026-11-11 to be the exact same Yii2 model (`UserCreateForm`) and field ids,
 * with Create requiring every field below and Update prefilling everything except Pin/Confirm
 * Password, which stay blank and are optional (submitting without them keeps the existing PIN
 * unchanged — confirmed by a real PIN change through Inspector Update, Milestone 4).
 */
export abstract class UserFormPage extends InspectionPage {
  readonly pageHeading: Locator;
  readonly statusSelect: Locator;
  readonly mobileNumberInput: Locator;
  readonly fullNameEnInput: Locator;
  readonly fullNameArInput: Locator;
  readonly pinInput: Locator;
  readonly confirmPinInput: Locator;
  readonly saveButton: Locator;
  /** Inline validation message under a field (empty when the field is valid). */
  readonly statusError: Locator;
  readonly mobileNumberError: Locator;
  readonly fullNameEnError: Locator;
  readonly pinError: Locator;
  readonly confirmPinError: Locator;

  protected constructor(
    page: Page,
    private readonly createPath: string,
    private readonly updatePath: string,
  ) {
    super(page);
    // This app's own AdminLTE markup, not the main Backend's `.app-page-title` variant.
    this.pageHeading = page.locator('.content-header h1');
    this.statusSelect = page.locator('#usercreateform-status');
    this.mobileNumberInput = page.locator('#usercreateform-mobile_number');
    this.fullNameEnInput = page.locator('#full_name_en');
    this.fullNameArInput = page.locator('#full_name_ar');
    this.pinInput = page.locator('#pin');
    this.confirmPinInput = page.locator('#confirm_pin');
    this.saveButton = page.locator('form#w0 button[type="submit"]');
    this.statusError = page.locator('.field-usercreateform-status .help-block');
    this.mobileNumberError = page.locator('.field-usercreateform-mobile_number .help-block');
    this.fullNameEnError = page.locator('.field-full_name_en .help-block');
    this.pinError = page.locator('.field-pin .help-block');
    this.confirmPinError = page.locator('.field-confirm_pin .help-block');
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  async gotoCreate(): Promise<void> {
    await this.page.goto(this.createPath, { waitUntil: 'domcontentloaded' });
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`${this.updatePath}?id=${id}`, { waitUntil: 'domcontentloaded' });
  }

  /** Fills the fields that are given. */
  async fillForm(data: Partial<UserFormData>): Promise<void> {
    if (data.status !== undefined) await this.statusSelect.selectOption({ label: data.status });
    if (data.mobileNumber !== undefined) await this.mobileNumberInput.fill(data.mobileNumber);
    if (data.fullNameEn !== undefined) await this.fullNameEnInput.fill(data.fullNameEn);
    if (data.fullNameAr !== undefined) await this.fullNameArInput.fill(data.fullNameAr);
    if (data.pin !== undefined) await this.pinInput.fill(data.pin);
    if (data.confirmPin !== undefined) await this.confirmPinInput.fill(data.confirmPin);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /**
   * Clicks Save on a valid Create form and waits for the success flash (Create redirects to
   * <updatePath>?id=N on success, confirmed live). Waits on the alert locator rather than a
   * 'load' event or a specific response, since this app's own pages can leave 'load' never
   * firing, and the redirect means the matching response is a GET, not the POST that was sent.
   * Returns the new id.
   */
  async saveAndWaitForCreatedPage(): Promise<string> {
    await this.save();
    await this.successAlert.waitFor({ state: 'visible' });
    const id = this.idFromUrl();
    if (!id) throw new Error('No id in the URL after creating a record.');
    return id;
  }

  /** Clicks Save on a valid Update form and waits for the success flash (same id, confirmed live). */
  async saveAndWaitForUpdatePage(): Promise<void> {
    await this.save();
    await this.successAlert.waitFor({ state: 'visible' });
  }

  /** The record id this form is currently editing, read from the URL after a successful save. */
  idFromUrl(): string | null {
    return new URL(this.page.url()).searchParams.get('id');
  }

  /**
   * Starts counting POSTs to the create or update path that reach the server — confirmed live to
   * be the ActiveForm AJAX validation request (JSON) on a wholly empty submit, and that request
   * followed by a second, real POST once the form is valid. Either way, any count above zero
   * proves the browser never blocked the submission on its own (there is no `required` HTML
   * attribute on any field here; every validation message comes from the server).
   */
  countSubmissions(): () => number {
    let submissions = 0;
    this.page.on('request', (request) => {
      const url = request.url();
      const isFormPath = url.includes(this.createPath) || url.includes(this.updatePath);
      if (request.method() === 'POST' && isFormPath) submissions += 1;
    });
    return () => submissions;
  }
}
