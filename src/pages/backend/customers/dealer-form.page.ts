import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { selectOption } from '@utils/widgets';
import type { CustomerData } from '@test-data/deleted-user.data';

/** Dealer create form (/backend/users/dealer/create), with only the fields the tests fill. */
export class DealerFormPage extends BackendPage {
  readonly saveButton: Locator;
  readonly statusField: Locator;

  constructor(page: Page) {
    super(page);
    this.saveButton = page.locator('.app-main__inner form button[type="submit"]');
    this.statusField = page.locator('.field-admin-status');
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto('/backend/users/dealer/create');
  }

  /**
   * Fills the required fields (and email) of a new active dealer. National ID sits in a
   * collapsed section, so it is set directly; City is a Select2 set by value.
   */
  async fill(customer: CustomerData, cityId: string): Promise<void> {
    await this.page.locator('#admin-name').fill(customer.name);
    await this.page.locator('#admin-name_en').fill(customer.nameEn);
    await selectOption(this.page, this.statusField, 'active');
    await this.page.locator('#admin-phone').fill(customer.phone);
    await this.page.locator('#admin-email').fill(customer.email);
    await this.page.locator('#admin-new_password').fill(customer.password);
    await this.page.locator('#admin-passwordconfirm').fill(customer.password);
    await this.page
      .locator('#dealerprofile-national_id')
      .evaluate((input, value) => ((input as HTMLInputElement).value = value), customer.nationalId);
    await this.page.locator('#dealerprofile-city_id').evaluate((select, id) => {
      type JQuery = (element: Element) => { val: (v: string) => { trigger: (e: string) => void } };
      (window as unknown as { jQuery: JQuery }).jQuery(select).val(id).trigger('change');
    }, cityId);
  }

  /** Clicks Save and waits for the page it loads (the Dealers list on success). */
  async save(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.saveButton);
  }
}
