import type { Locator, Page } from '@playwright/test';

/**
 * Parent of Mazad Backend page objects. The Backend has no localization, so unlike
 * BasePage there is no language or translator. Locators and actions live in subclasses.
 */
export abstract class BackendPage {
  constructor(protected readonly page: Page) {}

  /**
   * Clicks something that loads a new page (a GET form submit or a link) and waits for that
   * page to finish loading, so the next action never hits the page being replaced.
   */
  protected async clickAndWaitForPageLoad(target: Locator): Promise<void> {
    const loaded = this.page.waitForEvent('load');
    await target.click();
    await loaded;
  }
}
