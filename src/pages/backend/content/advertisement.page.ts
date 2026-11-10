import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  id: 0,
  title: 1,
  titleEn: 2,
  clickCount: 3,
  isPublished: 4,
  createdAt: 5,
  updatedAt: 6,
} as const;

/** One advertisement as the list shows it. */
export interface AdvertisementRow {
  id: string;
  title: string;
  titleEn: string;
  clickCount: number;
  /** State of the row's Is Published switch, and whether it can be changed from the list. */
  isPublished: boolean;
  publishSwitchEnabled: boolean;
  /** "2026-07-28 16:17:15" */
  createdAt: string;
  updatedAt: string;
}

export const advertisementPlatforms = {
  both: 'Both',
  mobile: 'Mobile',
  web: 'Web',
} as const;

export type AdvertisementPlatform = keyof typeof advertisementPlatforms;

/**
 * Mazad back-office "Advertisements" (/backend/advertisement/advertisement/index, Content >
 * Advertisement): the banners shown to customers on the website and app. The list's Is Published
 * switch changes what customers see, so tests never touch it; they open the Update form without
 * saving and submit the Create form empty only. Rows are keyed by advertisement ID.
 */
export class AdvertisementPage extends BackendListPage {
  static readonly path = '/backend/advertisement/advertisement/index';
  static readonly createPath = '/backend/advertisement/advertisement/create';
  private static readonly form = 'AdvertisementSearch';

  // Search form
  readonly createButton: Locator;
  readonly idInput: Locator;
  readonly titleInput: Locator;
  readonly titleEnInput: Locator;
  readonly platformValue: Locator;
  readonly platformOptions: Locator;

  // Grid
  readonly clickCountSortLink: Locator;

  // View page (a "detail-view" table of label/value rows)
  readonly detailLabels: Locator;

  // Create / Update form
  readonly adForm: Locator;
  readonly formTitleInput: Locator;
  readonly formTitleEnInput: Locator;
  readonly formSubmitButton: Locator;
  readonly formErrors: Locator;

  constructor(page: Page) {
    super(page, AdvertisementPage.path, 'default-id');

    this.createButton = this.searchForm.locator(`a[href="${AdvertisementPage.createPath}"]`);
    this.idInput = this.searchForm.locator('#advertisementsearch-id');
    this.titleInput = this.searchForm.locator('#advertisementsearch-title');
    this.titleEnInput = this.searchForm.locator('#advertisementsearch-title_en');
    this.platformValue = this.filterValue('advertisementsearch-platform');
    this.platformOptions = this.searchForm.locator('#advertisementsearch-platform option');

    this.clickCountSortLink = this.columnHeaders.locator('a', { hasText: /^Click Count$/ });

    this.detailLabels = page.locator('.detail-view th');

    // The Create or Update form only (the page also holds a hidden Import form).
    this.adForm = page.locator(
      'form[action*="/advertisement/advertisement/create"], form[action*="/advertisement/advertisement/update"]',
    );
    this.formTitleInput = this.adForm.locator('#advertisement-title');
    this.formTitleEnInput = this.adForm.locator('#advertisement-title_en');
    this.formSubmitButton = this.adForm.locator('button[type="submit"]');
    this.formErrors = this.adForm.locator('.invalid-feedback').filter({ hasText: /\S/ });
  }

  viewPath(id: string): string {
    return `/backend/advertisement/advertisement/view?id=${id}`;
  }

  updatePath(id: string): string {
    return `/backend/advertisement/advertisement/update?id=${id}`;
  }

  async gotoFiltered(filters: Record<string, string>): Promise<void> {
    const query = new URLSearchParams();
    for (const [field, value] of Object.entries(filters)) {
      query.set(`${AdvertisementPage.form}[${field}]`, value);
    }
    await this.page.goto(`${AdvertisementPage.path}?${query.toString()}`);
  }

  async searchBy(field: 'idInput' | 'titleInput' | 'titleEnInput', value: string): Promise<void> {
    await this[field].fill(value);
    await this.search();
  }

  async filterByPlatform(platform: AdvertisementPlatform): Promise<void> {
    await this.selectFilterOption(
      'field-advertisementsearch-platform',
      advertisementPlatforms[platform],
    );
    await this.search();
  }

  /** Clicks the Click Count header: the first click sorts ascending, the next descending. */
  async sortByClickCount(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.clickCountSortLink);
  }

  /** A value of the View page, by its label ("Platform", "Is Published", "End Date"...). */
  detailValue(label: string): Locator {
    return this.page
      .locator('.detail-view tr', {
        has: this.page.locator('th', { hasText: new RegExp(`^${label}$`) }),
      })
      .locator('td');
  }

  fieldError(inputId: string): Locator {
    return this.adForm.locator(`.field-${inputId} .invalid-feedback`);
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<AdvertisementRow[]> {
    const rows: AdvertisementRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<AdvertisementRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const publishSwitch = this.rowCell(row, column.isPublished).locator('input[type="checkbox"]');
    return {
      id: await cell(column.id),
      title: await cell(column.title),
      titleEn: await cell(column.titleEn),
      clickCount: Number((await cell(column.clickCount)).replace(/\D/g, '')),
      isPublished: await publishSwitch.isChecked(),
      publishSwitchEnabled: await publishSwitch.isEnabled(),
      createdAt: await cell(column.createdAt),
      updatedAt: await cell(column.updatedAt),
    };
  }
}
