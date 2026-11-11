import type { Page } from '@playwright/test';
import { CustomerListPage } from '@pages/backend/customers/customer-list.page';

/** Mazad back-office Individual customers list (/backend/users/individual/index). */
export class IndividualListPage extends CustomerListPage {
  static readonly path = '/backend/users/individual/index';

  constructor(page: Page) {
    super(page, IndividualListPage.path, 'IndividualSearch', 'individual');
  }
}
