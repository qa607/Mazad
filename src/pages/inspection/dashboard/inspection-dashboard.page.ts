import type { Locator, Page } from '@playwright/test';
import { InspectionPage } from '@pages/inspection/base/inspection.page';

/** Mazad Inspection backend home (/, shown after a successful login; title "Motory - Dashboard"). */
export class InspectionDashboardPage extends InspectionPage {
  static readonly path = '/';

  readonly userMenuToggle: Locator;
  /** Header of the user menu; shows the signed-in account's name and role (not a credential). */
  readonly accountDetails: Locator;
  readonly profileLink: Locator;
  readonly logoutLink: Locator;
  readonly sidebar: Locator;

  constructor(page: Page) {
    super(page);
    const userMenu = page.locator('li.dropdown.user.user-menu');
    this.userMenuToggle = userMenu.locator('a.dropdown-toggle');
    this.accountDetails = userMenu.locator('li.user-header p');
    this.profileLink = userMenu.locator('a[href^="/user/profile"]');
    this.logoutLink = userMenu.locator('a[href$="/site/logout"]');
    this.sidebar = page.locator('.main-sidebar');
  }

  async goto(): Promise<void> {
    await this.page.goto(InspectionDashboardPage.path);
  }

  async openUserMenu(): Promise<void> {
    await this.userMenuToggle.click();
  }

  /**
   * Signs out: opens the user menu, then accepts the app's own "Want to logout?" confirm
   * dialog. Call this only from a page that does not load Krajee's dialog-yii.js (the
   * Dashboard does not; the QC/Inspector grids do) — that script overrides the whole page's
   * `yii.confirm`, including this link's, into a Bootstrap Dialog the native-dialog handler
   * below never sees, so the click would silently do nothing (confirmed live 2026-11-11).
   */
  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.clickWithConfirm(this.logoutLink);
  }

  /** Areas that can show account details, for masking in screenshots. */
  sensitiveAreas(): Locator[] {
    return [this.accountDetails];
  }
}
