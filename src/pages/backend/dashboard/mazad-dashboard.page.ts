import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/** Mazad back-office home (/backend/), shown after a successful login. */
export class MazadDashboardPage extends BackendPage {
  static readonly path = '/backend/';

  readonly pageHeading: Locator;
  readonly welcomeText: Locator;
  readonly sidebar: Locator;
  readonly homeLink: Locator;
  readonly userMenuToggle: Locator;
  /** Header of the user menu; it shows the signed-in account's phone number. */
  readonly accountDetails: Locator;
  readonly signOutLink: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    const header = page.locator('.app-header-right');
    this.welcomeText = header.locator('.user-welcome-text');
    this.userMenuToggle = header.locator('[data-toggle="dropdown"]');
    this.accountDetails = header.locator('.dropdown-menu-header');
    this.signOutLink = header.locator('a[href$="/authentication/logout"]');
    this.sidebar = page.locator('.app-sidebar');
    this.homeLink = this.sidebar.locator('a[href="/backend/site/index"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(MazadDashboardPage.path);
  }

  async openUserMenu(): Promise<void> {
    await this.userMenuToggle.click();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.signOutLink.click();
  }

  /** Areas that can show account details, for masking in screenshots. */
  sensitiveAreas(): Locator[] {
    return [this.welcomeText, this.accountDetails];
  }
}
