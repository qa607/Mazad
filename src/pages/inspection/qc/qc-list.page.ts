import type { Page } from '@playwright/test';
import { InspectionListPage } from '@pages/inspection/base/inspection-list.page';

/** QC Users list (/operation/index). See InspectionListPage. */
export class QcListPage extends InspectionListPage {
  static readonly path = '/operation/index';

  constructor(page: Page) {
    super(page, QcListPage.path);
  }
}
