import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';
import type { SoldListRow } from '@typings/mazad';

/** Search form fields of the Sold List (GET form #w0, model SoldListViewSearch). */
export interface SoldListFilters {
  /** Value of the "Auction Title" select, which is the auction ID. */
  auctionId?: number;
  vin?: string;
  itemTitle?: string;
  /** Option value of the after-sale status select (e.g. "in_delivery"). */
  afterSaleStatus?: string;
  /** Option value of the type select (e.g. "vehicle"). */
  type?: string;
  /** Option value of the sale type select (e.g. "auction"). */
  saleType?: string;
}

/** Export formats offered by the "Export All" menu, keyed by the link's data-format. */
export type ExportFormat = 'Csv' | 'Xls' | 'Xlsx';

/**
 * Back office Sold List (Sold → Sold List, /backend/auction/sold/index).
 * Read-only: it searches, pages and opens details. Row actions that change data
 * (e.g. "Failed") have no method here on purpose.
 */
export class MazadSoldListPage extends BackendPage {
  static readonly path = '/backend/auction/sold/index';

  readonly searchForm: Locator;
  readonly auctionSelect: Locator;
  readonly vinInput: Locator;
  readonly itemTitleInput: Locator;
  readonly afterSaleStatusSelect: Locator;
  readonly typeSelect: Locator;
  readonly saleTypeSelect: Locator;
  readonly searchButton: Locator;
  readonly resetLink: Locator;
  readonly summary: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  readonly emptyResult: Locator;
  readonly pagination: Locator;
  readonly activePage: Locator;
  /** "Export All" dropdown toggle. Opening it is read-only; no format link is clicked. */
  readonly exportButton: Locator;
  readonly exportMenu: Locator;

  constructor(page: Page) {
    super(page);
    this.searchForm = page.locator(`form[action="${MazadSoldListPage.path}"]`);
    this.auctionSelect = page.locator('#soldlistviewsearch-auction_id');
    this.vinInput = page.locator('#soldlistviewsearch-vin_number');
    this.itemTitleInput = page.locator('#soldlistviewsearch-item_title');
    this.afterSaleStatusSelect = page.locator('#soldlistviewsearch-after_sale_status_string');
    this.typeSelect = page.locator('#soldlistviewsearch-type');
    this.saleTypeSelect = page.locator('#soldlistviewsearch-sale_type');
    this.searchButton = this.searchForm.locator('button[type="submit"]');
    this.resetLink = this.searchForm.getByRole('link', { name: 'Reset' });
    this.summary = page.locator('.summary');
    this.exportButton = page.getByRole('button', { name: 'Export All' });
    this.exportMenu = page
      .locator('.dropdown-menu')
      .filter({ has: page.locator('a[data-format]') });
    const grid = page
      .locator('.grid-view, [id$="-container"]')
      .filter({ has: page.locator('tr.sold') });
    this.columnHeaders = page.locator('table thead').first().locator('tr').first().locator('th');
    this.rows = page.locator('table tbody tr.sold');
    this.emptyResult = page.locator('.empty');
    this.pagination = grid.locator('.pagination').or(page.locator('.pagination')).first();
    this.activePage = this.pagination.locator('li.active');
  }

  async goto(): Promise<void> {
    await this.page.goto(MazadSoldListPage.path);
  }

  /** Opens a results page directly (pagination link target). */
  async gotoPage(pageNumber: number): Promise<void> {
    await this.page.goto(`${MazadSoldListPage.path}?page=${pageNumber}`);
  }

  /** Clicks a page number in the pagination bar. */
  async openPage(pageNumber: number): Promise<void> {
    await this.pagination.getByRole('link', { name: String(pageNumber), exact: true }).click();
    await this.page.waitForURL(new RegExp(`[?&]page=${pageNumber}(&|$)`));
  }

  /** Fills the search form and submits it (a GET request). */
  async search(filters: SoldListFilters): Promise<void> {
    if (filters.auctionId !== undefined) {
      await this.auctionSelect.selectOption(String(filters.auctionId), { force: true });
    }
    if (filters.vin !== undefined) await this.vinInput.fill(filters.vin);
    if (filters.itemTitle !== undefined) await this.itemTitleInput.fill(filters.itemTitle);
    // Select2 widgets drive hidden <select> elements; setting the select is what the form submits.
    if (filters.afterSaleStatus !== undefined) {
      await this.afterSaleStatusSelect.selectOption(filters.afterSaleStatus, { force: true });
    }
    if (filters.type !== undefined)
      await this.typeSelect.selectOption(filters.type, { force: true });
    if (filters.saleType !== undefined) {
      await this.saleTypeSelect.selectOption(filters.saleType, { force: true });
    }
    await Promise.all([this.page.waitForURL(/SoldListViewSearch/), this.searchButton.click()]);
  }

