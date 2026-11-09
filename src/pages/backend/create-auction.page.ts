import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

/** Endpoint the wizard posts to, both for live field validation and for the final submit. */
const CREATE_ENDPOINT = '/auction/ajax/create-auction';

/**
 * Mazad back-office "Create Auction" wizard (/backend/auction/upcoming/create): step 1 is the
 * auction configuration, step 2 ("Next: Select Cars") picks the vehicles of the chosen supplier.
 */
export class CreateAuctionPage extends BackendPage {
  static readonly path = '/backend/auction/upcoming/create';

  readonly pageHeading: Locator;
  readonly breadcrumbCurrent: Locator;
  readonly form: Locator;
  readonly step1Tab: Locator;
  readonly step2Tab: Locator;
  readonly cancelLink: Locator;

  // Step 1: configuration
  readonly auctionTypeSelect: Locator;
  readonly featuredTypeSelect: Locator;
  /** Fields shown only for a featured auction (About, Terms, entry fee, participants...). */
  readonly featuredAboutInput: Locator;
  readonly supplierValue: Locator;
  readonly titleInput: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly startTimeInput: Locator;
  readonly endTimeInput: Locator;
  readonly nextButton: Locator;

  // Step 2: select cars
  readonly carSourceLabels: Locator;
  readonly noSupplierMessage: Locator;
  readonly vinFilterInput: Locator;
  readonly filterSearchButton: Locator;
  readonly filterResetButton: Locator;
  readonly selectAllButton: Locator;
  readonly totalVehicleCount: Locator;
  readonly vehicleRows: Locator;
  readonly vehicleCheckboxes: Locator;
  readonly backToConfigurationButton: Locator;
  readonly createAuctionButton: Locator;

  // Result alert (SweetAlert2)
  readonly alert: Locator;
  readonly alertTitle: Locator;
  readonly alertMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.breadcrumbCurrent = page.locator('.breadcrumb .breadcrumb-item.active');
    this.form = page.locator('#create-auction-form');
    this.step1Tab = this.form.locator('#step-1-tab');
    this.step2Tab = this.form.locator('#step-2-tab');
    this.cancelLink = this.form.locator('a.btn', { hasText: /^Cancel$/ });

    this.auctionTypeSelect = this.form.locator('#auction-type-select');
    this.featuredTypeSelect = this.form.locator('#featured-type-select');
    // The textarea itself stays hidden behind a rich-text editor; its field container shows.
    this.featuredAboutInput = this.form.locator('.field-auctionfeatured-about_en');
    this.supplierValue = this.form.locator('#select2-supplier-select-container');
    this.titleInput = this.form.locator('#auction-title');
    this.startDateInput = this.form.locator('#auction-start_item_date');
    this.endDateInput = this.form.locator('#auction-end_item_date');
    this.startTimeInput = this.form.locator('#auction-start_item_time');
    this.endTimeInput = this.form.locator('#auction-end_item_time');
    this.nextButton = this.form.getByRole('button', { name: /Next: Select Cars/ });

    const step2 = this.form.locator('#step-2');
    this.carSourceLabels = step2.locator('label:has(input[name="status_filter"])');
    this.noSupplierMessage = step2.getByText(
      'Please select a supplier from Step 1 to load vehicles.',
    );
    this.vinFilterInput = step2.locator('#vehicle-filter-vin-number');
    this.filterSearchButton = step2.locator('#vehicle-filter-search');
    this.filterResetButton = step2.locator('#vehicle-filter-reset');
    this.selectAllButton = step2.getByRole('button', { name: 'Select All' });
    this.totalVehicleCount = step2.locator('#total-vehicle-count');
    this.vehicleRows = step2.locator('#selected-items-grid tbody tr:has(input.checkbox-row)');
    this.vehicleCheckboxes = this.vehicleRows.locator('input.checkbox-row');
    this.backToConfigurationButton = this.form.getByRole('button', {
      name: /Back to Configuration/,
    });
    this.createAuctionButton = this.form.locator('#create-auction-btn');

