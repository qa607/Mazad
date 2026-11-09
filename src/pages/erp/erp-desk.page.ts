import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { ErpAccount } from '@config/credentials.config';
import { fillSecret } from '@utils/secret-input';
import { erpUrls } from '@test-data/erp.data';

/** An ERPNext record as returned by the list API (only the fields that were asked for). */
export type ErpRecord = Record<string, string | number | null>;

/**
 * ERPNext staging: the login form, the Helpdesk app switcher, the Desk global search and the
 * read-only list API. Nothing here creates, edits or deletes ERPNext data.
 */
export class ErpDeskPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  /** "Helpdesk" app switcher, top left after login. */
  readonly appSwitcher: Locator;
  readonly appsMenuItem: Locator;
  readonly erpNextApp: Locator;
  /** Desk navbar "Search  Ctrl+K" button, which opens the search box. */
  readonly globalSearch: Locator;
  /** "Search or type a command" box opened by globalSearch. */
  readonly globalSearchInput: Locator;
  readonly searchSuggestions: Locator;
  /** "20 of 37" above a list. */
  readonly listCount: Locator;
  readonly listRows: Locator;

  constructor(readonly page: Page) {
    this.emailInput = page.locator('#login_email');
    this.passwordInput = page.locator('#login_password');
    this.loginButton = page.locator('button.btn-login').filter({ visible: true }).first();
    this.appSwitcher = page.getByRole('button', { name: /Helpdesk/ }).first();
    this.appsMenuItem = page
      .locator('[role=menu]')
      .getByText(/^Apps?$/)
      .first();
    this.erpNextApp = page
      .getByText(/^ERPNext$/i)
      .filter({ visible: true })
      .first();
    this.globalSearch = page.locator('#desktop-navbar-modal-search');
    this.globalSearchInput = page.locator('#navbar-search');
    this.searchSuggestions = page.locator('li').filter({ visible: true });
    this.listCount = page.locator('.list-count').first();
    this.listRows = page.locator('.list-row-container .list-row');
  }

  async goto(): Promise<void> {
    await this.page.goto(erpUrls.base + '/');
  }

  /** Signs in through the login form without the credentials appearing in reports. */
  async loginAs(account: ErpAccount): Promise<void> {
    await fillSecret(this.emailInput, account.user);
    await fillSecret(this.passwordInput, account.password);
    await this.loginButton.click();
    await this.page.waitForURL((url) => !erpUrls.login.test(url.href) && url.pathname !== '/', {
      timeout: 60_000,
    });
  }

  /** Helpdesk (top left) → Apps → ERPNext. Returns the page ERPNext opened in. */
  async openErpNext(): Promise<Page> {
    await this.appSwitcher.click();
    await this.appsMenuItem.hover();
    await this.appsMenuItem.click();
    const [tab] = await Promise.all([
      this.page
        .context()
        .waitForEvent('page', { timeout: 8_000 })
        .catch(() => null),
      this.erpNextApp.click(),
    ]);
    const app = tab ?? this.page;
    await app.waitForURL(erpUrls.desk);
    return app;
  }

  /** Types into the Desk global search and opens the suggestion with exactly that text. */
  async searchAndOpen(text: string): Promise<void> {
    await this.globalSearch.click();
    await this.globalSearchInput.pressSequentially(text, { delay: 40 });
    await this.searchSuggestions
      .filter({ hasText: new RegExp(`^\\s*${text}\\s*$`, 'i') })
      .first()
      .click();
  }

  /** Total records in the list, from the "20 of 37" counter. */
  async listTotal(): Promise<number> {
    const text = await this.listCount.innerText();
    const total = /of\s+([\d,]+)/.exec(text)?.[1];
    if (!total) throw new Error(`Unexpected list count text: "${text}"`);
    return Number(total.replace(/,/g, ''));
  }

  /**
   * Every record of a doctype matching the filters, through the read-only list API (GET).
   * Throws when a requested field is missing from the response, so an unreadable field can
   * never look like an empty value.
   */
  static async listRecords(
    api: APIRequestContext,
    doctype: 'Customer' | 'Supplier',
    fields: readonly string[],
    filters: [string, string, string][],
  ): Promise<ErpRecord[]> {
    const response = await api.get(`${erpUrls.base}/api/resource/${doctype}`, {
      params: {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        limit_page_length: '0',
      },
    });
    if (!response.ok()) {
      throw new Error(`ERPNext ${doctype} list API answered HTTP ${response.status()}`);
    }
    const { data } = (await response.json()) as { data: ErpRecord[] };
    const absent = fields.filter((field) => data.length > 0 && !(field in data[0]));
    if (absent.length) {
      throw new Error(`ERPNext ${doctype} list API did not return: ${absent.join(', ')}`);
    }
    return data;
  }
}
