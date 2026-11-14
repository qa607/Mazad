import type { Locator, Page } from '@playwright/test';
import { UserViewPage } from '@pages/inspection/base/user-view.page';

/** View an Inspector's details (/inspector/view?id=N). See UserViewPage. */
export class InspectorViewPage extends UserViewPage {
  static readonly path = '/inspector/view';

  /** The star-rating caption badge ("Not Rated" until an inspection rates it). */
  readonly ratingValue: Locator;

  constructor(page: Page) {
    super(page, InspectorViewPage.path);
    this.ratingValue = page.locator('.caption-badge');
  }
}
