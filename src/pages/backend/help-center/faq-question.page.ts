import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import type { FaqQuestionData } from '@test-data/faq.data';
import { exactText } from '@utils/text';

const BASE = '/backend/helpCenter/faq-question';

/** Grid columns, by their data-col-seq attribute. */
const column = { category: 1, published: 2, question: 3, questionEn: 4, actions: 7 } as const;

/**
 * Help Center > Faq Questions (/backend/helpCenter/faq-question/*): the list (filter by
 * Category, Question, Question En and Is Published; an Is Published switch per row), the
 * create / update form ("Save & Publish" or "Save" as unpublished) and a question's View page.
 * The switch asks for confirmation in a SweetAlert popup (the inherited resultAlert locators)
 * and saves with an AJAX request. Rows are keyed by question ID.
 */
export class FaqQuestionPage extends BackendListPage {
  static readonly path = `${BASE}/index`;

  // List
  readonly createButton: Locator;
  readonly filterLabels: Locator;
  /** Selected Category / Is Published filter (select2); read their title attribute. */
  readonly categoryFilterValue: Locator;
  readonly publishedFilterValue: Locator;
  readonly questionSearchInput: Locator;
  readonly questionEnSearchInput: Locator;
  readonly categoryCells: Locator;
  readonly questionCells: Locator;
  readonly questionEnCells: Locator;
  /** Each row's Is Published state (hidden checkbox behind the switch). */
  readonly publishedStates: Locator;
  /** Text of the SweetAlert popup (below its title). */
  readonly resultAlertText: Locator;
  readonly deleteDialog: ConfirmDialog;

  // Form
  readonly form: Locator;
  readonly categoryValue: Locator;
  readonly questionInput: Locator;
  readonly questionEnInput: Locator;
  readonly answerInput: Locator;
  readonly answerEnInput: Locator;
  readonly categoryError: Locator;
  readonly questionError: Locator;
  readonly questionEnError: Locator;
  readonly answerError: Locator;
  readonly answerEnError: Locator;
  readonly saveAndPublishButton: Locator;
  /** "Save": saves without publishing. */
  readonly saveButton: Locator;

  // View
  readonly details: Locator;

  constructor(page: Page) {
    super(page, FaqQuestionPage.path, 'default-id');
    this.createButton = this.searchForm.locator(`a[href="${BASE}/create"]`);
    this.filterLabels = this.searchForm.locator('.form-row label');
    this.categoryFilterValue = this.filterValue('faqquestionsearch-category_id');
    this.publishedFilterValue = this.filterValue('faqquestionsearch-is_published');
    this.questionSearchInput = this.searchForm.locator('#faqquestionsearch-question');
    this.questionEnSearchInput = this.searchForm.locator('#faqquestionsearch-question_en');
    this.categoryCells = this.columnCells(column.category);
    this.questionCells = this.columnCells(column.question);
    this.questionEnCells = this.columnCells(column.questionEn);
    this.publishedStates = this.columnCells(column.published).locator(
      'input.update-faq-question-is-published',
    );
    this.resultAlertText = this.resultAlert.locator('.swal2-html-container');
    this.deleteDialog = new ConfirmDialog(page);

    this.form = page.locator('form', { has: page.locator('#faqquestion-question') });
    this.categoryValue = this.form.locator('#select2-faqquestion-category_id-container');
    this.questionInput = this.form.locator('#faqquestion-question');
    this.questionEnInput = this.form.locator('#faqquestion-question_en');
    this.answerInput = this.form.locator('#faqquestion-answer');
    this.answerEnInput = this.form.locator('#faqquestion-answer_en');
    const error = (field: string) =>
      this.form.locator(`.field-faqquestion-${field} .invalid-feedback`);
    this.categoryError = error('category_id');
    this.questionError = error('question');
    this.questionEnError = error('question_en');
    this.answerError = error('answer');
    this.answerEnError = error('answer_en');
    this.saveAndPublishButton = this.form.locator('button[name="save"]');
    this.saveButton = this.form.locator('button[name="save_pending"]');

    this.details = page.locator('table.detail-view');
  }

  // ---- List ----

  /** Opens the list with search parameters; is_published "-1" lists every question. */
  async gotoSearch(
    query: Partial<Record<'category_id' | 'question' | 'question_en' | 'is_published', string>>,
  ) {
    const params = new URLSearchParams(
      Object.entries(query).map(([field, value]) => [`FaqQuestionSearch[${field}]`, value]),
    );
    await this.page.goto(`${FaqQuestionPage.path}?${params.toString()}`);
  }

  /** Rows whose Question En is exactly this text. */
  rowsTitledEn(questionEn: string): Locator {
    return this.rows.filter({
      has: this.page.locator(`td[data-col-seq="${column.questionEn}"]`, {
        hasText: exactText(questionEn),
      }),
    });
  }

  categoryCell(row: Locator): Locator {
    return this.rowCell(row, column.category);
  }

  questionCell(row: Locator): Locator {
    return this.rowCell(row, column.question);
  }

  questionEnCell(row: Locator): Locator {
    return this.rowCell(row, column.questionEn);
  }

  publishedState(row: Locator): Locator {
    return this.rowCell(row, column.published).locator('input.update-faq-question-is-published');
  }

