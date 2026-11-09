import type { Locator, Page } from '@playwright/test';
import { exactText } from '@utils/text';

/**
 * Parent of Mazad Backend page objects. The Backend has no localization, so unlike
 * BasePage there is no language or translator. Locators and actions live in subclasses.
 */
export abstract class BackendPage {
  /** Flash message shown after a successful save or delete. */
  readonly successAlert: Locator;

  constructor(protected readonly page: Page) {
    this.successAlert = page.locator('.alert-success[role="alert"]');
  }

  /**
   * Opens a page through the sidebar menu, expanding each parent item first, e.g.
   * openFromSidebar('Users', 'Customer Group').
   */
  async openFromSidebar(...menuPath: [...parents: string[], target: string]): Promise<void> {
    const sidebar = this.page.locator('.app-sidebar');
    // Menu items are matched by their text: their icon-font glyphs are part of the accessible
    // name, so a role locator with the plain name does not match.
    const item = (name: string) => sidebar.locator('a', { hasText: exactText(name) });
    const parents = menuPath.slice(0, -1);
    for (const parent of parents) await item(parent).click();
    await this.clickAndWaitForPageLoad(item(menuPath[menuPath.length - 1]));
  }

  /**
   * Runs an action that loads a new page (a GET form submit or a link) and waits for that
   * page to finish loading, so the next action never hits the page being replaced. Waiting on
   * the URL alone is not enough: after a search the URL often already matches.
   */
  protected async waitForPageLoadAfter(action: () => Promise<void>): Promise<void> {
    await Promise.all([this.page.waitForEvent('load'), action()]);
  }

  protected async clickAndWaitForPageLoad(target: Locator): Promise<void> {
    await this.waitForPageLoadAfter(() => target.click());
  }

  /** For links that open a new browser tab: clicks one and returns the loaded tab. */
  async openInNewTab(link: Locator): Promise<Page> {
    const [tab] = await Promise.all([this.page.context().waitForEvent('page'), link.click()]);
    await tab.waitForLoadState();
    return tab;
  }

  /** Hides the header's account details on every page this tab loads, for screen recordings. */
  async hideAccountDetailsInRecordings(): Promise<void> {
    await this.page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.app-header-right { visibility: hidden; }';
        document.head.appendChild(style);
      });
    });
  }

  /**
   * Starts counting browser dialogs (alert, confirm, prompt), dismissing each one. Returns a
   * function giving the count so far, so tests can prove that input never ran as script.
   */
  countDialogs(): () => number {
    let dialogs = 0;
    this.page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    return () => dialogs;
  }
}
