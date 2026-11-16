import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { InspectionConfirmDialog } from '@pages/inspection/components/inspection-confirm-dialog.component';

/**
 * Shared behaviour of the QC Users (/operation) and Inspectors (/inspector) lists: both are the
 * same genuine Kartik/Krajee grid (`#users-grid`, confirmed live 2026-11-11), with the only
 * delete path being bulk delete via `#user-delete-btn` — there is no per-row delete link — which
 * opens InspectionConfirmDialog (a Bootstrap Dialog modal via dialog-yii.js), not this app's
 * native-confirm() logout pattern.
 */
export abstract class InspectionListPage extends BackendListPage {
  readonly deleteButton: Locator;
  readonly confirmDialog: InspectionConfirmDialog;

  protected constructor(page: Page, listPath: string) {
    super(page, listPath, 'users-grid');
    this.deleteButton = page.locator('#user-delete-btn');
    this.confirmDialog = new InspectionConfirmDialog(page);
  }

  // domcontentloaded, not the default 'load': a slow/hanging subresource on this app can keep
  // 'load' from ever firing even though the page is fully usable (confirmed live).
  override async goto(): Promise<void> {
    await this.page.goto(this.listPath, { waitUntil: 'domcontentloaded' });
  }

  /** This grid's row checkbox class is `.users-to-be-deleted`, not the main Backend's `.checkbox-row`. */
  override rowCheckbox(row: Locator): Locator {
    return row.locator('input.users-to-be-deleted');
  }

  /** Checks one row's checkbox and opens the bulk-delete Confirmation dialog. */
  async startDelete(row: Locator): Promise<void> {
    await this.rowCheckbox(row).check();
    await this.deleteButton.click();
    await this.confirmDialog.waitForVisible();
  }

  /** Starts a delete then cancels it: the record must still be present afterwards. */
  async startDeleteAndCancel(row: Locator): Promise<void> {
    await this.startDelete(row);
    await this.confirmDialog.cancel();
  }

  /** Starts a delete and confirms it. */
  async startDeleteAndConfirm(row: Locator): Promise<void> {
    await this.startDelete(row);
    await this.confirmDialog.confirmAndWaitForPageLoad();
  }
}