    this.alert = page.locator('.swal2-popup');
    this.alertTitle = this.alert.locator('.swal2-title');
    this.alertMessage = this.alert.locator('.swal2-html-container, .swal2-content');
  }

  async goto(): Promise<void> {
    await this.page.goto(CreateAuctionPage.path);
  }

  /** Validation message under a step-1 field, by the field's input id (e.g. "auction-title"). */
  fieldError(inputId: string): Locator {
    return this.form.locator(`.field-${inputId} .invalid-feedback`);
  }

  /** Visible validation messages on the form. */
  get visibleErrors(): Locator {
    return this.form.locator('.invalid-feedback:visible').filter({ hasText: /\S/ });
  }

  /** Vehicle rows in step 2 whose text contains a VIN. */
  vehicleRow(vin: string): Locator {
    return this.vehicleRows.filter({ hasText: vin });
  }

  async chooseAuctionType(type: 'Normal Auction' | 'Featured Auction'): Promise<void> {
    await this.auctionTypeSelect.selectOption({ label: type });
  }

  /** Picks a supplier by its exact name; its vehicles load for step 2. */
  async chooseSupplier(name: string): Promise<void> {
    await this.form.locator('#supplier-select + .select2 .select2-selection').click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
      .click();
  }

  /**
   * Picks a date in a field's calendar, as a user does: opens it, moves forward `monthsAhead`
   * months, then clicks the day.
   */
  async pickDate(field: Locator, monthsAhead: number, day: number): Promise<void> {
    await field.click();
    const calendar = this.page.locator('.datepicker-dropdown:visible .datepicker-days');
    for (let month = 0; month < monthsAhead; month++) await calendar.locator('th.next').click();
    await calendar
      .locator('td.day:not(.old):not(.new)', { hasText: new RegExp(`^${day}$`) })
      .click();
  }

  /** Fills step 1 with a normal auction; dates are days of the month `monthsAhead` from now. */
  async fillConfiguration(options: {
    title: string;
    supplier?: string;
    monthsAhead?: number;
    startDay: number;
    endDay: number;
  }): Promise<void> {
    const monthsAhead = options.monthsAhead ?? 1;
    await this.chooseAuctionType('Normal Auction');
    if (options.supplier) await this.chooseSupplier(options.supplier);
    await this.titleInput.fill(options.title);
    await this.pickDate(this.startDateInput, monthsAhead, options.startDay);
    await this.pickDate(this.endDateInput, monthsAhead, options.endDay);
  }

  /** Goes to step 2. With a supplier chosen, waits for its vehicle list to load. */
  async goToSelectCars(): Promise<void> {
    await this.nextButton.click();
    await this.backToConfigurationButton.waitFor();
  }

  /** Switches the step-2 Car Source ("Upcoming" or "Failed") and waits for the list to reload. */
  async chooseCarSource(source: 'Upcoming' | 'Failed'): Promise<void> {
    const loaded = this.page.waitForResponse(
      (response) =>
        response.url().includes('/auction/ajax/fetch-vehicles') &&
        response.url().includes(`status_filter=${source.toLowerCase()}`),
    );
    await this.carSourceLabels.filter({ hasText: source }).click();
    await loaded;
  }

  /** Ticks one vehicle in the step-2 list. */
  async selectVehicle(vin: string): Promise<void> {
    await this.vehicleRow(vin).locator('input.checkbox-row').check();
  }

  async filterVehiclesByVin(vin: string): Promise<void> {
    await this.vinFilterInput.fill(vin);
    await this.filterSearchButton.click();
  }

  /**
   * Starts counting real submits of the wizard (POSTs to the create endpoint that are not the
   * form's live field validation, which posts with "ajax=create-auction-form").
   */
  countCreateSubmissions(): () => number {
    let submissions = 0;
    this.page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes(CREATE_ENDPOINT) &&
        !/(^|&)ajax=/.test(request.postData() ?? '')
      ) {
        submissions += 1;
      }
    });
    return () => submissions;
  }
}
