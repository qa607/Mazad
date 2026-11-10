import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import type { CompanyData, WarehouseData } from '@test-data/supplier-company.data';

type CompanyField =
  | 'name'
  | 'nameEn'
  | 'supplier'
  | 'email'
  | 'phone'
  | 'crNumber'
  | 'taxNumber'
  | 'workingHours'
  | 'workingHoursEn';
type WarehouseField = 'name' | 'nameEn' | 'locationLink' | 'phone';

const fieldIds: Record<CompanyField, string> = {
  name: 'company-name',
  nameEn: 'company-name_en',
  supplier: 'company-user_id',
  email: 'company-email',
  phone: 'company-phone_number',
  crNumber: 'company-cr_number',
  taxNumber: 'company-tax_number',
  workingHours: 'company-working_hours',
  workingHoursEn: 'company-working_hours_en',
};

const warehouseFieldIds: Record<WarehouseField, string> = {
  name: 'name',
  nameEn: 'name_en',
  locationLink: 'location_link',
  phone: 'phone_number',
};

/**
 * Company create and update form (/backend/company/company/create and /update?id=), plus the
 * company's read-only View page.
 */
export class SupplierCompanyFormPage extends BackendPage {
  readonly pageHeading: Locator;
  /** Flash message after a save or delete. Unlike other pages it has no role="alert". */
  readonly flashMessage: Locator;
  /** Main content area, below the header and sidebar. */
  readonly content: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly addWarehouseButton: Locator;
  readonly fieldErrors: Locator;
  /** Read-only fields of the View page (inputs and text areas), in page order. */
  readonly viewValues: Locator;
  /** Warehouse grid of the View page. */
  readonly viewWarehouses: Locator;
  readonly viewUpdateButton: Locator;
  readonly viewDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.flashMessage = page.locator('.alert-success');
    this.content = page.locator('.app-main__inner');
    this.saveButton = this.content.locator('form button[type="submit"]');
    this.cancelButton = this.content.locator('form a.btn', { hasText: 'Cancel' });
    this.addWarehouseButton = this.content.locator('.add-new-warehouse');
    this.fieldErrors = this.content.locator('.invalid-feedback');
    this.viewValues = this.content.locator('.form-control[disabled]');
    this.viewWarehouses = this.content.locator('.warehouse-index');
    this.viewUpdateButton = this.content.locator('.mb-3 > a.btn', { hasText: 'Update' });
    this.viewDeleteButton = this.content.locator('.mb-3 > a.btn', { hasText: 'Delete' });
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto('/backend/company/company/create');
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`/backend/company/company/update?id=${id}`);
  }

  async gotoView(id: string): Promise<void> {
    await this.page.goto(`/backend/company/company/view?id=${id}`);
  }

  input(field: CompanyField): Locator {
    return this.page.locator(`#${fieldIds[field]}`);
  }

  fieldError(field: CompanyField): Locator {
    return this.page.locator(`.field-${fieldIds[field]} .invalid-feedback`);
  }

  warehouseInput(index: number, field: WarehouseField): Locator {
    return this.page.locator(`#warehouse-${index}-${warehouseFieldIds[field]}`);
  }

  /** Tab of one warehouse; each warehouse's fields show only while its tab is active. */
  warehouseTab(index: number): Locator {
    return this.content.locator(`a.nav-link[href="#company-warehouse-${index}"]`);
  }

  warehouseError(index: number, field: WarehouseField): Locator {
    return this.page.locator(
      `.field-warehouse-${index}-${warehouseFieldIds[field]} .invalid-feedback`,
    );
  }

  /**
   * Picks the supplier by ID. Several suppliers share a label on staging, so the option is set
   * by value through Select2's jQuery API instead of by clicking a label.
   */
  async selectSupplier(supplierId: string): Promise<void> {
    if ((await this.input('supplier').locator(`option[value="${supplierId}"]`).count()) === 0) {
      throw new Error(`Supplier ${supplierId} is not offered in the Supplier dropdown.`);
    }
    await this.input('supplier').evaluate((select, id) => {
      type JQuery = (element: Element) => { val: (v: string) => { trigger: (e: string) => void } };
      (window as unknown as { jQuery: JQuery }).jQuery(select).val(id).trigger('change');
    }, supplierId);
  }

  /**
   * Clicks Add warehouse and waits for the new warehouse tab, which the page loads over AJAX
   * and opens. The link does nothing until the page's scripts have loaded, hence the wait.
   */
  async addWarehouse(): Promise<void> {
    const next = await this.page.locator('[id^="warehouse-"][id$="-name"]').count();
    await this.page.waitForLoadState('networkidle');
    await this.addWarehouseButton.click();
    await this.warehouseInput(next, 'name').waitFor();
  }

  async fillWarehouse(index: number, warehouse: Partial<WarehouseData>): Promise<void> {
    await this.warehouseTab(index).click();
    await this.warehouseInput(index, 'name').waitFor();
    for (const field of Object.keys(warehouseFieldIds) as WarehouseField[]) {
      const value = warehouse[field];
      if (value !== undefined) await this.warehouseInput(index, field).fill(value);
    }
  }

  /** Fills the given fields, adding warehouse field sets as needed. */
  async fill(data: Partial<CompanyData>): Promise<void> {
    if (data.supplierId) await this.selectSupplier(data.supplierId);
    for (const field of Object.keys(fieldIds) as CompanyField[]) {
      if (field === 'supplier') continue;
      const value = data[field];
      if (value !== undefined) await this.input(field).fill(value);
    }
    for (const [index, warehouse] of (data.warehouses ?? []).entries()) {
      if ((await this.warehouseInput(index, 'name').count()) === 0) await this.addWarehouse();
      await this.fillWarehouse(index, warehouse);
    }
  }

  /** Types into a field key by key, as a user would, so input filters and limits apply. */
  async typeInto(field: CompanyField, text: string): Promise<void> {
    await this.input(field).pressSequentially(text, { delay: 0 });
  }

  /**
   * Clicks Save. A valid form loads a new page; an invalid one shows errors in place, possibly
   * on a warehouse tab that is not open, so errors are waited for in the page, not on screen.
   */
  async save(): Promise<void> {
    await Promise.all([
      Promise.race([
        this.page.waitForEvent('load'),
        this.fieldErrors.filter({ hasText: /\S/ }).first().waitFor({ state: 'attached' }),
      ]),
      this.saveButton.click(),
    ]);
  }

  async cancel(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.cancelButton);
  }

  async errorTexts(): Promise<string[]> {
    return (await this.fieldErrors.allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  }

  /** Values of the View page's read-only fields, in page order. */
  async viewTexts(): Promise<string[]> {
    return this.viewValues.evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value.trim()),
    );
  }

  /** Text of the View page's warehouse grid, with whitespace collapsed. */
  async viewWarehouseText(): Promise<string> {
    return (await this.viewWarehouses.innerText()).replace(/\s+/g, ' ').trim();
  }
}
