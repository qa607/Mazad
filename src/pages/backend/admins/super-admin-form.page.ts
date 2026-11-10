import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { selectOption, selectedOption } from '@utils/widgets';
import type { SuperAdminData } from '@test-data/super-admin.data';

type TextField = 'name' | 'nameEn' | 'phone' | 'email' | 'newPassword' | 'passwordConfirm';
type Field = TextField | 'status';

const fieldIds: Record<Field, string> = {
  name: 'admin-name',
  nameEn: 'admin-name_en',
  status: 'admin-status',
  phone: 'admin-phone',
  email: 'admin-email',
  newPassword: 'admin-new_password',
  passwordConfirm: 'admin-passwordconfirm',
};

/**
 * Super Admin create and update form (/backend/users/admin/create and /update?id=), plus the
 * admin's read-only View page.
 */
export class SuperAdminFormPage extends BackendPage {
  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  /** Main content area, below the header and sidebar. */
  readonly content: Locator;
  readonly saveButton: Locator;
  readonly fieldLabels: Locator;
  readonly fieldErrors: Locator;
  readonly statusField: Locator;
  /** Read-only fields of the View page, and their labels. */
  readonly viewValues: Locator;
  readonly viewLabels: Locator;
  readonly viewUpdateButton: Locator;
  readonly viewDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.content = page.locator('.app-main__inner');
    this.saveButton = this.content.locator('form button[type="submit"]');
    this.fieldLabels = this.content.locator('form label');
    this.fieldErrors = this.content.locator('.invalid-feedback');
    this.statusField = page.locator('.field-admin-status');
    this.viewValues = this.content.locator('input.form-control[disabled]');
    this.viewLabels = this.content.locator('.card-body .form-row label');
    this.viewUpdateButton = this.content.locator('.card-header a.btn', { hasText: 'Update' });
    this.viewDeleteButton = this.content.locator('.card-header a.btn', { hasText: 'Delete' });
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto('/backend/users/admin/create');
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`/backend/users/admin/update?id=${id}`);
  }

  async gotoView(id: string): Promise<void> {
    await this.page.goto(`/backend/users/admin/view?id=${id}`);
  }

  input(field: TextField | 'status'): Locator {
    return this.page.locator(`#${fieldIds[field]}`);
  }

  fieldError(field: Field): Locator {
    return this.page.locator(`.field-${fieldIds[field]} .invalid-feedback`);
  }

  selectedStatus(): Locator {
    return selectedOption(this.statusField);
  }

  async selectStatus(status: string): Promise<void> {
    await selectOption(this.page, this.statusField, status);
  }

  /** Fills the given fields; the password goes into both password inputs. */
  async fill(data: Partial<SuperAdminData>): Promise<void> {
    if (data.name !== undefined) await this.input('name').fill(data.name);
    if (data.nameEn !== undefined) await this.input('nameEn').fill(data.nameEn);
    if (data.status) await this.selectStatus(data.status);
    if (data.phone !== undefined) await this.input('phone').fill(data.phone);
    if (data.email !== undefined) await this.input('email').fill(data.email);
    if (data.password !== undefined) {
      await this.input('newPassword').fill(data.password);
      await this.input('passwordConfirm').fill(data.password);
    }
  }

  /** Clicks Save. A valid form loads a new page; an invalid one shows errors in place. */
  async save(): Promise<void> {
    await Promise.all([
      Promise.race([
        this.page.waitForEvent('load'),
        this.fieldErrors.filter({ hasText: /\S/ }).first().waitFor(),
      ]),
      this.saveButton.click(),
    ]);
  }

  async errorTexts(): Promise<string[]> {
    return (await this.fieldErrors.allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  }

  /** The View page's read-only values keyed by their labels. */
  async viewFields(): Promise<Record<string, string>> {
    const labels = (await this.viewLabels.allInnerTexts()).map((label) => label.trim());
    const values = await this.viewValues.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value.trim()),
    );
    return Object.fromEntries(labels.map((label, i) => [label, values[i]]));
  }
}
