import type { Page } from '@playwright/test';
import { ReadOnlyUserViewPage } from '@pages/backend/base/read-only-user-view.page';

/** An inspector's read-only View page (/backend/users/inspector/view?id=). */
export class InspectorViewPage extends ReadOnlyUserViewPage {
  constructor(page: Page) {
    super(page, 'inspector');
  }
}
