import type { Download, Locator, Page } from '@playwright/test';
import { AddToAuctionDialog } from '@pages/backend/components/add-to-auction-dialog.component';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { DirectSaleDialog } from '@pages/backend/components/direct-sale-dialog.component';
import { SuspendReasonDialog } from '@pages/backend/components/suspend-reason-dialog.component';
import { UploadInvoiceDialog } from '@pages/backend/components/upload-invoice-dialog.component';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { exactText } from '@utils/text';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  auctionInfo: 1,
  customer: 2,
  itemInfo: 3,
  statistics: 4,
  prices: 5,
  dates: 6,
  failedReason: 7,
  actions: 8,
} as const;

/** The search form's dropdowns, by the attribute they filter. */
export const failedSelectFilters = {
  auction: 'auction_id',
  failedReason: 'failed_reason_id',
  dateRangeType: 'date_range_type',
  supplier: 'supplier_id',
  showAllFailed: 'show_all_failed',
  type: 'type',
  auctionType: 'auction_type',
  bidType: 'bid_type',
} as const;
export type FailedSelectFilter = keyof typeof failedSelectFilters;

/** The search form's text boxes, by the attribute they filter. */
export const failedTextFilters = {
  vin: 'vin_number',
  itemTitle: 'item_title',
  startingPrice: 'starting_price',
} as const;
export type FailedTextFilter = keyof typeof failedTextFilters;

/** Export formats of the "Export All" menu, by their data-format attribute. */
export type FailedExportFormat = 'Csv' | 'Xls' | 'Xlsx';

/** One Failed List row, read from its cells. Money is whole riyals, null when "(not set)". */
export interface FailedRow {
  /** Auction-item ID (the row key). */
  itemId: string;
  auctionId: string;
  auctionTitle: string;
  auctionType: string;
  biddingType: string;
  /** Highest bidder's name, or "(not set)". */
  customer: string;
  vehicleId: string;
  vehicleTitle: string;
  type: string;
  supplier: string;
  /** VIN with its "#F<n>" attempt mark, as shown. */
  vin: string;
  plate: string;
  totalBids: number;
  totalBidders: number;
  totalViews: number;
  totalViewers: number;
  startingPrice: number | null;
  supplierPrice: number | null;
  reservePrice: number | null;
  highestPrice: number | null;
  commission: number | null;
  administrativeExpenses: number | null;
  startDate: string;
  endDate: string;
  failedReason: string;
  /** Row actions, by their title. */
  actions: string[];
}

