import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/** Grid columns, by their data-col-seq attribute (0 is the row number). */
const column = {
  id: 1,
  question: 2,
  questionEn: 3,
  isActive: 4,
  from: 5,
  to: 6,
  createdAt: 7,
  updatedAt: 8,
} as const;

/** One survey question as the list shows it. */
export interface SurveyQuestionRow {
  id: string;
  question: string;
  questionEn: string;
  /** "Yes" / "No" */
  isActive: string;
  /** The answer scale: from 1 to 7, for example. */
  from: number;
  to: number;
  /** "2023-07-05 18:08:02" */
  createdAt: string;
  updatedAt: string;
}

/** Inputs of the Add Question / Update form, by field. */
export const questionFormFields = {
  question: 'confirmdeliverysurvey-question',
  questionEn: 'confirmdeliverysurvey-question_en',
  from: 'confirmdeliverysurvey-from',
  to: 'confirmdeliverysurvey-to',
  isActive: 'confirmdeliverysurvey-is_active',
} as const;

export type QuestionFormField = keyof typeof questionFormFields;

/**
 * Mazad back-office "Confirm Delivery Survey" (/backend/survey/confirm-delivery-survey/index,
 * Survey > Confirm Delivery): the questions a buyer answers after confirming delivery, each with
 * an answer scale (From / To). Rows are keyed by question ID. Editing a question changes the live
 * survey, so tests open the forms without saving and submit them only while they are invalid.
 */
export class ConfirmDeliverySurveyPage extends BackendListPage {
  static readonly path = '/backend/survey/confirm-delivery-survey/index';
  static readonly createPath = '/backend/survey/confirm-delivery-survey/create';
  private static readonly form = 'ConfirmDeliverySurveySearch';

  // Search form
  readonly addQuestionButton: Locator;
  readonly questionInput: Locator;
  readonly questionEnInput: Locator;

  // View page (a "detail-view" table of label/value rows)
  readonly detailLabels: Locator;

  // Add Question / Update form
  readonly questionForm: Locator;
  readonly formSaveButton: Locator;
  readonly formCancelButton: Locator;
  readonly formErrors: Locator;

  constructor(page: Page) {
    super(page, ConfirmDeliverySurveyPage.path, 'default-id');

    this.addQuestionButton = this.searchForm.locator(
      `a[href="${ConfirmDeliverySurveyPage.createPath}"]`,
    );
    this.questionInput = this.searchForm.locator('#confirmdeliverysurveysearch-question');
    this.questionEnInput = this.searchForm.locator('#confirmdeliverysurveysearch-question_en');

    this.detailLabels = page.locator('.detail-view th');

    // The Add Question or Update form only (the page also holds hidden upload and import forms).
    this.questionForm = page.locator(
      'form[action*="/confirm-delivery-survey/create"], form[action*="/confirm-delivery-survey/update"]',
    );
    this.formSaveButton = this.questionForm.locator('button[type="submit"]');
    this.formCancelButton = this.questionForm.locator(
      `a[href="${ConfirmDeliverySurveyPage.path}"]`,
    );
    this.formErrors = this.questionForm.locator('.invalid-feedback').filter({ hasText: /\S/ });
  }

  viewPath(id: string): string {
    return `/backend/survey/confirm-delivery-survey/view?id=${id}`;
  }

  updatePath(id: string): string {
    return `/backend/survey/confirm-delivery-survey/update?id=${id}`;
  }

  async gotoFiltered(filters: Record<string, string>): Promise<void> {
    const query = new URLSearchParams();
    for (const [field, value] of Object.entries(filters)) {
      query.set(`${ConfirmDeliverySurveyPage.form}[${field}]`, value);
    }
    await this.page.goto(`${ConfirmDeliverySurveyPage.path}?${query.toString()}`);
  }

  async gotoSorted(sort: string): Promise<void> {
    await this.page.goto(`${ConfirmDeliverySurveyPage.path}?sort=${sort}`);
  }

  /** A grid header's sort link ("ID", "From", "To"...). */
  sortLink(header: string): Locator {
    return this.columnHeaders.locator('a', { hasText: new RegExp(`^${header}$`) });
  }

  /** Clicks a header: the first click sorts ascending, the next descending. */
  async sortBy(header: string): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(header));
  }

  async searchBy(field: 'questionInput' | 'questionEnInput', value: string): Promise<void> {
    await this[field].fill(value);
    await this.search();
  }

  /** A value of the View page, by its label ("Question En", "From", "Is Active"...). */
  detailValue(label: string): Locator {
    return this.page
      .locator('.detail-view tr', {
        has: this.page.locator('th', { hasText: new RegExp(`^${label}$`) }),
      })
      .locator('td');
  }

  formInput(field: QuestionFormField): Locator {
    return this.questionForm.locator(`#${questionFormFields[field]}`);
  }

  fieldError(field: QuestionFormField): Locator {
    return this.questionForm.locator(`.field-${questionFormFields[field]} .invalid-feedback`);
  }

  /** Fills the given fields of the Add Question form and presses Save. */
  async submitQuestionForm(values: Partial<Record<QuestionFormField, string>>): Promise<void> {
    for (const [field, value] of Object.entries(values) as [QuestionFormField, string][]) {
      await this.formInput(field).fill(value);
    }
    await this.formSaveButton.click();
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<SurveyQuestionRow[]> {
    const rows: SurveyQuestionRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<SurveyQuestionRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    return {
      id: await cell(column.id),
      question: await cell(column.question),
      questionEn: await cell(column.questionEn),
      isActive: await cell(column.isActive),
      from: Number(await cell(column.from)),
      to: Number(await cell(column.to)),
      createdAt: await cell(column.createdAt),
      updatedAt: await cell(column.updatedAt),
    };
  }
}
