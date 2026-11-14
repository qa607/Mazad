import type { Page } from '@playwright/test';
import { UserViewPage } from '@pages/inspection/base/user-view.page';

/** View a QC user's details (/operation/view?id=N). See UserViewPage. */
export class QcViewPage extends UserViewPage {
  static readonly path = '/operation/view';

  constructor(page: Page) {
    super(page, QcViewPage.path);
  }
}
