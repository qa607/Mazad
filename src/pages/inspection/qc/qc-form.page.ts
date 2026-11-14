import type { Page } from '@playwright/test';
import { UserFormPage } from '@pages/inspection/base/user-form.page';

/** Create a QC user (/operation/create) and Update one (/operation/update?id=N). See UserFormPage. */
export class QcFormPage extends UserFormPage {
  static readonly createPath = '/operation/create';
  static readonly updatePath = '/operation/update';

  constructor(page: Page) {
    super(page, QcFormPage.createPath, QcFormPage.updatePath);
  }
}
