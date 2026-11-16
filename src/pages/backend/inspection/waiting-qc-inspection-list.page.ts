import type { Page } from '@playwright/test';
import { InspectionStatusListPage } from '@pages/backend/inspection/inspection-status-list.page';

/** Mazad V3 Backend > Inspections > Waiting for QC (/backend/inspection/waiting-qc-inspection/index). */
export class WaitingQcInspectionListPage extends InspectionStatusListPage {
  static readonly path = '/backend/inspection/waiting-qc-inspection/index';

  constructor(page: Page) {
    super(page, WaitingQcInspectionListPage.path, 'default-id');
  }
}
