import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

/** Mazad back-office "Ready For Pricing" auction list (/backend/auction/ready-for-pricing/index). */
export class ReadyForPricingPage extends BackendPage {
  static readonly path = '/backend/auction/ready-for-pricing/index';

  readonly pageHeading: Locator;
  readonly vinInput: Locator;
  readonly searchButton: Locator;
  readonly grid: Locator;
  readonly rows: Locator;
  readonly emptyMessage: Locator;

  // Suspend modal
  readonly suspendModal: Locator;
  readonly suspendModalTitle: Locator;
  readonly suspendModalSubmitButton: Locator;

  // Result alert (SweetAlert2)
  readonly resultAlertTitle: Locator;
  readonly resultAlertOkButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    const form = page.locator(`form[action="${ReadyForPricingPage.path}"]`);
    this.vinInput = form.locator('#readyforpricingsearch-vin_number');
    this.searchButton = form.locator('button[type="submit"]');

    this.grid = page.locator('#ready-for-pricing');
    this.rows = this.grid.locator('tbody tr[data-key]');
    this.emptyMessage = this.grid.locator('.empty');

    this.suspendModal = page.locator('#modal-m');
    this.suspendModalTitle = this.suspendModal.locator('.modal-title');
    this.suspendModalSubmitButton = this.suspendModal.locator(
      '#suspend-reason button[type="submit"]',
    );

    const alert = page.locator('.swal2-popup');
    this.resultAlertTitle = alert.locator('.swal2-title');
    this.resultAlertOkButton = alert.locator('.swal2-confirm');
  }

  async goto(): Promise<void> {
    await this.page.goto(ReadyForPricingPage.path);
  }

  row(vehicleId: string): Locator {
    return this.rows.and(this.page.locator(`[data-key="${vehicleId}"]`));
  }

  async searchByVin(vin: string): Promise<void> {
    await this.vinInput.fill(vin);
    await this.clickAndWaitForPageLoad(this.searchButton);
  }

  /** Suspends one vehicle with one of the suspend modal's reasons, from its row action. */
  async suspend(vehicleId: string, reason: string | RegExp): Promise<void> {
    await this.row(vehicleId).locator('a.suspend-btn').click();
    await this.suspendModal.locator('#suspend-reason label').filter({ hasText: reason }).click();
    await this.suspendModalSubmitButton.click();
  }
}
