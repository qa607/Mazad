import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { selectOption, selectedOption } from '@utils/widgets';
import type { OperationData } from '@test-data/operation.data';

type TextField =
  'name' | 'nameEn' | 'phone' | 'email' | 'ccManager' | 'newPassword' | 'passwordConfirm';
type Field = TextField | 'role' | 'status';

const fieldIds: Record<Field, string> = {
  name: 'admin-name',
  nameEn: 'admin-name_en',
  role: 'admin-operation_role',
  status: 'admin-status',
  phone: 'admin-phone',
  email: 'admin-email',
  ccManager: 'admin-cc_manager',
  newPassword: 'admin-new_password',
  passwordConfirm: 'admin-passwordconfirm',
};

/**
 * Operation create and update form (/backend/users/operation/create and /update?id=), plus the
 * operation's read-only View page.
 */
export class OperationFormPage extends BackendPage {
  readonly pageHeading: Locator;
  /** Main content area, below the header and sidebar. */
  readonly content: Locator;
  readonly saveButton: Locator;
  readonly fieldLabels: Locator;
  readonly fieldErrors: Locator;
  readonly roleField: Locator;
  readonly roleOptions: Locator;
  readonly statusField: Locator;
  /** Read-only fields of the View page, and their labels. */
  readonly viewValues: Locator;
  readonly viewLabels: Locator;
  readonly viewUpdateButton: Locator;
  /** Any Delete control on the View page; there is none. */
  readonly viewDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.content = page.locator('.app-main__inner');
    this.saveButton = this.content.locator('form button[type="submit"]');
    this.fieldLabels = this.content.locator('form label');
    this.fieldErrors = this.content.locator('.invalid-feedback');
    this.roleField = page.locator('.field-admin-operation_role');
    this.roleOptions = page.locator('#admin-operation_role option');
    this.statusField = page.locator('.field-admin-status');
    this.viewValues = this.content.locator('.form-row .form-control[disabled]');
    this.viewLabels = this.content.locator('.form-row label');
    this.viewUpdateButton = this.content.locator('a.btn', { hasText: /^\s*Update\s*$/i });
    this.viewDeleteButton = this.content.locator('a', { hasText: /delete/i });
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto('/backend/users/operation/create');
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`/backend/users/operation/update?id=${id}`);
  }

  async gotoView(id: string): Promise<void> {
    await this.page.goto(`/backend/users/operation/view?id=${id}`);
  }

  input(field: Field): Locator {
    return this.page.locator(`#${fieldIds[field]}`);
  }

  fieldError(field: Field): Locator {
    return this.page.locator(`.field-${fieldIds[field]} .invalid-feedback`);
  }

  selectedRole(): Locator {
    return selectedOption(this.roleField);
  }

  selectedStatus(): Locator {
    return selectedOption(this.statusField);
  }

  /**
   * Picks an Operation Role; an empty string clears it. Clearing uses Select2's jQuery API, as
   * the dropdown's clear button only shows on hover.
   */
  async selectRole(role: string): Promise<void> {
    if (role) {
      await selectOption(this.page, this.roleField, role);
      return;
    }
    await this.input('role').evaluate((select) => {
      type JQuery = (element: Element) => { val: (v: string) => { trigger: (e: string) => void } };
      (window as unknown as { jQuery: JQuery }).jQuery(select).val('').trigger('change');
    });
  }

  async selectStatus(status: string): Promise<void> {
    await selectOption(this.page, this.statusField, status);
  }

  /** Fills the given fields; the password goes into both password inputs. */
  async fill(data: Partial<OperationData>): Promise<void> {
    if (data.name !== undefined) await this.input('name').fill(data.name);
    if (data.nameEn !== undefined) await this.input('nameEn').fill(data.nameEn);
    if (data.role !== undefined) await this.selectRole(data.role);
    if (data.status) await this.selectStatus(data.status);
    if (data.phone !== undefined) await this.input('phone').fill(data.phone);
    if (data.email !== undefined) await this.input('email').fill(data.email);
    if (data.ccManager !== undefined) await this.input('ccManager').fill(data.ccManager);
    if (data.password !== undefined) {
      await this.input('newPassword').fill(data.password);
      await this.input('passwordConfirm').fill(data.password);
    }
  }

  /** Types into a field key by key, as a user would, so length limits apply. */
  async typeInto(field: TextField, text: string): Promise<void> {
    await this.input(field).pressSequentially(text, { delay: 0 });
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
    const values = await this.viewValues.evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value.trim()),
    );
    return Object.fromEntries(labels.map((label, i) => [label, values[i]]));
  }
}
