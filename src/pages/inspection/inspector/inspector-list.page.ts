import type { Page } from '@playwright/test';
import { InspectionListPage } from '@pages/inspection/base/inspection-list.page';

/** Inspectors list (/inspector/index). See InspectionListPage. */
export class InspectorListPage extends InspectionListPage {
  static readonly path = '/inspector/index';

  constructor(page: Page) {
    super(page, InspectorListPage.path);
  }
}
