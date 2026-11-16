import type { Download, Locator, Page } from '@playwright/test';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { TrackingLinkDialog } from '@pages/backend/delivery/tracking-link-dialog.component';
import { exactText } from '@utils/text';

/** The search form's text boxes, by the attribute they filter. */
export const trackingTextFilters = {
  vin: 'vin_number',
  plate: 'plate_number',
  trackingLink: 'tracking_link',
} as const;
export type TrackingTextFilter = keyof typeof trackingTextFilters;

/** The search form's dropdowns, by the attribute they filter. */
export const trackingSelectFilters = {
  deliveryCompany: 'delivery_company',
  supplier: 'supplier_id',
  location: 'city_id',
} as const;
export type TrackingSelectFilter = keyof typeof trackingSelectFilters;

export type TrackingExportFormat = 'Csv' | 'Xls' | 'Xlsx';

/** One Tracking row, read by column heading. */
export interface TrackingRow {
  /** Row key (the shipment record). */
  key: string;
  vin: string;
  plate: string;
  /** What the Tracking Link cell shows ("Edit Link"). */
  trackingLink: string;
  deliveryCompany: string;
  /** Supplier the vehicle ships from. */
  from: string;
  /** Delivery city. */
  to: string;
  /** "yyyy-mm-dd hh:mm:ss". */
  deliveryDate: string;
}

/**
 * Mazad back-office "Tracking Companies Section" (Delivery Companies → Tracking,
 * /backend/deliveryCompany/delivery-company/tracking): vehicle shipments with their delivery
 * company, supplier, city and delivery date. 20 rows per page. Only "Date of delivery" sorts.
 * The only change action is "Edit Link", which opens a popup (see TrackingLinkDialog).
 */
export class DeliveryTrackingPage extends BackendListPage {
  static readonly path = '/backend/deliveryCompany/delivery-company/tracking';

  readonly dateRangeInput: Locator;
  readonly dateRangeValue: Locator;
  readonly dateSortLink: Locator;
  readonly exportMenuToggle: Locator;
  readonly exportColumnsToggle: Locator;
  readonly exportColumnLabels: Locator;
  readonly confirmDialog: ConfirmDialog;
  readonly linkDialog: TrackingLinkDialog;
  readonly editLinkLinks: Locator;

  constructor(page: Page) {
    super(page, DeliveryTrackingPage.path, 'default-id');
    this.dateRangeInput = this.searchForm.locator('input.range-value').first();
    this.dateRangeValue = this.searchForm.locator(
      'input[name="TrackingDeliveryCompanySearch[date_range]"]',
    );
    this.dateSortLink = this.columnHeaders.locator('a', { hasText: 'Date of delivery' });
    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.exportColumnLabels = page.locator('[id$="-cols-list"] label');
    this.confirmDialog = new ConfirmDialog(page);
    this.linkDialog = new TrackingLinkDialog(page);
    this.editLinkLinks = this.rows.locator('a.modal-lg-load');
  }

  // ---- search form ----

  textFilter(filter: TrackingTextFilter): Locator {
    return this.searchForm.locator(`#trackingdeliverycompanysearch-${trackingTextFilters[filter]}`);
  }

  selectFilter(filter: TrackingSelectFilter): Locator {
    return this.searchForm.locator(
      `#trackingdeliverycompanysearch-${trackingSelectFilters[filter]}`,
    );
  }

  selectFilterValue(filter: TrackingSelectFilter): Locator {
    return this.filterValue(`trackingdeliverycompanysearch-${trackingSelectFilters[filter]}`);
  }

  /** Option texts of a dropdown filter, without the empty first option. */
  async filterOptions(filter: TrackingSelectFilter): Promise<string[]> {
    return this.selectFilter(filter)
      .locator('option')
      .evaluateAll((options) =>
        options
          .filter((option) => (option as HTMLOptionElement).value !== '')
          .map((option) => (option.textContent ?? '').trim()),
      );
  }

  async fillFilter(filter: TrackingTextFilter, value: string): Promise<void> {
    await this.textFilter(filter).fill(value);
  }

  async chooseFilter(filter: TrackingSelectFilter, option: string | RegExp): Promise<void> {
    await this.selectFilterOption(
      `field-trackingdeliverycompanysearch-${trackingSelectFilters[filter]}`,
      option,
    );
  }

  async searchBy(filter: TrackingTextFilter, value: string): Promise<void> {
    await this.fillFilter(filter, value);
    await this.search();
  }

