import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * Parent of Mazad Inspection backend page objects (stg-224-inspection, a separate Yii2/AdminLTE
 * application from the main Mazad Backend, confirmed 2026-11-11). It shares the main Backend's
 * CSRF/sidebar helpers (BackendPage) since both apps are the same framework, but stays its own
 * class because confirmation dialogs differ per page here, confirmed live: logout's link uses a
 * native `confirm()` dialog (via `data-confirm`/`data-method="post"`, handled by clickWithConfirm
 * below), while the QC/Inspector grids load Krajee's dialog-yii.js, which overrides
 * `yii.confirm` to render a Bootstrap Dialog HTML modal instead — see InspectionConfirmDialog.
 *
 * The Flash alert markup also differs from the main Backend's (no `role="alert"`, see
 * BackendPage.successAlert), so it is overridden here for every Inspection page.
 */
export abstract class InspectionPage extends BackendPage {
  /** Flash message after a save or delete (`.alert-success`, no `role="alert"` on this app). */
  override readonly successAlert: Locator;
  /** Flash message for a server-side rule beyond a field's own inline validation (`.alert-danger`),
   * e.g. QC Create's "Full Name Ar cannot be blank." — confirmed live 2026-11-11 to be enforced
   * even though the field has no inline `required` validator of its own. */
  readonly errorAlert: Locator;

  protected constructor(page: Page) {
    super(page);
    this.successAlert = page.locator('.alert.alert-success');
    this.errorAlert = page.locator('.alert.alert-danger');
  }

  /**
   * Accepts the ONE native `confirm()` dialog a `data-confirm` link is about to show, then clicks
   * it. Playwright dismisses an unhandled dialog by default, which would silently cancel the
   * action, so every such link must be clicked through this helper, never a plain `.click()`.
   */
  protected async clickWithConfirm(target: Locator): Promise<void> {
    this.page.once('dialog', (dialog) => void dialog.accept());
    await this.waitForPageLoadAfter(() => target.click());
  }
}
