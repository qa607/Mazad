import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import {
  type CancellationStatus,
  cancellationStatuses,
} from '@test-data/backend-car-cancellation.data';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  id: 0,
  customerName: 1,
  mobile: 2,
  title: 3,
  vin: 4,
  plate: 5,
  reason: 6,
  reasonText: 7,
  status: 8,
  supplier: 9,
  itemStatus: 10,
  requestDate: 11,
  updatedAt: 12,
} as const;

/** One car cancellation request as the list shows it. */
export interface CarCancellationRow {
  id: string;
  title: string;
  vin: string;
  reason: string;
  reasonText: string;
  /** Selected option of the row's status dropdown ("Pending", "Approve", "Decline"). */
  status: string;
  /** False when the request is decided and its status can no longer change. */
  statusEditable: boolean;
  supplier: string;
  /** The vehicle's own status ("sold", "failed"). */
  itemStatus: string;
  /** "2025-05-15 14:55:55" */
  requestDate: string;
  updatedAt: string;
}

/**
 * Mazad back-office "Car Cancellations" (/backend/requestCancellation/car-cancellation/index,
 * Request Cancellation > Car in the sidebar): customers' requests to cancel a car purchase. Each
 * row's status is a dropdown; changing it decides the request (Approve on a car moves the vehicle
 * to Failed), so tests never change it. Rows are keyed by request ID.
 */
export class CarCancellationPage extends BackendListPage {
  static readonly path = '/backend/requestCancellation/car-cancellation/index';
  private static readonly form = 'CarCancellationSearch';

  // Search form
  readonly requestIdInput: Locator;
  readonly vinInput: Locator;
  readonly titleInput: Locator;
  readonly statusValue: Locator;
  readonly customerTypeValue: Locator;
  readonly supplierValue: Locator;
  readonly reasonValue: Locator;

  // Grid
  readonly requestIdSortLink: Locator;
  readonly requestDateSortLink: Locator;

  constructor(page: Page) {
    super(page, CarCancellationPage.path, 'default-id');

    this.requestIdInput = this.searchForm.locator('#carcancellationsearch-id');
    this.vinInput = this.searchForm.locator('#carcancellationsearch-vin_number');
    this.titleInput = this.searchForm.locator('#carcancellationsearch-item_title');
    this.statusValue = this.filterValue('carcancellationsearch-status');
    this.customerTypeValue = this.filterValue('carcancellationsearch-customer_type');
    this.supplierValue = this.filterValue('carcancellationsearch-supplier');
    this.reasonValue = this.filterValue('carcancellationsearch-reason_id');

    this.requestIdSortLink = this.columnHeaders.locator('a', { hasText: /^Request Id$/ });
    this.requestDateSortLink = this.columnHeaders.locator('a', { hasText: /^Request Date$/ });
  }

  /** Opens the list with some filters set, by their form field names (e.g. "status"). */
  async gotoFiltered(filters: Record<string, string>): Promise<void> {
    const query = new URLSearchParams();
    for (const [field, value] of Object.entries(filters)) {
      query.set(`${CarCancellationPage.form}[${field}]`, value);
    }
    await this.page.goto(`${CarCancellationPage.path}?${query.toString()}`);
  }

  async searchByRequestId(id: string): Promise<void> {
    await this.requestIdInput.fill(id);
    await this.search();
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async searchByTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.search();
  }

  async filterByStatus(status: CancellationStatus): Promise<void> {
    await this.selectFilterOption(
      'field-carcancellationsearch-status',
      cancellationStatuses[status],
    );
    await this.search();
  }

  async filterByCustomerType(type: 'Individual' | 'Dealer'): Promise<void> {
    await this.selectFilterOption('field-carcancellationsearch-customer_type', type);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-carcancellationsearch-supplier', supplierOption);
    await this.search();
  }

  async filterByReason(reason: string): Promise<void> {
    await this.selectFilterOption('field-carcancellationsearch-reason_id', reason);
    await this.search();
  }

  /** Clicks a sortable header: the first click sorts ascending, the next descending. */
  async sortBy(column: 'Request Id' | 'Request Date'): Promise<void> {
    await this.clickAndWaitForPageLoad(
      column === 'Request Id' ? this.requestIdSortLink : this.requestDateSortLink,
    );
  }

  customerLink(row: Locator): Locator {
    return this.rowCell(row, column.customerName).locator('a');
  }

  vehicleLink(row: Locator): Locator {
    return this.rowCell(row, column.title).locator('a');
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<CarCancellationRow[]> {
    const rows: CarCancellationRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<CarCancellationRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const statusSelect = this.rowCell(row, column.status).locator('select');
    return {
      id: await cell(column.id),
      title: await cell(column.title),
      vin: await cell(column.vin),
      reason: await cell(column.reason),
      reasonText: await cell(column.reasonText),
      status: await statusSelect.evaluate(
        (select: HTMLSelectElement) => select.selectedOptions[0]?.text.trim() ?? '',
      ),
      statusEditable: await statusSelect.isEnabled(),
      supplier: await cell(column.supplier),
      itemStatus: await cell(column.itemStatus),
      requestDate: await cell(column.requestDate),
      updatedAt: await cell(column.updatedAt),
    };
  }
}
