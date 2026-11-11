import type { Page } from '@playwright/test';
import { ReadOnlyUserViewPage } from '@pages/backend/base/read-only-user-view.page';

/** A QC account's read-only View page (/backend/users/qc/view?id=). */
export class QcViewPage extends ReadOnlyUserViewPage {
  constructor(page: Page) {
    super(page, 'qc');
  }
}
