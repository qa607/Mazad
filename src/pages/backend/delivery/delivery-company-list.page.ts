import type { Download, Locator, Page } from '@playwright/test';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/** One Delivery Companies row. */
export interface DeliveryCompanyRow {
  /** Record ID (the row key). */
  id: string;
  arabicName: string;
  englishName: string;
  /** The status dropdown's selected text, "Published" or "Unpublished". */
  status: string;
}

/**
 * Mazad back-office "Delivery Companies" list (Delivery Companies → Companies,
 * /backend/deliveryCompany/delivery-company/index). Each row has View and Update links, a Delete
 * link only for roles that may delete, and a Published / Unpublished dropdown that saves as soon as
 * it is changed. Automation never uses Update, Delete or the status dropdown.
 */
export class DeliveryCompanyListPage extends BackendListPage {
  static readonly path = '/backend/deliveryCompany/delivery-company/index';
  static readonly createPath = '/backend/deliveryCompany/delivery-company/create';

  readonly arabicNameInput: Locator;
  readonly englishNameInput: Locator;
  /** The Status filter: a plain dropdown (All / Published / Unpublished). */
  readonly publishedSelect: Locator;
  readonly createButton: Locator;
  /** The flash message shown after a save, e.g. "Delivery Company has been created." */
  override readonly successAlert: Locator;
  readonly statusDropdowns: Locator;
  readonly idSortLink: Locator;
  readonly exportMenuToggle: Locator;
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, DeliveryCompanyListPage.path, 'default-id');
    this.arabicNameInput = this.searchForm.locator('#deliverycompanysearch-name');
    this.englishNameInput = this.searchForm.locator('#deliverycompanysearch-name_en');
    this.publishedSelect = this.searchForm.locator('#deliverycompanysearch-is_published');
    this.createButton = page.locator(`a[href="${DeliveryCompanyListPage.createPath}"]`);
    this.successAlert = page.getByRole('alert');
    this.statusDropdowns = this.rows.locator('select[data-field="is_published"]');
    this.idSortLink = this.columnHeaders.locator('a', { hasText: /^ID$/ });
    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.confirmDialog = new ConfirmDialog(page);
  }

  async searchByArabicName(name: string): Promise<void> {
    await this.arabicNameInput.fill(name);
    await this.search();
  }

  async searchByEnglishName(name: string): Promise<void> {
    await this.englishNameInput.fill(name);
    await this.search();
  }

  async filterByPublished(option: 'All' | 'Published' | 'Unpublished'): Promise<void> {
    await this.publishedSelect.selectOption({ label: option });
    await this.search();
  }

  /** Opens the list filtered by the given search attributes (names as in DeliveryCompanySearch[...]). */
  async gotoWithFilters(filters: Record<string, string>): Promise<void> {
    const query = Object.entries(filters)
      .map(([name, value]) => `DeliveryCompanySearch%5B${name}%5D=${encodeURIComponent(value)}`)
      .join('&');
    await this.page.goto(`${DeliveryCompanyListPage.path}?${query}`);
  }

  async gotoWithQuery(query: string): Promise<void> {
    await this.page.goto(`${DeliveryCompanyListPage.path}?${query}`);
  }

  /** Clicks the ID header: sorts ascending, then descending. */
  async sortById(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.idSortLink);
  }

  rowViewLink(row: Locator): Locator {
    return row.locator('a[title="View"]');
  }

  rowUpdateLink(row: Locator): Locator {
    return row.locator('a[title="Update"]');
  }

  rowDeleteLink(row: Locator): Locator {
    return row.locator('a[title="Delete"]');
  }

  /** Titles of the row's action links (View, Update, and Delete where allowed). */
  async rowActionTitles(row: Locator): Promise<string[]> {
    return row
      .locator('a[title]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('title') ?? ''));
  }

  /** Every row on the current page. */
  async readRows(): Promise<DeliveryCompanyRow[]> {
    const rows: DeliveryCompanyRow[] = [];
    for (const row of await this.rows.all()) {
      const cells = row.locator('td');
      const select = row.locator('select[data-field="is_published"]');
      rows.push({
        id: await this.rowId(row),
        arabicName: ((await cells.nth(2).innerText()) ?? '').trim(),
        englishName: ((await cells.nth(3).innerText()) ?? '').trim(),
        status:
          (await select.count()) > 0
            ? (
                (await select.evaluate(
                  (s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent,
                )) ?? ''
              ).trim()
            : ((await cells.nth(4).innerText()) ?? '').trim(),
      });
    }
    return rows;
  }

  // ---- export ----

  async exportAsCsv(): Promise<Download> {
    await this.exportMenuToggle.click();
    await this.page.locator('.dropdown-menu a.export-full-csv').click();
    await this.confirmDialog.okButton.waitFor();
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.confirmDialog.okButton.click(),
    ]);
    return download;
  }
}
