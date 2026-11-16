import type { Locator, Page } from '@playwright/test';
import { UploadInvoiceDialog } from '@pages/backend/components/upload-invoice-dialog.component';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Mazad back-office "Failed Invoice" list (/backend/invoice/failed-invoice/index): items of the
 * Failed list that have an invoice uploaded. Columns: ID, Type, Customer, Vin Number, Item
 * Title, Supplier Name, Actions. Rows are read by header, so a column order change is caught.
 *
 * Row actions: "View Invoice" (a link that opens the invoice file in a new tab) and "Update
 * Supplier Invoice" (opens the same "Upload Invoice" popup as the Failed list). The list has no
 * toolbar and no export.
 */
export class FailedInvoicePage extends BackendListPage {
  static readonly path = '/backend/invoice/failed-invoice/index';

  readonly vinInput: Locator;
  readonly itemTitleInput: Locator;
  readonly supplierValue: Locator;
  /** Customer (highest bidder) dropdown: a search-as-you-type box, not a fixed list. */
  readonly customerValue: Locator;
  readonly viewInvoiceLinks: Locator;
  /** The "Upload Invoice" popup opened by "Update Supplier Invoice". */
  readonly uploadInvoiceDialog: UploadInvoiceDialog;

  constructor(page: Page) {
    super(page, FailedInvoicePage.path, 'failed_supplier_invoice');
    this.vinInput = this.searchForm.locator('#failedinvoicesearch-vin_number');
    this.itemTitleInput = this.searchForm.locator('#failedinvoicesearch-item_title');
    this.supplierValue = this.filterValue('failedinvoicesearch-supplier_id');
    this.customerValue = this.filterValue('failedinvoicesearch-highest_bidder_id');
    this.viewInvoiceLinks = this.rows.locator('a[title*="View"], a[href*="view-failed-invoice"]');
    this.uploadInvoiceDialog = new UploadInvoiceDialog(page);
  }

  /** Rows whose text contains a VIN. */
  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.itemTitleInput.fill(title);
    await this.search();
  }

  /** Picks a supplier in the dropdown (only suppliers that have an invoice are offered) and searches. */
  async filterBySupplier(option: string | RegExp): Promise<void> {
    await this.chooseSupplier(option);
    await this.search();
  }

  async chooseSupplier(option: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-failedinvoicesearch-supplier_id', option);
  }

  /** Types part of a customer name, picks the match from the results and searches. */
  async filterByCustomer(typed: string, name: string): Promise<void> {
    await this.chooseCustomer(typed, name);
    await this.search();
  }

  async chooseCustomer(typed: string, name: string): Promise<void> {
    await this.searchForm
      .locator('.field-failedinvoicesearch-highest_bidder_id .select2-selection')
      .click();
    await this.page.locator('.select2-container--open .select2-search__field').fill(typed);
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: name })
      .click();
  }

  /** Names offered by the customer search for a typed text (the box is left open). */
  async customerSuggestions(typed: string): Promise<string[]> {
    await this.searchForm
      .locator('.field-failedinvoicesearch-highest_bidder_id .select2-selection')
      .click();
    await this.page.locator('.select2-container--open .select2-search__field').fill(typed);
    const options = this.page.locator('.select2-container--open .select2-results__option');
    // The box first shows "Searching…" while it asks the server.
    await options
      .filter({ hasNotText: /Searching/ })
      .first()
      .waitFor();
    const names = (await options.allInnerTexts()).map((name) => name.trim());
    await this.page.keyboard.press('Escape');
    return names;
  }

  /** The message the customer search shows when nothing matches the typed text. */
  async customerNoResultsMessage(typed: string): Promise<string> {
    await this.searchForm
      .locator('.field-failedinvoicesearch-highest_bidder_id .select2-selection')
      .click();
    await this.page.locator('.select2-container--open .select2-search__field').fill(typed);
    const message = this.page
      .locator('.select2-container--open .select2-results__message')
      .filter({ hasText: /no results|not found/i });
    await message.waitFor();
    const text = (await message.innerText()).trim();
    await this.page.keyboard.press('Escape');
    return text;
  }

  /** Opens the list filtered to one VIN. */
  async gotoByVin(vin: string): Promise<void> {
    await this.page.goto(
      `${FailedInvoicePage.path}?FailedInvoiceSearch%5Bvin_number%5D=${encodeURIComponent(vin)}`,
    );
  }

  /** Opens the list with a raw query string (e.g. "per-page=1&page=2"). */
  async gotoWithQuery(query: string): Promise<void> {
    await this.page.goto(`${FailedInvoicePage.path}?${query}`);
  }

  // ---- row actions ----

  viewInvoiceLink(row: Locator): Locator {
    return row.locator('a', { hasText: /^\s*View Invoice\s*$/ });
  }

  updateSupplierInvoiceLink(row: Locator): Locator {
    return row.locator('a.upload-failed-invoice');
  }

  /** The action names shown in a row, in order. */
  async rowActionNames(row: Locator): Promise<string[]> {
    return (await row.locator('td').last().locator('a').allInnerTexts()).map((text) => text.trim());
  }

  /**
   * The address "View Invoice" points to. It is a signed, private link: callers use it to make a
   * request and must never log or attach it.
   */
  async invoiceFileHref(row: Locator): Promise<string> {
    const href = await this.viewInvoiceLink(row).getAttribute('href');
    if (!href) throw new Error('The row has no View Invoice link.');
    return href;
  }

  /** Clicks View Invoice and returns the new tab it opens. */
  async openViewInvoice(row: Locator): Promise<Page> {
    return this.openInNewTab(this.viewInvoiceLink(row));
  }

  /** Clicks Update Supplier Invoice and waits for the popup (nothing is submitted). */
  async openUpdateSupplierInvoice(row: Locator): Promise<void> {
    await this.updateSupplierInvoiceLink(row).click();
    await this.uploadInvoiceDialog.form.waitFor();
  }

  /** Every row as header -> cell text (Actions holds the action names). */
  async readRows(): Promise<Record<string, string>[]> {
    const headers = (await this.columnHeaders.allInnerTexts()).map((header) => header.trim());
    const rows = await this.rows.all();
    const records: Record<string, string>[] = [];
    for (const row of rows) {
      const cells = (await row.locator('td').allInnerTexts()).map((cell) => cell.trim());
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = cells[index] ?? '';
      });
      records.push(record);
    }
    return records;
  }
}
