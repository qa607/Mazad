import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import type { ConfigSetting } from '@test-data/config.data';

/** The server's answer to a save of one setting. */
export interface SaveResult {
  status: number;
  /**
   * The JSON body: { success, icon, title } for a handled save, { name, message, status } for a
   * refused request; null when the answer is not JSON.
   */
  body: { success?: boolean; icon?: string; title?: string; message?: string } | null;
}

const savePath = '/backend/config/ajax/save-config';

/**
 * Mazad back-office Global Settings > Config (/backend/config/config/index): one grid row of
 * site-wide ON/OFF switches. A switch saves as soon as it is flipped (an AJAX POST to
 * /config/ajax/save-config with attrName and state), shows a SweetAlert with the result, and
 * reloads the page when the alert's OK is clicked.
 */
export class ConfigPage extends BackendPage {
  static readonly path = '/backend/config/config/index';

  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly summary: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  /** Every setting's checkbox (hidden behind its Bootstrap switch). */
  readonly switchInputs: Locator;
  /** Any Create, Update, View or Delete control; the page has none. */
  readonly recordControls: Locator;
  readonly resultAlert: Locator;
  readonly resultTitle: Locator;
  readonly resultSuccessIcon: Locator;
  readonly resultOkButton: Locator;

  constructor(page: Page) {
    super(page);
    const content = page.locator('.app-main__inner');
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.summary = content.locator('.summary');
    this.columnHeaders = content.locator('table thead tr').first().locator('th');
    this.rows = content.locator('table tbody tr[data-key]');
    this.switchInputs = content.locator('input.config-enable');
    this.recordControls = content.locator(
      'a[href*="/config/config/create"], a[href*="/config/config/update"], ' +
        'a[href*="/config/config/view"], a[href*="/config/config/delete"]',
    );
    this.resultAlert = page.locator('.swal2-popup');
    this.resultTitle = this.resultAlert.locator('.swal2-title');
    this.resultSuccessIcon = this.resultAlert.locator('.swal2-icon.swal2-success');
    this.resultOkButton = this.resultAlert.locator('.swal2-confirm');
  }

  /** Opens the page (optionally with query parameters) and returns its HTTP status. */
  async goto(query: Record<string, string> = {}): Promise<number> {
    const search = new URLSearchParams(query).toString();
    const response = await this.page.goto(
      search ? `${ConfigPage.path}?${search}` : ConfigPage.path,
    );
    return response?.status() ?? 0;
  }

  /** Opens the page through Global Settings > Config in the sidebar. */
  async openFromMenu(): Promise<void> {
    await this.openFromSidebar('Global Settings', 'Config');
  }

  /** The checkbox of one setting. */
  switchInput(setting: ConfigSetting): Locator {
    return this.switchInputs.and(this.page.locator(`[name="${setting}"]`));
  }

  /** The visible Bootstrap switch of one setting, which the user clicks. */
  switchControl(setting: ConfigSetting): Locator {
    return this.page
      .locator('.bootstrap-switch')
      .filter({ has: this.page.locator(`input.config-enable[name="${setting}"]`) });
  }

  /** The text a switch shows for its state: "ON" or "OFF". */
  async shownState(setting: ConfigSetting): Promise<'ON' | 'OFF'> {
    return (await this.switchInput(setting).isChecked()) ? 'ON' : 'OFF';
  }

  /** Every setting's state as shown, keyed by setting name. */
  async shownStates(): Promise<Record<string, 'ON' | 'OFF'>> {
    return this.switchInputs.evaluateAll((inputs) =>
      Object.fromEntries(
        inputs.map((input) => [
          (input as HTMLInputElement).name,
          (input as HTMLInputElement).checked ? 'ON' : 'OFF',
        ]),
      ),
    );
  }

  /** The setting attribute names, in column order. */
  async settingNames(): Promise<string[]> {
    return this.switchInputs.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).name),
    );
  }

  /** Header texts in display order. */
  async headerTexts(): Promise<string[]> {
    return (await this.columnHeaders.allInnerTexts()).map((text) => text.trim());
  }

  sortLink(setting: ConfigSetting): Locator {
    return this.columnHeaders.locator(`a[data-sort$="${setting}"]`);
  }

  async sortBy(setting: ConfigSetting): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(setting));
  }

  /** Flips a setting's switch and waits for its save request to finish. */
  async flip(setting: ConfigSetting): Promise<void> {
    await Promise.all([
      this.page.waitForResponse((response) => response.url().includes(savePath)),
      this.switchControl(setting).click(),
    ]);
  }

  /** Clicks OK on the result alert, which reloads the page. */
  async confirmResult(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.resultOkButton);
  }

  /** Closes the result alert with Escape (no reload). */
  async dismissResult(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.resultAlert.waitFor({ state: 'hidden' });
  }

  /**
   * Sends a save the way the page's script does (AJAX POST with the page's CSRF token). A
   * state of undefined leaves the parameter out. Call it on a loaded Backend page.
   */
  async saveSetting(
    attrName: string,
    state: string | undefined,
    options: { ajax?: boolean; csrf?: boolean } = {},
  ): Promise<SaveResult> {
    const { ajax = true, csrf = true } = options;
    const csrfParam = (await this.page.locator('meta[name="csrf-param"]').getAttribute('content'))!;
    const csrfToken = (await this.page.locator('meta[name="csrf-token"]').getAttribute('content'))!;
    const form: Record<string, string> = { attrName };
    if (state !== undefined) form.state = state;
    if (csrf) form[csrfParam] = csrfToken;
    const headers: Record<string, string> = {};
    if (csrf) headers['X-CSRF-Token'] = csrfToken;
    if (ajax) headers['X-Requested-With'] = 'XMLHttpRequest';
    const response = await this.page.request.post(savePath, { form, headers, maxRedirects: 0 });
    const body = (await response.json().catch(() => null)) as SaveResult['body'];
    return { status: response.status(), body };
  }

  /** A setting's stored state, read from a fresh load of the page (not the open tab). */
  async storedState(setting: ConfigSetting): Promise<'ON' | 'OFF'> {
    const html = await (await this.page.request.get(ConfigPage.path)).text();
    const input = html.match(new RegExp(`<input[^>]*name="${setting}"[^>]*>`))?.[0];
    if (!input) throw new Error(`Setting ${setting} is not on the Config page.`);
    return /\schecked[\s>=]/.test(input) ? 'ON' : 'OFF';
  }

  /** HTTP status of a Config route opened by URL (GET only), to check which pages exist. */
  async routeStatus(pathAndQuery: string): Promise<number> {
    const response = await this.page.request.get(`/backend/config/config/${pathAndQuery}`);
    return response.status();
  }
}