function money(text: string | undefined): number | null {
  const digits = (text ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * Mazad back-office "Failed Auctions" list (/backend/auction/failed/index): auction items that
 * ended without a sale. Rows are keyed by auction-item ID; the vehicle ID is in the title link.
 * Each failed attempt of a vehicle is its own row ("#F1", "#F2", ...); the default list shows the
 * latest attempt and "Show All Failed = Yes" adds the earlier ones.
 */
export class FailedPage extends BackendListPage {
  static readonly path = '/backend/auction/failed/index';
  static readonly createAuctionPath = '/backend/auction/failed/create';

  // Toolbar
  readonly createAuctionButton: Locator;
  readonly addToAuctionButton: Locator;
  readonly selectAllCheckbox: Locator;
  readonly rowCheckboxes: Locator;
  readonly exportMenuToggle: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;
  /** In-page "Confirmation" dialog, shown before an export and before Repricing. */
  readonly confirmDialog: ConfirmDialog;

  /** Message under the Starting Price box (it checks whole numbers before searching). */
  readonly startingPriceError: Locator;

  // Popups
  readonly directSaleDialog: DirectSaleDialog;
  readonly uploadInvoiceDialog: UploadInvoiceDialog;
  readonly suspendDialog: SuspendReasonDialog;
  readonly addToAuctionDialog: AddToAuctionDialog;
  /** Shared popup of the statistics and supplier links (bids, viewers, reserve price). */
  readonly infoModal: Locator;

  constructor(page: Page) {
    super(page, FailedPage.path, 'failed');
    const toolbar = this.grid.locator('.kv-grid-toolbar');
    this.createAuctionButton = toolbar.locator(`a[href="${FailedPage.createAuctionPath}"]`);
    this.addToAuctionButton = toolbar.locator('a.add-to-auction');
    this.selectAllCheckbox = this.grid.locator('thead input.select-on-check-all');
    this.rowCheckboxes = this.rows.locator('input.checkbox-row');
    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('[id$="-cols-list"] label');
    this.confirmDialog = new ConfirmDialog(page);
    this.startingPriceError = this.searchForm.locator(
      '.field-failedlistviewsearch-starting_price .invalid-feedback',
    );

    this.directSaleDialog = new DirectSaleDialog(page);
    this.uploadInvoiceDialog = new UploadInvoiceDialog(page);
    this.suspendDialog = new SuspendReasonDialog(page);
    this.addToAuctionDialog = new AddToAuctionDialog(page);
    this.infoModal = page.locator('.modal.show .modal-title');
  }

  /** Opens the list filtered to one VIN. */
  async gotoByVin(vin: string): Promise<void> {
    await this.gotoWithFilters({ vin_number: vin });
  }

  /** Opens the list with search parameters in the URL (names as in FailedListViewSearch[...]). */
  async gotoWithFilters(filters: Record<string, string>): Promise<void> {
    const query = Object.entries(filters)
      .map(([name, value]) => `FailedListViewSearch%5B${name}%5D=${encodeURIComponent(value)}`)
      .join('&');
    await this.page.goto(`${FailedPage.path}?${query}`);
  }

  rowByVin(vin: string): Locator {
    return this.rows.filter({ hasText: vin });
  }

  // ---- search form ----

  textFilter(filter: FailedTextFilter): Locator {
    return this.searchForm.locator(`#failedlistviewsearch-${failedTextFilters[filter]}`);
  }

  /** The hidden <select> behind a dropdown filter. */
  selectFilter(filter: FailedSelectFilter): Locator {
    return this.searchForm.locator(`#failedlistviewsearch-${failedSelectFilters[filter]}`);
  }

  /** Text a dropdown filter shows (the chosen option or its placeholder). */
  selectFilterValue(filter: FailedSelectFilter): Locator {
    return this.filterValue(`failedlistviewsearch-${failedSelectFilters[filter]}`);
  }

  /** Option texts of a dropdown filter, without the empty "All" option. */
  async filterOptions(filter: FailedSelectFilter): Promise<string[]> {
    return this.selectFilter(filter)
      .locator('option')
      .evaluateAll((options) =>
        options
          .filter((option) => (option as HTMLOptionElement).value !== '')
          .map((option) => (option.textContent ?? '').trim()),
      );
  }

  /** Types a text filter without searching (so several filters can be combined). */
  async fillFilter(filter: FailedTextFilter, value: string): Promise<void> {
    await this.textFilter(filter).fill(value);
  }

  /** Picks a dropdown option without searching. A string matches the option text exactly. */
  async chooseFilter(filter: FailedSelectFilter, option: string | RegExp): Promise<void> {
    await this.selectFilterOption(
      `field-failedlistviewsearch-${failedSelectFilters[filter]}`,
      option,
    );
  }

  /** Types a text filter and searches. */
  async searchBy(filter: FailedTextFilter, value: string): Promise<void> {
    await this.fillFilter(filter, value);
    await this.search();
  }

  /** Picks a dropdown option and searches. */
  async filterBy(filter: FailedSelectFilter, option: string | RegExp): Promise<void> {
    await this.chooseFilter(filter, option);
    await this.search();
  }

  // ---- grid ----

  cell(row: Locator, columnName: keyof typeof column): Locator {
    return this.rowCell(row, column[columnName]);
  }

  /** Cells of one column, in grid order (for checking that every row matches a filter). */
  cells(columnName: keyof typeof column): Locator {
    return this.columnCells(column[columnName]);
  }

  rowCustomerLink(row: Locator): Locator {
    return this.cell(row, 'customer').locator('a');
  }

  rowVehicleLink(row: Locator): Locator {
    return this.cell(row, 'itemInfo').locator('a[href*="/vehicle/vehicle/view"]');
  }

  rowSupplierLink(row: Locator): Locator {
    return this.cell(row, 'itemInfo').locator('a.modal-lg-load');
  }

  /** The Total Bids, Total Viewers and Reserve Price links open a popup. */
  rowModalLinks(row: Locator): Locator {
    return row.locator('a.modal-xl-load');
  }

  /** The Total Bids link, which opens the list of bids. */
  rowBidsLink(row: Locator): Locator {
    return row.locator('a.modal-xl-load[data-url*="view-bidders"]');
  }

  /** Names in the open bids popup, one per bid (a bidder who bid several times repeats). */
  async bidderNames(): Promise<string[]> {
    const names = this.page.locator('.modal.show table tbody tr td:nth-child(2)');
    await names.first().waitFor();
    return (await names.allInnerTexts()).map((name) => name.trim());
  }

  async closeInfoModal(): Promise<void> {
    await this.page
      .locator('.modal.show button[data-dismiss="modal"], .modal.show .close')
      .first()
      .click();
    await this.page.locator('.modal.show').waitFor({ state: 'hidden' });
  }

  rowDirectSaleLink(row: Locator): Locator {
    return row.locator('a[title="Direct Sale"]');
  }

  rowRepricingLink(row: Locator): Locator {
    return row.locator('a[title="Repricing"]');
  }

  rowUploadInvoiceLink(row: Locator): Locator {
    return row.locator('a.upload-failed-invoice');
  }

  rowSuspendLink(row: Locator): Locator {
    return row.locator('a.suspend-btn');
  }

  /** Rows that offer Direct Sale, and rows that do not. */
  get rowsWithDirectSale(): Locator {
    return this.rows.filter({ has: this.page.locator('a[title="Direct Sale"]') });
  }

  /**
   * Rows whose selection checkbox is enabled. Some rows cannot be selected for "Add to Auction"
   * (observed 2026-11-11: every row of some suppliers, and part of another's, are disabled);
   * the rule behind it is a business question.
   */
  get selectableRows(): Locator {
    return this.rows.filter({ has: this.page.locator('input.checkbox-row:not([disabled])') });
  }

  get rowsWithoutDirectSale(): Locator {
    return this.rows.filter({ hasNot: this.page.locator('a[title="Direct Sale"]') });
  }

  /** The vehicle ID behind a row (rows themselves are keyed by auction-item ID). */
  async rowVehicleId(row: Locator): Promise<string> {
    const href = await this.rowVehicleLink(row).getAttribute('href');
    const id = href ? new URL(href, 'http://x').searchParams.get('id') : null;
    if (!id) throw new Error('Failed List row has no vehicle link.');
    return id;
  }

  /** Reads every field of a row from its cells. */
  async readRow(row: Locator): Promise<FailedRow> {
    const raw = await row.evaluate((tr, seq) => {
      const text = (element: Element | null) =>
        (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const pairs = (n: number) => {
        const result: Record<string, string> = {};
        tr.querySelectorAll(`td[data-col-seq="${n}"] table tr`).forEach((pair) => {
          const label = text(pair.querySelector('th'));
          if (label) result[label] = text(pair.querySelector('td'));
        });
        return result;
      };
      const cell = (n: number) => tr.querySelector(`td[data-col-seq="${n}"]`);
      return {
        itemId: tr.getAttribute('data-key') ?? '',
        info: pairs(seq.auctionInfo),
        item: pairs(seq.itemInfo),
        stats: pairs(seq.statistics),
        prices: pairs(seq.prices),
        dates: pairs(seq.dates),
        customer: text(cell(seq.customer)),
        reason: text(cell(seq.failedReason)),
        vehicleHref:
          cell(seq.itemInfo)
            ?.querySelector('a[href*="/vehicle/vehicle/view"]')
            ?.getAttribute('href') ?? '',
        actions: [...tr.querySelectorAll(`td[data-col-seq="${seq.actions}"] a`)].map(
          (a) => a.getAttribute('title') || text(a),
        ),
      };
    }, column);
    const whole = (value: string | undefined) => Number((value ?? '').replace(/\D/g, '') || 0);
    return {
      itemId: raw.itemId,
      auctionId: raw.info.ID ?? '',
      auctionTitle: raw.info.Title ?? '',
      auctionType: raw.info['Auction Type'] ?? '',
      biddingType: raw.info['Bidding Type'] ?? '',
      customer: raw.customer,
      vehicleId: new URL(raw.vehicleHref || '/?id=', 'http://x').searchParams.get('id') ?? '',
      vehicleTitle: raw.item.Title ?? '',
      type: raw.item.Type ?? '',
      supplier: raw.item.Supplier ?? '',
      vin: raw.item.VIN ?? '',
      plate: raw.item.Plate ?? '',
      totalBids: whole(raw.stats['Total Bids']),
      totalBidders: whole(raw.stats['Total Bidders']),
      totalViews: whole(raw.stats['Total Views']),
      totalViewers: whole(raw.stats['Total Viewers']),
      startingPrice: money(raw.prices['Starting Price']),
      supplierPrice: money(raw.prices['Supplier Price']),
      reservePrice: money(raw.prices['Reserve Price']),
      highestPrice: money(raw.prices['Highest Price']),
      commission: money(raw.prices.Commission),
      administrativeExpenses: money(raw.prices['Administrative Expenses']),
      startDate: raw.dates['Start Date'] ?? '',
      endDate: raw.dates['End Date'] ?? '',
      failedReason: raw.reason,
      actions: raw.actions,
    };
  }

  /** Reads every row on the current page. */
  async readRows(): Promise<FailedRow[]> {
    const rows: FailedRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  /** The VIN without its "#F<n>" attempt mark. */
  static baseVin(shown: string): string {
    return shown.trim().split(/\s+/)[0];
  }

  // ---- row actions (they open a popup or a page; nothing is submitted) ----

  async openDirectSale(row: Locator): Promise<void> {
    await this.rowDirectSaleLink(row).click();
    await this.directSaleDialog.form.waitFor();
  }

  async openUploadInvoice(row: Locator): Promise<void> {
    await this.rowUploadInvoiceLink(row).click();
    await this.uploadInvoiceDialog.form.waitFor();
  }

  async openSuspend(row: Locator): Promise<void> {
    await this.rowSuspendLink(row).click();
    await this.suspendDialog.form.waitFor();
  }

  /** Selects rows by item ID and opens the "Add To Auction" popup. */
  async openAddToAuction(...itemIds: string[]): Promise<void> {
    for (const id of itemIds) await this.rowCheckbox(this.row(id)).check();
    await this.addToAuctionButton.click();
    await this.addToAuctionDialog.title.waitFor();
  }

  /**
   * Waits for the page to react to "Save" in the Add To Auction popup and returns what it showed.
   * The page's shared submit handler may show a result popup, load another modal or reload, so
   * this waits for the popup or for the Save button to go away, closes a popup it finds, and
   * returns the text seen (for evidence). Whether the action worked is judged by the caller from
   * the lists, not from this text.
   */
  async settleAfterAddToAuction(): Promise<string> {
    const popup = this.resultAlert;
    const saveButton = this.addToAuctionDialog.saveButton;
    await Promise.race([
      popup.waitFor({ state: 'visible', timeout: 15_000 }),
      saveButton.waitFor({ state: 'detached', timeout: 15_000 }),
    ]).catch(() => undefined);
    if (await popup.isVisible()) {
      const text = (await popup.innerText()).replace(/\s+/g, ' ').trim();
      await this.resultAlertOkButton.click();
      return `popup: ${text}`;
    }
    const modal = (
      await this.page
        .locator('.modal.show')
        .first()
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    return modal ? `modal: ${modal}` : 'no popup; the dialog closed';
  }

  /** Clicks Repricing, which asks for confirmation first. */
  async startRepricing(row: Locator): Promise<void> {
    await this.rowRepricingLink(row).click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Confirms the Repricing question and waits for the vehicle's pricing form. */
  async confirmRepricing(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/vehicle\/pricing\/update/),
      this.confirmDialog.okButton.click(),
    ]);
  }

  async openCreateAuction(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.createAuctionButton);
  }

  // ---- export ----

  exportFormatLink(format: FailedExportFormat): Locator {
    return this.page.locator(`.dropdown-menu a[data-format="${format}"]`);
  }

  /** Opens Export All and picks a format, which opens the confirmation. */
  async startExport(format: FailedExportFormat): Promise<void> {
    await this.exportMenuToggle.click();
    await this.exportFormatLink(format).click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Exports the current list in a format, confirming the prompt, and returns the file. */
  async exportAs(format: FailedExportFormat): Promise<Download> {
    await this.startExport(format);
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.confirmDialog.okButton.click(),
    ]);
    return download;
  }

  /** Waits briefly for a download; resolves false when none starts. */
  async downloadStarts(timeoutMs: number): Promise<boolean> {
    return this.page
      .waitForEvent('download', { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
  }

  /** Opens or closes the export column picker. */
  async toggleExportColumns(): Promise<void> {
    await this.exportColumnsToggle.click();
  }

  async toggleExportColumn(columnLabel: string): Promise<void> {
    await this.exportColumnLabels.filter({ hasText: exactText(columnLabel) }).click();
  }

  /** Labels of the export column picker, in order. */
  async exportColumnNames(): Promise<string[]> {
    return (await this.exportColumnLabels.allInnerTexts()).map((label) => label.trim());
  }
}
