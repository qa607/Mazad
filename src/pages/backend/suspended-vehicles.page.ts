import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  vin: 5,
  suspendReason: 12,
} as const;

/** Mazad back-office list of suspended vehicles (/backend/auction/suspend/index). */
export class SuspendedVehiclesPage extends BackendPage {
  static readonly path = '/backend/auction/suspend/index';

  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly sidebarLink: Locator;

  // Search form
  readonly vinInput: Locator;
  readonly suspendReasonSelect: Locator;
  /** Text shown in the Suspend Reason select2 box (the selected option or the placeholder). */
  readonly suspendReasonValue: Locator;
  readonly searchButton: Locator;
  readonly resetButton: Locator;

  // Grid
  readonly grid: Locator;
  /** "Showing 1-20 of 868 items." Not rendered when there are no results. */
  readonly summary: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  readonly vinCells: Locator;
  readonly suspendReasonCells: Locator;
  /** Rows that have a per-row Activate action (vehicles that can be activated). */
  readonly activatableRows: Locator;
  readonly emptyMessage: Locator;
  readonly activePage: Locator;
  readonly bulkActivateButton: Locator;
  readonly bulkDeleteButton: Locator;

  // Activate confirmation modal
  readonly confirmModal: Locator;
  readonly confirmModalTitle: Locator;
  readonly confirmModalMessage: Locator;
  readonly confirmYesButton: Locator;
  readonly confirmCancelButton: Locator;

  // Result alert (SweetAlert2)
  readonly resultAlert: Locator;
  readonly resultAlertTitle: Locator;
  readonly resultAlertSuccessIcon: Locator;
  readonly resultAlertOkButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.sidebarLink = page.locator(`.app-sidebar a[href="${SuspendedVehiclesPage.path}"]`);

    const form = page.locator(`form[action="${SuspendedVehiclesPage.path}"]`);
    this.vinInput = form.locator('#suspendsearch-vin_number');
    this.suspendReasonSelect = form.locator(
      '.field-suspendsearch-suspend_reason_id .select2-selection',
    );
    this.suspendReasonValue = form.locator('#select2-suspendsearch-suspend_reason_id-container');
    this.searchButton = form.locator('button[type="submit"]');
    this.resetButton = form.locator(`a[href="${SuspendedVehiclesPage.path}"]`);

    this.grid = page.locator('#suspended');
    this.summary = this.grid.locator('.summary');
    this.columnHeaders = this.grid.locator('thead tr').first().locator('th');
    this.rows = this.grid.locator('tbody tr[data-key]');
    this.vinCells = this.rows.locator(`td[data-col-seq="${column.vin}"]`);
    this.suspendReasonCells = this.rows.locator(`td[data-col-seq="${column.suspendReason}"]`);
    this.activatableRows = this.rows.filter({ has: page.locator('a.activate-auction-type') });
    this.emptyMessage = this.grid.locator('.empty');
    this.activePage = this.grid.locator('.pagination .page-item.active');
    const toolbar = this.grid.locator('.kv-grid-toolbar');
    this.bulkActivateButton = toolbar.locator('a.activate-auction-type');
    this.bulkDeleteButton = toolbar.locator('a.delete-auction-type-btn');

    this.confirmModal = page.locator('#modal-m');
    this.confirmModalTitle = this.confirmModal.locator('.modal-title');
    this.confirmModalMessage = this.confirmModal.locator('.modal-body');
    this.confirmYesButton = this.confirmModal.locator('button[type="submit"]');
    this.confirmCancelButton = this.confirmModal.locator('button[data-dismiss="modal"]');

    this.resultAlert = page.locator('.swal2-popup');
    this.resultAlertTitle = this.resultAlert.locator('.swal2-title');
    this.resultAlertSuccessIcon = this.resultAlert.locator('.swal2-icon.swal2-success');
    this.resultAlertOkButton = this.resultAlert.locator('.swal2-confirm');
  }

  async goto(): Promise<void> {
    await this.page.goto(SuspendedVehiclesPage.path);
  }

  row(vehicleId: string): Locator {
    return this.rows.and(this.page.locator(`[data-key="${vehicleId}"]`));
  }

  rowCheckbox(row: Locator): Locator {
    return row.locator('input.checkbox-row');
  }

  /** The vehicle ID of a grid row. */
  async rowId(row: Locator): Promise<string> {
    const id = await row.getAttribute('data-key');
    if (!id) throw new Error('Grid row has no data-key (vehicle ID).');
    return id;
  }

  rowVin(row: Locator): Locator {
    return row.locator(`td[data-col-seq="${column.vin}"]`);
  }

  pageLink(pageNumber: number): Locator {
    return this.grid.locator('.pagination a.page-link', { hasText: new RegExp(`^${pageNumber}$`) });
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async selectSuspendReason(reason: string | RegExp): Promise<void> {
    await this.suspendReasonSelect.click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: reason })
      .click();
  }

  async filterBySuspendReason(reason: string | RegExp): Promise<void> {
    await this.selectSuspendReason(reason);
    await this.search();
  }

  async search(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.searchButton);
  }

  async reset(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.resetButton);
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.clickAndWaitForPageLoad(this.pageLink(pageNumber));
  }

  /** Opens a page of the unfiltered list directly by URL. */
  async gotoPage(pageNumber: number): Promise<void> {
    await this.page.goto(`${SuspendedVehiclesPage.path}?page=${pageNumber}`);
  }

  /** Vehicle IDs of the rows on the current page, in grid order. */
  async rowIds(): Promise<string[]> {
    return this.rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key') ?? ''));
  }

  /** Opens the activate confirmation for a single row (the row's check-mark action). */
  async openActivateConfirmation(row: Locator): Promise<void> {
    await row.locator('a.activate-auction-type').click();
  }

  /** Total number of suspended vehicles matching the current filters (0 when none). */
  async totalCount(): Promise<number> {
    if ((await this.summary.count()) === 0) return 0;
    const total = await this.summary.locator('b').last().innerText();
    return Number(total.replace(/\D/g, ''));
  }

  /**
   * Starts counting activate requests that reach the server. Returns a function giving the
   * count so far, so tests can prove that cancelling sends nothing.
   */
  countActivateSubmissions(endpoint: string): () => number {
    let submissions = 0;
    this.page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes(endpoint)) submissions += 1;
    });
    return () => submissions;
  }
}
