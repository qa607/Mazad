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

  /**
   * Sends a Backend AJAX action the way the page's own scripts do (POST with the page's CSRF
   * token, cookies of the signed-in session) and returns the HTTP status. Call it on a loaded
   * Backend page, since the token is read from that page.
   */
  async postAction(path: string): Promise<number> {
    const csrfParam = await this.page.locator('meta[name="csrf-param"]').getAttribute('content');
    const csrfToken = await this.page.locator('meta[name="csrf-token"]').getAttribute('content');
    if (!csrfParam || !csrfToken) throw new Error('The current page has no CSRF token.');
    const response = await this.page.request.post(path, {
      form: { [csrfParam]: csrfToken },
      headers: { 'X-CSRF-Token': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
      maxRedirects: 0,
    });
    return response.status();
  }

  /**
   * Starts counting POST requests to an endpoint. Returns a function giving the count so far,
   * so tests can prove that cancelling a confirmation sends nothing.
   */
  countPostRequests(endpoint: string): () => number {
    let requests = 0;
    this.page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes(endpoint)) requests += 1;
    });
    return () => requests;
  }
}
