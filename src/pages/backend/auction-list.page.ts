import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/backend-list.page';

/**
 * Parent of the priced auction lists (Pricing Done, Upcoming): a Make -> Model dependent filter,
 * row View/Update/Suspend actions, select-all, and the shared #modal-m that shows either the
 * suspend reason form or a Yes/Cancel confirmation.
 */
export abstract class AuctionListPage extends BackendListPage {
  // Search form
  /** Hidden select behind the Model select2 box; disabled until a make is chosen. */
  readonly modelSelect: Locator;
  readonly makeValue: Locator;
  readonly modelValue: Locator;

  // Grid
  readonly selectAllCheckbox: Locator;
  readonly rowCheckboxes: Locator;

  // Shared modal (#modal-m)
  readonly modal: Locator;
  readonly modalTitle: Locator;
  readonly suspendReasonLabels: Locator;
  readonly suspendReasonError: Locator;
  readonly suspendModalSubmitButton: Locator;
  readonly suspendModalCloseButton: Locator;
  readonly confirmModalMessage: Locator;
  readonly confirmYesButton: Locator;
  readonly confirmCancelButton: Locator;

  protected constructor(page: Page, listPath: string, gridId: string) {
    super(page, listPath, gridId);

    this.modelSelect = this.searchForm.locator('#model-id');
    this.makeValue = this.filterValue('make-id');
    this.modelValue = this.filterValue('model-id');

    this.selectAllCheckbox = this.grid.locator('thead input.select-on-check-all');
    this.rowCheckboxes = this.rows.locator('input.checkbox-row');

    this.modal = page.locator('#modal-m');
    this.modalTitle = this.modal.locator('.modal-title');
    const suspendForm = this.modal.locator('#suspend-reason');
    this.suspendReasonLabels = suspendForm.locator('#otherreasonvalidation-reason_id label');
    this.suspendReasonError = suspendForm.locator(
      '.field-otherreasonvalidation-reason_id .invalid-feedback',
    );
    this.suspendModalSubmitButton = suspendForm.locator('button[type="submit"]');
    this.suspendModalCloseButton = suspendForm.locator('button[data-dismiss="modal"]');
    const confirmForm = this.modal.locator('#confirm-modal');
    this.confirmModalMessage = confirmForm.locator('.modal-body');
    this.confirmYesButton = confirmForm.locator('button[type="submit"]');
    this.confirmCancelButton = confirmForm.locator('button[data-dismiss="modal"]');
  }

  /** Opens the list sorted by its own ID column, oldest first. */
  async gotoSortedById(): Promise<void> {
    await this.page.goto(`${this.listPath}?sort=id`);
  }

  rowViewLink(row: Locator): Locator {
    return row.locator('a[title="View"]');
  }

  rowUpdateLink(row: Locator): Locator {
    return row.locator('a[title="Update"]');
  }

  async chooseMake(make: string): Promise<void> {
    await this.selectFilterOption('field-make-id', make);
  }

  /** Picks a model. The model list loads after a make is chosen, so this waits for it. */
  async chooseModel(model: string): Promise<void> {
    await this.modelSelect
      .locator('option', { hasText: new RegExp(`^\\s*${model}\\s*$`) })
      .waitFor({ state: 'attached' });
    await this.selectFilterOption('field-model-id', model);
  }

  async filterByMakeAndModel(make: string, model: string): Promise<void> {
    await this.chooseMake(make);
    await this.chooseModel(model);
    await this.search();
  }

  async openSuspendModal(rowKey: string): Promise<void> {
    await this.row(rowKey).locator('a.suspend-btn').click();
  }

  /** Cancels the Yes/Cancel confirmation and waits until it has closed. */
  async cancelConfirmation(): Promise<void> {
    await this.closeModal(this.modal, this.confirmCancelButton);
  }

  /** Closes the suspend reason form without suspending and waits until it has closed. */
  async closeSuspendModal(): Promise<void> {
    await this.closeModal(this.modal, this.suspendModalCloseButton);
  }

  /**
   * Clicks a modal's close button until the modal is hidden. Bootstrap ignores a close click
   * made while the modal is still animating open, so a single click can be lost.
   */
  protected async closeModal(modal: Locator, closeButton: Locator): Promise<void> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (await closeButton.isVisible()) await closeButton.click();
      try {
        await modal.waitFor({ state: 'hidden', timeout: 1_000 });
        return;
      } catch {
        // Still open: the click landed during the opening animation. Try again.
      }
    }
  }

  /** Prices shown in a grid column, in grid order ("22,500 SR" -> 22500, "(not set)" -> 0). */
  protected async prices(cells: Locator): Promise<number[]> {
    return (await cells.allInnerTexts()).map((price) => Number(price.replace(/[^\d.]/g, '')));
  }
}
