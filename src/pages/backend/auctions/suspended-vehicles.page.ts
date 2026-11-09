import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  vin: 5,
  suspendReason: 12,
} as const;

/** Mazad back-office list of suspended vehicles (/backend/auction/suspend/index). */
export class SuspendedVehiclesPage extends BackendListPage {
  static readonly path = '/backend/auction/suspend/index';

  // Search form
  readonly vinInput: Locator;
  /** Text shown in the Suspend Reason select2 box (the selected option or the placeholder). */
  readonly suspendReasonValue: Locator;

  // Grid
  readonly vinCells: Locator;
  readonly suspendReasonCells: Locator;
  /** Rows that have a per-row Activate action (vehicles that can be activated). */
  readonly activatableRows: Locator;
  /**
   * Rows with no Activate action (suspended for "Inactive supplier"). No test changes these,
   * so they are safe to read while another spec activates or suspends vehicles.
   */
  readonly lockedRows: Locator;
  readonly bulkActivateButton: Locator;
  readonly bulkDeleteButton: Locator;

  // Activate confirmation modal
  readonly confirmModal: Locator;
  readonly confirmModalTitle: Locator;
  readonly confirmModalMessage: Locator;
  readonly confirmYesButton: Locator;
  readonly confirmCancelButton: Locator;

  constructor(page: Page) {
    super(page, SuspendedVehiclesPage.path, 'suspended');

    this.vinInput = this.searchForm.locator('#suspendsearch-vin_number');
    this.suspendReasonValue = this.filterValue('suspendsearch-suspend_reason_id');

    this.vinCells = this.columnCells(column.vin);
    this.suspendReasonCells = this.columnCells(column.suspendReason);
    const activateAction = page.locator('a.activate-auction-type');
    this.activatableRows = this.rows.filter({ has: activateAction });
    this.lockedRows = this.rows.filter({ hasNot: activateAction });
    const toolbar = this.grid.locator('.kv-grid-toolbar');
    this.bulkActivateButton = toolbar.locator('a.activate-auction-type');
    this.bulkDeleteButton = toolbar.locator('a.delete-auction-type-btn');

    this.confirmModal = page.locator('#modal-m');
    this.confirmModalTitle = this.confirmModal.locator('.modal-title');
    this.confirmModalMessage = this.confirmModal.locator('.modal-body');
    this.confirmYesButton = this.confirmModal.locator('button[type="submit"]');
    this.confirmCancelButton = this.confirmModal.locator('button[data-dismiss="modal"]');
  }

  rowVin(row: Locator): Locator {
    return this.rowCell(row, column.vin);
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.search();
  }

  async filterBySuspendReason(reason: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-suspendsearch-suspend_reason_id', reason);
    await this.search();
  }

  /** Opens the activate confirmation for a single row (the row's check-mark action). */
  async openActivateConfirmation(row: Locator): Promise<void> {
    await row.locator('a.activate-auction-type').click();
  }

  /** Activates one vehicle from its row action and confirms. */
  async activate(vehicleId: string): Promise<void> {
    await this.openActivateConfirmation(this.row(vehicleId));
    await this.confirmYesButton.click();
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
