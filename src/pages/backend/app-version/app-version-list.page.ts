import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  id: 1,
  deviceType: 2,
  appVersion: 3,
  appName: 4,
  forceUpdate: 5,
  status: 6,
} as const;

/** One row of the App Version Controls list, as displayed. */
export interface AppVersionRow {
  id: string;
  deviceType: string;
  appVersion: string;
  appName: string;
  forceUpdate: string;
  status: string;
}

/**
 * Mazad back-office "App Versions" list (/backend/appVersionControl/app-version-control/index,
 * titled "App Version Controls"): one row per app version and device type, newest first. The apps
 * compare their own version with these rows; a newer Active row with Force Update shows the apps'
 * force-update dialog. Each row has View, Update and Delete; Delete asks in the in-page
 * Confirmation dialog.
 */
export class AppVersionListPage extends BackendListPage {
  static readonly path = '/backend/appVersionControl/app-version-control/index';

  readonly createLink: Locator;
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, AppVersionListPage.path, 'default-id');
    this.createLink = page.locator(
      'a[href="/backend/appVersionControl/app-version-control/create"]',
    );
    this.confirmDialog = new ConfirmDialog(page);
  }

  /** Opens the list filtered to one device type and version (search form fields, by URL). */
  async gotoFiltered(deviceType: string, appVersion: string): Promise<void> {
    const params = new URLSearchParams({
      'AppVersionControlSearch[device_type]': deviceType,
      'AppVersionControlSearch[app_version]': appVersion,
    });
    await this.page.goto(`${AppVersionListPage.path}?${params.toString()}`);
  }

  /** The rows shown, as displayed (cell text by column). */
  async readRows(): Promise<AppVersionRow[]> {
    const rows: AppVersionRow[] = [];
    for (const row of await this.rows.all()) {
      const cell = async (seq: number) => (await this.rowCell(row, seq).innerText()).trim();
      rows.push({
        id: await cell(column.id),
        deviceType: await cell(column.deviceType),
        appVersion: await cell(column.appVersion),
        appName: await cell(column.appName),
        forceUpdate: await cell(column.forceUpdate),
        status: await cell(column.status),
      });
    }
    return rows;
  }

  deleteLink(id: string): Locator {
    return this.row(id).locator('a[title="Delete"]');
  }

  /** Deletes one row: its Delete icon, then Ok in the Confirmation dialog. */
  async deleteRow(id: string): Promise<void> {
    await this.deleteLink(id).click();
    await this.confirmDialog.confirmAndWaitForPageLoad();
  }
}