  /** The row's action links (View, Update, Delete), in display order. */
  actionLinks(row: Locator): Locator {
    return this.rowCell(row, column.actions).locator('a');
  }

  deleteLink(id: string): Locator {
    return this.row(id).locator(`a[href="${BASE}/delete?id=${id}"]`);
  }

  /** Clicks Create Faq Question and waits for the form. */
  async openCreateForm(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.createButton);
  }

  async searchByQuestion(question: string): Promise<void> {
    await this.questionSearchInput.fill(question);
    await this.search();
  }

  async searchByQuestionEn(questionEn: string): Promise<void> {
    await this.questionEnSearchInput.fill(questionEn);
    await this.search();
  }

  /** Picks a Category filter option (by its English name) and searches. */
  async filterByCategory(categoryNameEn: string): Promise<void> {
    await this.selectFilterOption('field-faqquestionsearch-category_id', categoryNameEn);
    await this.search();
  }

  /** Picks an Is Published filter option ("All", "Yes", "No") and searches. */
  async filterByPublished(option: string): Promise<void> {
    await this.selectFilterOption('field-faqquestionsearch-is_published', option);
    await this.search();
  }

  /** Whether each row on the current page is published, in grid order. */
  async publishedValues(): Promise<boolean[]> {
    return this.publishedStates.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).checked),
    );
  }

  /** Clicks a row's Is Published switch, which opens the "Are you sure?" popup. */
  async clickPublishedSwitch(id: string): Promise<void> {
    await this.rowCell(this.row(id), column.published).locator('.cbx').click();
  }

  /** Confirms the open "Are you sure?" popup and returns the server's message. */
  async confirmPublishedChange(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) =>
        r.url().includes('/helpCenter/ajax/update-faq-question-is-published'),
      ),
      this.resultAlertOkButton.click(),
    ]);
    const body = (await response.json()) as { msg?: unknown };
    return typeof body.msg === 'string' ? body.msg : '';
  }

  /** Clicks a row's Delete, which opens the Confirmation dialog. */
  async openDeleteConfirmation(id: string): Promise<void> {
    await this.deleteLink(id).click();
  }

  /**
   * Deletes a question from the grid, filtered to its Question En (any status) so its row is
   * on the page, and confirms. The list reloads with a message.
   */
  async deleteQuestion(id: string, questionEn: string): Promise<void> {
    await this.gotoSearch({ question_en: questionEn, is_published: '-1' });
    await this.openDeleteConfirmation(id);
    await this.deleteDialog.confirmAndWaitForPageLoad();
  }

  /** IDs of the questions whose Question En is exactly this (any status). */
  async idsOfQuestionsTitledEn(questionEn: string): Promise<string[]> {
    await this.gotoSearch({ question_en: questionEn, is_published: '-1' });
    return this.rowsTitledEn(questionEn).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-key') ?? ''),
    );
  }

  // ---- Form ----

  async gotoCreate(): Promise<void> {
    await this.page.goto(`${BASE}/create`);
  }

  async gotoUpdate(id: string): Promise<void> {
    await this.page.goto(`${BASE}/update?id=${id}`);
  }

  /** Picks the question's category (select2) by its English name. */
  async selectCategory(categoryNameEn: string): Promise<void> {
    await this.form.locator('.field-faqquestion-category_id .select2-selection').click();
    await this.page
      .locator('.select2-container--open .select2-results__option', {
        hasText: exactText(categoryNameEn),
      })
      .click();
  }

  /** Fills the text fields that are given. */
  async fillForm(data: Partial<FaqQuestionData>): Promise<void> {
    if (data.question !== undefined) await this.questionInput.fill(data.question);
    if (data.questionEn !== undefined) await this.questionEnInput.fill(data.questionEn);
    if (data.answer !== undefined) await this.answerInput.fill(data.answer);
    if (data.answerEn !== undefined) await this.answerEnInput.fill(data.answerEn);
  }

  /** Clicks "Save & Publish" (or "Save" when publish is false) without waiting. */
  async submit(publish = true): Promise<void> {
    await (publish ? this.saveAndPublishButton : this.saveButton).click();
  }

  /** Saves a valid form and waits for the question's View page. */
  async saveAndWaitForPageLoad(publish = true): Promise<void> {
    await this.clickAndWaitForPageLoad(publish ? this.saveAndPublishButton : this.saveButton);
  }

  /** Creates a question in a category; returns its ID (from its View page). */
  async createQuestion(
    categoryNameEn: string,
    data: FaqQuestionData,
    publish = true,
  ): Promise<string> {
    await this.gotoCreate();
    await this.selectCategory(categoryNameEn);
    await this.fillForm(data);
    await this.saveAndWaitForPageLoad(publish);
    return this.idFromViewUrl(data.questionEn);
  }

  idFromViewUrl(label: string): string {
    const id = /\/faq-question\/view\?id=(\d+)$/.exec(this.page.url())?.[1];
    if (!id) throw new Error(`Saving question "${label}" did not open its View page.`);
    return id;
  }

  // ---- View ----

  async gotoView(id: string): Promise<void> {
    await this.page.goto(`${BASE}/view?id=${id}`);
  }

  /** A value on the View page, by its label ("Is Published", "Answer En", ...). */
  viewValue(label: string): Locator {
    return this.details
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: exactText(label) }) })
      .locator('td');
  }
}
