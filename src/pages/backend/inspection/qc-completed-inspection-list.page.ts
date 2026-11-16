import type { Page } from '@playwright/test';
import { InspectionStatusListPage } from '@pages/backend/inspection/inspection-status-list.page';

/** Mazad V3 Backend > Inspections > QC Completed (/backend/inspection/qc-completed-inspection/index). */
export class QcCompletedInspectionListPage extends InspectionStatusListPage {
  static readonly path = '/backend/inspection/qc-completed-inspection/index';

  constructor(page: Page) {
    super(page, QcCompletedInspectionListPage.path, 'default-id');
  }
}