  async filterBy(filter: TrackingSelectFilter, option: string | RegExp): Promise<void> {
    await this.chooseFilter(filter, option);
    await this.search();
  }

  /**
   * Picks a custom range in the date picker's calendar (days of the month it opens on, which is the
   * month of the newest delivery) and applies it. Does not press Search.
   */
  async pickDateRange(startDay: number, endDay: number): Promise<void> {
    await this.dateRangeInput.click();
    const picker = this.page.locator('.daterangepicker:visible').first();
    const days = picker.locator('.drp-calendar.left td.available:not(.off)');
    await days
      .filter({ hasText: new RegExp(`^${startDay}$`) })
      .first()
      .click();
    await days
      .filter({ hasText: new RegExp(`^${endDay}$`) })
      .first()
      .click();
    await picker.getByRole('button', { name: 'Apply' }).click();
  }

  /** Opens the list with search parameters in the URL (names as in TrackingDeliveryCompanySearch[...]). */
  async gotoWithFilters(filters: Record<string, string>): Promise<void> {
    const query = Object.entries(filters)
      .map(
        ([name, value]) =>
          `TrackingDeliveryCompanySearch%5B${name}%5D=${encodeURIComponent(value)}`,
      )
      .join('&');
    await this.page.goto(`${DeliveryTrackingPage.path}?${query}`);
  }

  /** Opens the list with a raw query string, e.g. "sort=delivery_date" or "page=3". */
  async gotoWithQuery(query: string): Promise<void> {
    await this.page.goto(`${DeliveryTrackingPage.path}?${query}`);
  }

  // ---- grid ----

  /** Every row on the current page, read by column heading. */
  async readRows(): Promise<TrackingRow[]> {
    const rows: TrackingRow[] = [];
    for (const row of await this.rows.all()) {
      const cells = (await row.locator('td').allInnerTexts()).map((cell) =>
        cell.replace(/\s+/g, ' ').trim(),
      );
      rows.push({
        key: await this.rowId(row),
        vin: cells[0] ?? '',
        plate: cells[1] ?? '',
        trackingLink: cells[2] ?? '',
        deliveryCompany: cells[3] ?? '',
        from: cells[4] ?? '',
        to: cells[5] ?? '',
        deliveryDate: cells[6] ?? '',
      });
    }
    return rows;
  }

  /** The delivery company link of a row (opens the company's page in a new tab). */
  companyLink(row: Locator): Locator {
    return row.locator('a[href*="/delivery-company/view"]');
  }

  editLinkLink(row: Locator): Locator {
    return row.locator('a.modal-lg-load');
  }

  /** The address the Edit Link popup loads its form from (a GET); used for role access checks. */
  async editLinkFormPath(row: Locator): Promise<string> {
    const path = await this.editLinkLink(row).getAttribute('data-url');
    if (!path) throw new Error('The row has no Edit Link.');
    return path;
  }

  /** Clicks Edit Link and waits for the popup (nothing is saved). */
  async openEditLink(row: Locator): Promise<void> {
    await this.editLinkLink(row).click();
    await this.linkDialog.form.waitFor();
  }

  /** Clicks the Date of delivery header: sorts ascending, then descending. */
  async sortByDate(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.dateSortLink);
  }

  // ---- export ----

  exportFormatLink(format: TrackingExportFormat): Locator {
    return this.page.locator(`.dropdown-menu a.export-full-${format.toLowerCase()}`);
  }

  async startExport(format: TrackingExportFormat): Promise<void> {
    await this.exportMenuToggle.click();
    await this.exportFormatLink(format).click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Exports the current list in a format, confirming the prompt, and returns the file. */
  async exportAs(format: TrackingExportFormat): Promise<Download> {
    await this.startExport(format);
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.confirmDialog.okButton.click(),
    ]);
    return download;
  }

  async downloadStarts(timeoutMs: number): Promise<boolean> {
    return this.page
      .waitForEvent('download', { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
  }

  async toggleExportColumns(): Promise<void> {
    await this.exportColumnsToggle.click();
  }

  async toggleExportColumn(label: string): Promise<void> {
    await this.exportColumnLabels.filter({ hasText: exactText(label) }).click();
  }

  async exportColumnNames(): Promise<string[]> {
    return (await this.exportColumnLabels.allInnerTexts()).map((label) => label.trim());
  }
}
