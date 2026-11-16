import type { Page } from '@playwright/test';
import { InspectionStatusListPage } from '@pages/backend/inspection/inspection-status-list.page';

/** Mazad V3 Backend > Inspections > Ongoing (/backend/inspection/ongoing-inspection/index). */
export class OngoingInspectionListPage extends InspectionStatusListPage {
  static readonly path = '/backend/inspection/ongoing-inspection/index';

  constructor(page: Page) {
    super(page, OngoingInspectionListPage.path, 'default-id');
  }
}
