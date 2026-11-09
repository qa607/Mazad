import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

/** Mazad back-office Permissions list (/backend/access/permission/index). */
export class PermissionListPage extends BackendPage {
  static readonly path = '/backend/access/permission/index';

  readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.locator('table tbody tr[data-key]');
  }

  /** Opens the list filtered by permission name (matches part of the name). */
  async gotoFiltered(name: string): Promise<void> {
    await this.page.goto(
      `${PermissionListPage.path}?AuthItemSearch%5Bname%5D=${encodeURIComponent(name)}`,
    );
  }

  /** The row of one permission, by its route, e.g. "/users/supplier/delete". */
  row(route: string): Locator {
    return this.rows.and(this.page.locator(`[data-key="${route}"]`));
  }
}
