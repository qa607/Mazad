import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { selectOption, selectedOption, setSwitch } from '@utils/widgets';
import type { SupplierData } from '@test-data/supplier.data';

/** Yes/No switches of the Supplier Config section, by checkbox id. */
export const supplierSwitches = {
  purchasingRequest: 'supplier-purchasing_request',
  insurance: 'supplier-insurance',
  addUser: 'supplier-add_user',
  declarationReceipt: 'supplier-declaration_receipt',
  insuranceSupplier: 'admin-is_muzaida',
  canEditReservedPrice: 'supplier-can_edit_reserved_price',
  requestMojaz: 'supplier-enable_mojaz_request',
  postponeInvoice: 'supplier-postpone_invoice',
} as const;

export type SupplierSwitch = keyof typeof supplierSwitches;

/** Ids of the Basic Information fields, for reading their inline validation messages. */
export const supplierFieldIds = {
  name: 'admin-name',
  nameEn: 'admin-name_en',
  status: 'admin-status',
  phone: 'admin-phone',
  email: 'admin-email',
  newPassword: 'admin-new_password',
  passwordConfirm: 'admin-passwordconfirm',
  crNumber: 'supplier-cr_number',
  taxId: 'supplier-tax_id',
  supplierName: 'supplier-supplier_name',
  supplierNameEn: 'supplier-supplier_name_en',
} as const;

export type SupplierField = keyof typeof supplierFieldIds;

/**
 * Create Supplier (/backend/users/supplier/create) and Update Supplier
 * (/backend/users/supplier/update?id=N). Both use the same Basic Information form, which is
 * validated field by field on the server (AJAX) and saved without a page load.
 */
export class SupplierFormPage extends BackendPage {
  static readonly createPath = '/backend/users/supplier/create';

  readonly pageHeading: Locator;
  readonly basicForm: Locator;
  readonly statusField: Locator;
  readonly saveButton: Locator;
  /** Page-wide overlay shown while a save is in progress. */
  readonly loadingOverlay: Locator;
  /** SweetAlert popup that reports the save result. */
  readonly resultPopup: Locator;
  readonly resultPopupConfirm: Locator;
  readonly resultPopupSuccessIcon: Locator;
  readonly tabs: Locator;
  readonly breadcrumbList: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.basicForm = page.locator('#form-supplier-basic');
    this.statusField = page.locator('.field-admin-status');
    this.saveButton = this.basicForm.locator('button[type="submit"]');
    this.loadingOverlay = page.locator('#blocker');
    this.resultPopup = page.locator('.swal2-popup');
    this.resultPopupConfirm = this.resultPopup.locator('.swal2-confirm');
    this.resultPopupSuccessIcon = this.resultPopup.locator('.swal2-success');
    this.tabs = page.locator('.nav-tabs .nav-link');
    this.breadcrumbList = page.locator('.breadcrumb a[href="/backend/users/supplier/index"]');
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto(SupplierFormPage.createPath);
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`/backend/users/supplier/update?id=${id}`);
  }

  input(field: SupplierField): Locator {
    return this.page.locator(`#${supplierFieldIds[field]}`);
  }

  /** Inline validation message under a field (empty when the field is valid). */
  error(field: SupplierField): Locator {
    return this.page.locator(`.field-${supplierFieldIds[field]} .invalid-feedback`);
  }

  switchInput(name: SupplierSwitch): Locator {
    return this.page.locator(`#${supplierSwitches[name]}`);
  }

  tab(name: string): Locator {
    return this.tabs.filter({ hasText: name });
  }

  selectedStatus(): Locator {
    return selectedOption(this.statusField);
  }

  /** Types a value and leaves the field, which triggers its server-side validation. */
  async enter(field: SupplierField, value: string): Promise<void> {
    await this.input(field).fill(value);
    await this.input(field).blur();
  }

  async selectStatus(status: string): Promise<void> {
    await selectOption(this.page, this.statusField, status);
  }

  async setSwitch(name: SupplierSwitch, on: boolean): Promise<void> {
    await setSwitch(this.page, supplierSwitches[name], on);
  }

  /** Fills the Basic Information fields. Password fields are filled only when given. */
  async fillForm(data: Partial<SupplierData>): Promise<void> {
    if (data.name !== undefined) await this.input('name').fill(data.name);
    if (data.nameEn !== undefined) await this.input('nameEn').fill(data.nameEn);
    if (data.status !== undefined) await this.selectStatus(data.status);
    if (data.phone !== undefined) await this.input('phone').fill(data.phone);
    if (data.email !== undefined) await this.input('email').fill(data.email);
    if (data.password !== undefined) {
      await this.input('newPassword').fill(data.password);
      await this.input('passwordConfirm').fill(data.password);
    }
    if (data.crNumber !== undefined) await this.input('crNumber').fill(data.crNumber);
    if (data.taxId !== undefined) await this.input('taxId').fill(data.taxId);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** Closes the result popup with OK. After a successful create this opens the Update page. */
  async confirmResult(): Promise<void> {
    await this.resultPopupConfirm.click();
  }

  /** Supplier id from the current Update page URL, or null on the Create page. */
  currentSupplierId(): string | null {
    return /[?&]id=(\d+)/.exec(this.page.url())?.[1] ?? null;
  }
}
