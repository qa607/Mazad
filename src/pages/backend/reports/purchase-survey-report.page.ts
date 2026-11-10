import type { Locator, Page, Response } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { escapeRegExp } from '@utils/text';
import { type SurveyQuestion, surveyQuestions } from '@test-data/backend-purchase-survey-report.data';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  customerType: 1,
  customerName: 2,
  itemTitle: 3,
  answers: 4,
  supplier: 5,
  createdAt: 6,
} as const;

/** A score as shown: "6/7" -> { score: 6, outOf: 7 }. */
export interface SurveyScore {
  score: number;
  outOf: number;
}

/** One survey answer as the report shows it. */
export interface SurveyRow {
  key: string;
  customerType: string;
  customerName: string;
  itemTitle: string;
  easeOfUse: SurveyScore | null;
  satisfaction: SurveyScore | null;
  recommend: SurveyScore | null;
  /** Free-text "Other" answer, or "" when there is none. */
  other: string;
  supplier: string;
  /** "2026-11-03 08:40:31" */
  createdAt: string;
}


/**
 * Mazad back-office "Purchase Survey Report" (/backend/report/purchase-survey-report/index,
 * Report > Purchase Survey in the sidebar): one row per buyer survey after a purchase, with three
 * scores and an optional free-text answer. Rows are keyed by survey ID.
 */
export class PurchaseSurveyReportPage extends BackendListPage {
  static readonly path = '/backend/report/purchase-survey-report/index';
  private static readonly form = 'PurchaseSurveyReportSearch';

  // Search form
  readonly customerTypeValue: Locator;
  readonly supplierValue: Locator;
  readonly questionValue: Locator;
  readonly fromAnswerInput: Locator;
  readonly toAnswerInput: Locator;
  readonly fromAnswerError: Locator;
  readonly toAnswerError: Locator;

  // Grid
  readonly exportAllButton: Locator;
  readonly exportCsvLink: Locator;
  readonly exportConfirmDialog: Locator;

  constructor(page: Page) {
    super(page, PurchaseSurveyReportPage.path, 'default-id');

    this.customerTypeValue = this.filterValue('purchasesurveyreportsearch-user_type');
    this.supplierValue = this.filterValue('purchasesurveyreportsearch-supplier_id');
    this.questionValue = this.filterValue('purchasesurveyreportsearch-question_title');
    this.fromAnswerInput = this.searchForm.locator('#purchasesurveyreportsearch-from_answer');
    this.toAnswerInput = this.searchForm.locator('#purchasesurveyreportsearch-to_answer');
    this.fromAnswerError = this.searchForm.locator(
      '.field-purchasesurveyreportsearch-from_answer .invalid-feedback',
    );
    this.toAnswerError = this.searchForm.locator(
      '.field-purchasesurveyreportsearch-to_answer .invalid-feedback',
    );

    this.exportAllButton = this.grid.locator('.kv-grid-toolbar button', { hasText: 'Export All' });
    this.exportCsvLink = this.grid.locator('.kv-grid-toolbar .export-full-csv');
    this.exportConfirmDialog = page.locator('.bootstrap-dialog.show');
  }

  async filterByCustomerType(type: 'Individual' | 'Dealer'): Promise<void> {
    await this.selectFilterOption('field-purchasesurveyreportsearch-user_type', type);
    await this.search();
  }

  async filterBySupplier(supplierOption: string | RegExp): Promise<void> {
    await this.selectFilterOption('field-purchasesurveyreportsearch-supplier_id', supplierOption);
    await this.search();
  }

  /** Chooses a question and fills the score range, without searching. */
  async enterAnswerFilter(question: SurveyQuestion, from?: string, to?: string): Promise<void> {
    await this.selectFilterOption(
      'field-purchasesurveyreportsearch-question_title',
      surveyQuestions[question].label,
    );
    if (from !== undefined) await this.fromAnswerInput.fill(from);
    if (to !== undefined) await this.toAnswerInput.fill(to);
  }

  /** Filters by one question and, for a scored question, a score range (both ends included). */
  async filterByAnswer(question: SurveyQuestion, from?: string, to?: string): Promise<void> {
    await this.enterAnswerFilter(question, from, to);
    await this.search();
  }

  /**
   * Picks a value in one of the search-as-you-type filters (customer name, item title). It types
   * the first words only and picks the option equal to the whole value, ignoring repeated
   * spaces: titles are stored with double spaces ("Toyota Hilux  2022") that the grid hides.
   */
  private async pickSuggestion(field: string, value: string): Promise<void> {
    const words = value.trim().split(/\s+/);
    const typed = words.slice(0, Math.min(2, words.length)).join(' ');
    const whole = new RegExp(`^\\s*${words.map(escapeRegExp).join('\\s+')}\\s*$`);
    await this.pickSearchSuggestion(field, typed, whole);
    await this.search();
  }

  async filterByCustomerName(name: string): Promise<void> {
    await this.pickSuggestion('field-purchasesurveyreportsearch-customer_name', name);
  }

  async filterByItemTitle(title: string): Promise<void> {
    await this.pickSuggestion('field-purchasesurveyreportsearch-item_title', title);
  }

  /** Every row on the current page, read into values. */
  async readRows(): Promise<SurveyRow[]> {
    const rows: SurveyRow[] = [];
    for (const row of await this.rows.all()) rows.push(await this.readRow(row));
    return rows;
  }

  async readRow(row: Locator): Promise<SurveyRow> {
    const cell = async (seq: number) =>
      (await this.rowCell(row, seq).innerText()).replace(/\s+/g, ' ').trim();
    const answers = await cell(column.answers);
    const score = (label: string): SurveyScore | null => {
      const escaped = label.replace(/[?()]/g, '\\$&');
      const match = answers.match(new RegExp(`${escaped} (\\d+)/(\\d+)`));
      return match ? { score: Number(match[1]), outOf: Number(match[2]) } : null;
    };
    return {
      key: await this.rowId(row),
      customerType: await cell(column.customerType),
      customerName: await cell(column.customerName),
      itemTitle: await cell(column.itemTitle),
      easeOfUse: score(surveyQuestions.easeOfUse.label),
      satisfaction: score(surveyQuestions.satisfaction.label),
      recommend: score(surveyQuestions.recommend.label),
      other: answers.match(/Other (.*)$/)?.[1]?.trim() ?? '',
      supplier: await cell(column.supplier),
      createdAt: await cell(column.createdAt),
    };
  }

  /** Starts the CSV export (Export All > CSV > Ok) and returns the server's response. */
  async requestCsvExport(): Promise<Response> {
    await this.exportAllButton.click();
    await this.exportCsvLink.click();
    await this.exportConfirmDialog.waitFor();
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes(PurchaseSurveyReportPage.path),
      { timeout: 90_000 },
    );
    await this.exportConfirmDialog.getByRole('button', { name: /Ok/ }).click();
    return response;
  }
}
