import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import type { ContactType } from '@test-data/backend-contact-us.data';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  id: 0,
  type: 1,
  name: 2,
  mobile: 3,
  email: 4,
  company: 5,
  createdAt: 6,
  actions: 7,
} as const;

/** One message as the list shows it. */
export interface ContactUsRow {
  id: string;
  type: string;
  name: string;
  mobile: string;
  email: string;
  /** "(not set)" when the message has no company. */
  company: string;
  /** "2026-08-06 19:53:00" */
  createdAt: string;
}

/**
 * Mazad back-office "Contact us" (/backend/contactUs/contact-us/index, Global Settings > Contact
 * us): messages sent from the website's Contact Us and Sell On Mazad forms. Each row has View
 * (new tab) and Delete (asks for confirmation in a page dialog); tests never confirm a delete.
 * Rows are keyed by message ID.
 */
export class ContactUsPage extends BackendListPage {
  static readonly path = '/backend/contactUs/contact-us/index';
  static readonly viewPath = '/backend/contactUs/contact-us/view';
  private static readonly form = 'ContactUsSearch';

  // Search form
  readonly idInput: Locator;
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;
  readonly companyInput: Locator;
  readonly typeSelect: Locator;

  // Grid
  readonly exportAllButton: Locator;
  readonly exportCsvLink: Locator;
  /** Page dialog (not a browser one) asking to confirm a delete or an export. */
  readonly confirmDialog: Locator;

  // View page (a "detail-view" table of label/value rows)
  readonly detailView: Locator;
  readonly detailLabels: Locator;

  constructor(page: Page) {
    super(page, ContactUsPage.path, 'default-id');

    this.idInput = this.searchForm.locator('#contactussearch-id');
    this.nameInput = this.searchForm.locator('#contactussearch-name');
    this.phoneInput = this.searchForm.locator('#contactussearch-phone');
    this.emailInput = this.searchForm.locator('#contactussearch-email');
    this.companyInput = this.searchForm.locator('#contactussearch-company_name');
    // A plain dropdown here, not a select2 box like most Backend filters.
    this.typeSelect = this.searchForm.locator('#contactussearch-type');

    this.exportAllButton = this.grid.locator('.kv-grid-toolbar button', { hasText: 'Export All' });
    this.exportCsvLink = this.grid.locator('.kv-grid-toolbar .export-full-csv');
    this.confirmDialog = page.locator('.bootstrap-dialog.show');

    this.detailView = page.locator('.detail-view');
    this.detailLabels = this.detailView.locator('th');
  }

  /** Opens a message's View page (/backend/contactUs/contact-us/view?id=N) in this tab. */
  async gotoView(id: string): Promise<void> {
    await this.page.goto(`${ContactUsPage.viewPath}?id=${id}`);
  }

  /** A value on the View page, by its row label ("Message", "Email", ...). */
  viewValue(label: string): Locator {
    return this.detailView
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: new RegExp(`^\\s*${label}\\s*$`) }) })
      .locator('td');
  }

  async gotoType(type: ContactType): Promise<void> {
    const query = new URLSearchParams({ [`${ContactUsPage.form}[type]`]: type });
    await this.page.goto(`${ContactUsPage.path}?${query.toString()}`);
  }

  async gotoSorted(sort: string): Promise<void> {
    await this.page.goto(`${ContactUsPage.path}?sort=${sort}`);
  }

  async filterByType(type: ContactType): Promise<void> {
    await this.typeSelect.selectOption(type);
    await this.search();
  }

  /** Fills one text filter and searches. */
  async searchBy(
    field: 'idInput' | 'nameInput' | 'phoneInput' | 'emailInput' | 'companyInput',
    value: string,
  ): Promise<void> {
    await this[field].fill(value);
    await this.search();
  }

  viewLink(row: Locator): Locator {
    return this.rowCell(row, column.actions).locator('a[href*="contact-us/view"]');
  }

  deleteLink(row: Locator): Locator {
    return this.rowCell(row, column.actions).locator('a[href*="contact-us/delete"]');
  }

  /** Opens a row's delete confirmation and cancels it. Nothing is deleted. */
  async openAndCancelDelete(row: Locator): Promise<string> {
    await this.deleteLink(row).click();
    await this.confirmDialog.waitFor();
    const message = (
      await this.confirmDialog.locator('.bootstrap-dialog-message').innerText()
    ).trim();
    await this.confirmDialog.getByRole('button', { name: /Cancel/ }).click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
    return message;
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<ContactUsRow[]> {
    const rows: ContactUsRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<ContactUsRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    return {
      id: await cell(column.id),
      type: await cell(column.type),
      name: await cell(column.name),
      mobile: await cell(column.mobile),
      email: await cell(column.email),
      company: await cell(column.company),
      createdAt: await cell(column.createdAt),
    };
  }

  /** Exports the whole list as CSV (Export All > CSV > Ok) and returns the download. */
  async exportCsv(): Promise<Download> {
    await this.exportAllButton.click();
    await this.exportCsvLink.click();
    await this.confirmDialog.waitFor();
    const download = this.page.waitForEvent('download', { timeout: 90_000 });
    await this.confirmDialog.getByRole('button', { name: /Ok/ }).click();
    return download;
  }
}
