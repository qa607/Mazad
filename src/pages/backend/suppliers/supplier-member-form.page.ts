import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { selectOption, selectedOption } from '@utils/widgets';
import type { SupplierMemberData } from '@test-data/supplier-member.data';

type TextField = 'name' | 'nameEn' | 'phone' | 'email' | 'newPassword' | 'passwordConfirm';
type Field = TextField | 'parent' | 'status';

const fieldIds: Record<Field, string> = {
  parent: 'suppliermember-parent_id',
  name: 'suppliermember-name',
  nameEn: 'suppliermember-name_en',
  status: 'suppliermember-status',
  phone: 'suppliermember-phone',
  email: 'suppliermember-email',
  newPassword: 'suppliermember-new_password',
  passwordConfirm: 'suppliermember-passwordconfirm',
};

/**
 * Supplier member create and update form (/backend/users/supplier-member/create and
 * /update?id=), plus the member's View and permissions pages.
 */
export class SupplierMemberFormPage extends BackendPage {
  readonly pageHeading: Locator;
  /** Main content area, below the header and sidebar. */
  readonly content: Locator;
  readonly saveButton: Locator;
  readonly fieldErrors: Locator;
  readonly parentField: Locator;
  readonly statusField: Locator;
  /** Read-only fields of the View page. */
  readonly viewValues: Locator;
  readonly permissionCheckboxes: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.content = page.locator('.app-main__inner');
    this.saveButton = this.content.locator('form button[type="submit"]');
    this.fieldErrors = this.content.locator('.invalid-feedback');
    this.parentField = page.locator('.field-suppliermember-parent_id');
    this.statusField = page.locator('.field-suppliermember-status');
    this.viewValues = this.content.locator('input.form-control[disabled]');
    this.permissionCheckboxes = this.content.locator('input[type="checkbox"]');
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto('/backend/users/supplier-member/create');
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier-member/update?id=${id}`);
  }

  async gotoView(id: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier-member/view?id=${id}`);
  }

  async gotoPermissions(id: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier-member/update-permission?id=${id}`);
  }

  input(field: TextField | 'parent'): Locator {
    return this.page.locator(`#${fieldIds[field]}`);
  }

  fieldError(field: Field): Locator {
    return this.page.locator(`.field-${fieldIds[field]} .invalid-feedback`);
  }

  selectedStatus(): Locator {
    return selectedOption(this.statusField);
  }

  /**
   * Picks the parent supplier by ID. The dropdown labels are not unique on staging (several
   * suppliers are named "شركة تجريبية-"), so the option is set by value through Select2's
   * jQuery API instead of by clicking a label.
   */
  async selectParent(supplierId: string): Promise<void> {
    if ((await this.input('parent').locator(`option[value="${supplierId}"]`).count()) === 0) {
      throw new Error(`Supplier ${supplierId} is not offered in the Supplier Name dropdown.`);
    }
    await this.input('parent').evaluate((select, id) => {
      type JQuery = (element: Element) => { val: (v: string) => { trigger: (e: string) => void } };
      (window as unknown as { jQuery: JQuery }).jQuery(select).val(id).trigger('change');
    }, supplierId);
  }

  async selectStatus(status: string): Promise<void> {
    await selectOption(this.page, this.statusField, status);
  }

  /** Fills the given fields; the password goes into both password inputs. */
  async fill(data: Partial<SupplierMemberData>): Promise<void> {
    if (data.parentId) await this.selectParent(data.parentId);
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

  /** Values of the View page's read-only fields, in page order. */
  async viewTexts(): Promise<string[]> {
    return this.viewValues.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value.trim()),
    );
  }

  async permissionStates(): Promise<boolean[]> {
    return this.permissionCheckboxes.evaluateAll((boxes) =>
      boxes.map((box) => (box as HTMLInputElement).checked),
    );
  }

  /** Ticks or unticks one permission; the page saves it at once. Returns the save's HTTP status. */
  async togglePermission(index: number): Promise<number> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.request().method() === 'POST'),
      this.permissionCheckboxes.nth(index).click(),
    ]);
    return response.status();
  }
}
