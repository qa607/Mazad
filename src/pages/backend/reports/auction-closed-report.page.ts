import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  id: 0,
  title: 2,
  statistics: 3,
  views: 4,
  viewers: 5,
  bids: 6,
  startDate: 7,
  endDate: 8,
} as const;

/** One closed auction as the report shows it. */
export interface ClosedAuctionRow {
  id: string;
  title: string;
  items: number;
  sold: number;
  failed: number;
  directSale: number;
  buyNow: number;
  noBid: number;
  views: number;
  viewsBefore: number;
  viewsDuring: number;
  viewers: number;
  viewersBefore: number;
  viewersDuring: number;
  bids: number;
  bidders: number;
  /** "2026-11-09 14:10:00" */
  startDate: string;
  endDate: string;
}

export type DateRangeType = 'start' | 'end';

/**
 * Mazad back-office "Auction Closed Report" (/backend/report/auction-closed-report/index,
 * Report > Auction Closed in the sidebar): one row per closed auction with its item, view,
 * viewer and bid counts. Rows are keyed by auction ID; several cells hold small nested tables.
 */
export class AuctionClosedReportPage extends BackendListPage {
  static readonly path = '/backend/report/auction-closed-report/index';
  private static readonly form = 'AuctionItemClosedSearch';

  // Search form
  readonly titleValue: Locator;
  readonly supplierValue: Locator;

  // Grid
  readonly titleCells: Locator;
  readonly exportAllButton: Locator;
  readonly exportCsvLink: Locator;
  /** "Ok to proceed?" dialog shown before an export is generated. */
  readonly exportConfirmDialog: Locator;

  constructor(page: Page) {
    super(page, AuctionClosedReportPage.path, 'default-id');

    this.titleValue = this.filterValue('auctionitemclosedsearch-title');
    this.supplierValue = this.filterValue('auctionitemclosedsearch-supplier_id');

    this.titleCells = this.columnCells(column.title);
    this.exportAllButton = this.grid.locator('.kv-grid-toolbar button', { hasText: 'Export All' });
    this.exportCsvLink = this.grid.locator('.kv-grid-toolbar .export-full-csv');
    this.exportConfirmDialog = page.locator('.bootstrap-dialog.show');
  }

  /** Opens the report filtered to auctions whose start or end date falls in a range. */
  async gotoDateRange(type: DateRangeType, from: string, to: string): Promise<void> {
    const form = AuctionClosedReportPage.form;
    const query = new URLSearchParams({
      [`${form}[date_range_type]`]: type,
      [`${form}[create_at_range]`]: `${from} - ${to}`,
    });
    await this.page.goto(`${AuctionClosedReportPage.path}?${query.toString()}`);
  }

  /** Picks an auction in the title filter (a search-as-you-type list) and searches. */
  async filterByAuctionTitle(title: string): Promise<void> {
    await this.searchForm.locator('.field-auctionitemclosedsearch-title .select2-selection').click();
    await this.page.locator('.select2-container--open .select2-search__field').fill(title);
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: title })
      .first()
      .click();
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-auctionitemclosedsearch-supplier_id', supplierOption);
    await this.search();
  }

  /** Every row on the current page, read into numbers. */
  async readRows(): Promise<ClosedAuctionRow[]> {
    const rows: ClosedAuctionRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<ClosedAuctionRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const statistics = await cell(column.statistics);
    const views = await cell(column.views);
    const viewers = await cell(column.viewers);
    const bids = await cell(column.bids);
    const number = (text: string, pattern: RegExp): number => {
      const match = text.match(pattern);
      if (!match) throw new Error(`"${pattern.source}" not found in: ${text}`);
      return Number(match[1]);
    };
    return {
      id: await cell(column.id),
      title: await cell(column.title),
      items: number(statistics, /Item (\d+)/),
      sold: number(statistics, /Sold (\d+)/),
      failed: number(statistics, /Failed (\d+)/),
      directSale: number(statistics, /Direct Sale (\d+)/),
      buyNow: number(statistics, /Buy Now (\d+)/),
      noBid: number(statistics, /No Bid (\d+)/),
      views: number(views, /Total (\d+)/),
      viewsBefore: number(views, /Before Auction (\d+)/),
      viewsDuring: number(views, /During Auction (\d+)/),
      viewers: number(viewers, /Unique Customers (\d+)/),
      viewersBefore: number(viewers, /Before Auction (\d+)/),
      viewersDuring: number(viewers, /During Auction (\d+)/),
      bids: number(bids, /Bid (\d+)/),
      bidders: number(bids, /Bidder (\d+)/),
      startDate: await cell(column.startDate),
      endDate: await cell(column.endDate),
    };
  }

  /** Exports the whole report as CSV (Export All > CSV > Ok) and returns the download. */
  async exportCsv(): Promise<Download> {
    await this.exportAllButton.click();
    await this.exportCsvLink.click();
    await this.exportConfirmDialog.waitFor();
    const download = this.page.waitForEvent('download', { timeout: 90_000 });
    await this.exportConfirmDialog.getByRole('button', { name: /Ok/ }).click();
    return download;
  }
}