  /** Export format links in the "Export All" menu, by their data-format attribute. */
  exportFormatLink(format: ExportFormat): Locator {
    return this.exportMenu.locator(`a[data-format="${format}"]`);
  }

  /** Opens the "Export All" dropdown without clicking a format (no file is requested). */
  async openExportMenu(): Promise<void> {
    await this.exportButton.click();
    await this.exportMenu.waitFor({ state: 'visible' });
  }

  /** Option values and labels of a filter select, without the empty "All" option. */
  async selectOptions(select: Locator): Promise<{ value: string; label: string }[]> {
    return select.locator('option').evaluateAll((options) =>
      options
        .map((o) => ({
          value: (o as HTMLOptionElement).value,
          label: o.textContent?.trim() ?? '',
        }))
        .filter((o) => o.value !== ''),
    );
  }

  rowByAuctionId(auctionId: number): Locator {
    return this.page.locator(`table tbody tr.sold[data-key="${auctionId}"]`);
  }

  /** Auction IDs of the rows on the current page, in display order. */
  async auctionIds(): Promise<number[]> {
    const keys = await this.rows.evaluateAll((rows) => rows.map((r) => r.getAttribute('data-key')));
    return keys.map(Number);
  }

  /** Link to the vehicle's back office page in a row. */
  vehicleLink(row: Locator): Locator {
    return row.locator('a[href*="/backend/vehicle/vehicle/view"]');
  }

  /** Reads a row's label/value pairs (each column is a small label table). */
  async readRow(row: Locator): Promise<SoldListRow> {
    const raw = await row.evaluate((tr) => {
      const values: Record<string, string> = {};
      // Customer/rep names are deliberately not read; their IDs come from links instead.
      const skip = /^(name|rep\.?\s*name)$/i;
      tr.querySelectorAll('td table tr').forEach((pair) => {
        const label = pair.querySelector('th')?.textContent?.replace(/\s+/g, ' ').trim();
        const value = pair.querySelector('td')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (!label || skip.test(label)) return;
        // Labels repeat across columns (Title, Type): keep the first and number the rest.
        let key = label;
        for (let n = 2; key in values; n++) key = `${label}#${n}`;
        values[key] = value;
      });
      const hrefs = [...tr.querySelectorAll('a')].map((a) => ({
        href: a.getAttribute('href') ?? '',
        text: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      }));
      return { values, hrefs, key: tr.getAttribute('data-key') };
    });

    const idFrom = (pattern: RegExp): number | null => {
      const href = raw.hrefs.find((h) => pattern.test(h.href))?.href;
      const id = href ? new URL(href, 'http://x').searchParams.get('id') : null;
      return id ? Number(id) : null;
    };
    const v = raw.values;
    return {
      auctionId: Number(v.ID ?? raw.key),
      auctionTitle: v.Title ?? '',
      auctionType: v['Auction Type'] ?? '',
      biddingType: v['Bidding Type'] ?? '',
      status: v.Status ?? '',
      saleType: v.Type ?? '',
      customerId: idFrom(/\/backend\/users\/(dealer|individual)\/view/),
      vehicleId: idFrom(/\/backend\/vehicle\/vehicle\/view/),
      itemTitle: v['Title#2'] ?? '',
      itemType: v['Type#2'] ?? '',
      vin: v.VIN ?? '',
      plate: v.Plate ?? '',
      startingPrice: parseSar(v['Starting Price']),
      reservePrice: parseSar(v['Reserve Price']),
      highestPrice: parseSar(v['Highest Price']),
      administrativeExpenses: parseSar(v['Administrative Expenses']),
      salePrice: parseSar(v['Sale Price']),
      netAmount: parseSar(v['Net Amount']),
      startDate: v['Start Date'] ?? '',
      saleDate: v['Sale Date'] ?? '',
      actions: raw.hrefs
        .filter((h) => /View Invoice|View Workflow|Failed/.test(h.text))
        .map((h) => h.text),
    };
  }
}

/** "16,625 SR" -> 16625; empty or "-" -> null. */
function parseSar(text: string | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/[^\d.]/g, '');
  return digits ? Number(digits) : null;
}
