import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { DatePicker } from '@pages/backend/components/date-picker.component';
import { riyadhCalendarDay } from '@utils/date';
import { exactText } from '@utils/text';

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

/** Link Type options of the Create form, as its dropdown shows them. */
export const advertisementLinkTypes = {
  internal: 'Internal (App Route)',
  external: 'External (URL)',
} as const;

/** What the Create form takes (Arabic fields, then their English twins). */
export interface AdvertisementInput {
  title: string;
  titleEn: string;
  subTitle: string;
  subTitleEn: string;
  btnText: string;
  btnTextEn: string;
  btnLink: string;
  btnLinkEn: string;
  linkType: keyof typeof advertisementLinkTypes;
  platform: AdvertisementPlatform;
  /** End Date, in days after today (Riyadh). */
  endInDays: number;
}

/**
 * Mazad back-office "Advertisements" (/backend/advertisement/advertisement/index, Content >
 * Advertisement): the banners shown to customers on the website and app. The list's Is Published
 * switch changes what customers see (only one advertisement is published at a time), so only the
 * QA-AUTO advertisement tests touch it, on their own advertisement; the other tests open the
 * Update form without saving and submit the Create form empty only. Rows are keyed by
 * advertisement ID. There is no Delete button: the delete action is sent as the page would.
 */
export class AdvertisementPage extends BackendListPage {
  static readonly path = '/backend/advertisement/advertisement/index';
  static readonly createPath = '/backend/advertisement/advertisement/create';
  /** Where the list's Is Published switch posts. */
  static readonly publishPath = '/backend/advertisement/ajax/update-is-published';
  private static readonly form = 'AdvertisementSearch';
  private readonly datePicker: DatePicker;

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
  readonly formEndDateInput: Locator;

  /** "Are you sure?" shown before the publish status changes (SweetAlert2). */
  readonly publishConfirmButton: Locator;

  constructor(page: Page) {
    super(page, AdvertisementPage.path, 'default-id');
    this.datePicker = new DatePicker(page);

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
    this.formEndDateInput = this.adForm.locator('#advertisement-end_date');

    this.publishConfirmButton = this.resultAlert.locator('.swal2-confirm');
  }

  /** A text field of the Create / Update form, by its attribute ("sub_title_en"). */
  formInput(attribute: string): Locator {
    return this.adForm.locator(`#advertisement-${attribute}`);
  }

  /** Picks an option of one of the form's select2 dropdowns, as a user does. */
  private async chooseFormOption(attribute: string, option: string): Promise<void> {
    await this.adForm.locator(`.field-advertisement-${attribute} .select2-selection`).click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: exactText(option) })
      .click();
  }

  /**
   * Creates an advertisement through the Create form (it is saved unpublished) and returns its
   * ID, read from the View page the form goes to.
   */
  async createAdvertisement(ad: AdvertisementInput): Promise<string> {
    await this.page.goto(AdvertisementPage.createPath);
    const texts: Record<string, string> = {
      title: ad.title,
      title_en: ad.titleEn,
      sub_title: ad.subTitle,
      sub_title_en: ad.subTitleEn,
      btn_text: ad.btnText,
      btn_text_en: ad.btnTextEn,
      btn_link: ad.btnLink,
      btn_link_en: ad.btnLinkEn,
    };
    for (const [attribute, value] of Object.entries(texts)) {
      await this.formInput(attribute).fill(value);
    }
    await this.chooseFormOption('link_type', advertisementLinkTypes[ad.linkType]);
    await this.chooseFormOption('platform', advertisementPlatforms[ad.platform]);
    const end = riyadhCalendarDay(ad.endInDays);
    await this.datePicker.pick(this.formEndDateInput, end.monthsAhead, end.day);
    await this.clickAndWaitForPageLoad(this.formSubmitButton);

    const id = new URL(this.page.url()).searchParams.get('id');
    if (!this.page.url().includes('/advertisement/view') || !id) {
      const errors = await this.formErrors.allInnerTexts();
      throw new Error(`The advertisement was not saved: ${errors.join(' ') || this.page.url()}`);
    }
    return id;
  }

  /** Opens the list filtered to one advertisement and returns its row as displayed. */
  async readAdvertisement(id: string): Promise<AdvertisementRow> {
    await this.gotoFiltered({ id });
    return this.readRow(this.row(id));
  }

  /** IDs of the published advertisements on the first page of the list. */
  async publishedIds(): Promise<string[]> {
    await this.goto();
    return (await this.readRows()).filter((row) => row.isPublished).map((row) => row.id);
  }

  /**
   * Publishes or unpublishes one advertisement with its list switch and the "Are you sure?"
   * confirmation, and waits for the server's answer. Does nothing when it already is so.
   * Publishing one unpublishes the others.
   */
  async setPublished(id: string, published: boolean): Promise<void> {
    if ((await this.readAdvertisement(id)).isPublished === published) return;
    await this.rowCell(this.row(id), column.isPublished).locator('.cbx').click();
    await Promise.all([
      this.page.waitForResponse(
        (response) => response.url().includes(AdvertisementPage.publishPath) && response.ok(),
      ),
      this.publishConfirmButton.click(),
    ]);
  }

  /**
   * Deletes one advertisement by sending what a delete link would (the list has none): the server
   * marks it Deleted. Returns the HTTP status (302 back to the list when it is done).
   */
  async deleteAdvertisement(id: string): Promise<number> {
    await this.goto();
    return this.postAction(`/backend/advertisement/advertisement/delete?id=${id}`);
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
