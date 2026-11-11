import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  editedFaqQuestion,
  faqExistingCategory,
  faqPublishedFilters,
  faqQuestionColumns,
  faqQuestionErrors,
  faqQuestionFilters,
  faqRowActions,
  faqSearchData,
  faqText,
  faqUrls,
  faqViewLabels,
  newFaqCategory,
  newFaqQuestion,
} from '@test-data/faq.data';

/**
 * Mazad Backend > Help Center > Faq Questions: the list (filter by Category, Question,
 * Question En and Is Published; the Is Published switch) and the create, update and delete
 * flows.
 *
 * Read-only tests use the existing questions. Tests that change data create a "QA-AUTO FAQ"
 * category and questions in it; the faqCleanup fixture deletes them afterwards (questions
 * first), whether the test passed or failed. The file runs in order in one worker.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);
test.describe.configure({ mode: 'default' });

test.describe('Faq Questions - list', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, faqQuestionPage: list }) => {
    await list.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(faqUrls.questionList);
  });

  test(
    'Opens from Help Center > Faq Questions in the sidebar',
    { tag: '@functional' },
    async ({ page, mazadDashboardPage, faqQuestionPage: list }) => {
      await mazadDashboardPage.goto();

      await list.openFromSidebar(faqText.sidebarParent, faqText.questionsSidebarLabel);

      await expect(page).toHaveURL(faqUrls.questionList);
      await expect(list.pageHeading).toHaveText(faqText.questionsTitle);
    },
  );

  test(
    'Shows the filters, Reset, Create Faq Question and the grid columns',
    { tag: ['@smoke', '@functional'] },
    async ({ page, faqQuestionPage: list }) => {
      await expect(page).toHaveTitle(faqText.questionsTitle);
      await expect(list.filterLabels).toHaveText([...faqQuestionFilters]);
      await expect(list.categoryFilterValue).toHaveText(faqText.categoryPlaceholder);
      await expect(list.publishedFilterValue).toHaveText(faqText.publishedPlaceholder);
      await expect(list.createButton).toHaveText(faqText.createQuestionTitle);
      await expect(list.resetButton).toBeVisible();
      await expect(list.columnHeaders).toHaveText([...faqQuestionColumns]);

      const first = list.rows.first();
      await expect(first).toBeVisible();
      const actions = list.actionLinks(first);
      await expect(actions).toHaveCount(faqRowActions.length);
      for (const [index, name] of faqRowActions.entries()) {
        await expect(actions.nth(index)).toHaveAttribute('title', name);
      }
    },
  );

  test(
    'Category lists only the questions of that category',
    { tag: '@functional' },
    async ({ faqQuestionPage: list }) => {
      await list.filterByCategory(faqExistingCategory);

      await expect(list.categoryFilterValue).toHaveAttribute('title', faqExistingCategory);
      await expect(list.rows.first()).toBeVisible();
      for (const cell of await list.categoryCells.all()) {
        await expect(cell).toHaveText(faqExistingCategory);
      }
    },
  );

  for (const { label, published } of faqPublishedFilters) {
    test(
      `Is Published ${label} lists only ${published ? 'published' : 'unpublished'} questions`,
      { tag: '@functional' },
      async ({ faqQuestionPage: list }) => {
        await list.filterByPublished(label);

        await expect(list.publishedFilterValue).toHaveAttribute('title', label);
        const states = await list.publishedValues();
        expect(states.filter((state) => state !== published)).toEqual([]);
      },
    );
  }

  test(
    'Question En finds questions by part of the text, ignoring case',
    { tag: '@functional' },
    async ({ faqQuestionPage: list }) => {
      const row = list.rows.first();
      const id = await list.rowId(row);
      const part = faqSearchData.partialEn(await list.questionEnCell(row).innerText());

      await list.searchByQuestionEn(part);

      await expect(list.row(id)).toHaveCount(1);
      for (const cell of await list.questionEnCells.all()) {
        expect((await cell.innerText()).toLowerCase()).toContain(part);
      }
    },
  );

  test(
    'Question finds questions by part of the Arabic text',
    { tag: '@functional' },
    async ({ faqQuestionPage: list }) => {
      const row = list.rows.first();
      const id = await list.rowId(row);
      const part = faqSearchData.partialAr(await list.questionCell(row).innerText());

      await list.searchByQuestion(part);

      await expect(list.row(id)).toHaveCount(1);
      for (const cell of await list.questionCells.all()) {
        expect(await cell.innerText()).toContain(part);
      }
    },
  );

  test(
    'An unknown question finds nothing',
    { tag: '@negative' },
    async ({ faqQuestionPage: list }) => {
      await list.searchByQuestionEn(faqSearchData.unknown);

      await expect(list.rows).toHaveCount(0);
      await expect(list.emptyMessage).toHaveText(faqText.noResults);
    },
  );

  test(
    'Reset clears the filters',
    { tag: '@functional' },
    async ({ page, faqQuestionPage: list }) => {
      const total = await list.totalCount();
      await list.searchByQuestionEn(faqSearchData.unknown);
      await expect(list.emptyMessage).toBeVisible();

      await list.reset();

      await expect(page).toHaveURL(faqUrls.questionList);
      await expect(list.questionEnSearchInput).toBeEmpty();
      expect(await list.totalCount()).toBe(total);
    },
  );
});

test.describe('Faq Questions - create, publish, update and delete', { tag: '@regression' }, () => {
  test(
    'An empty form is rejected with a message under each field',
    { tag: '@negative' },
    async ({ page, faqQuestionPage: form }) => {
      await form.gotoCreate();
      const submissions = form.countPostRequests('/helpCenter/faq-question/create');

      await form.submit();

      await expect(form.categoryError).toHaveText(faqQuestionErrors.category);
      await expect(form.questionError).toHaveText(faqQuestionErrors.question);
      await expect(form.questionEnError).toHaveText(faqQuestionErrors.questionEn);
      await expect(form.answerError).toHaveText(faqQuestionErrors.answer);
      await expect(form.answerEnError).toHaveText(faqQuestionErrors.answerEn);
      await expect(page).toHaveURL(faqUrls.questionCreate);
      expect(submissions()).toBe(0);
    },
  );

  test(
    'Save & Publish creates a published question in a test category',
    { tag: ['@smoke', '@crud', '@mutates'] },
    async ({ page, faqQuestionPage: questions, createFaqCategory, faqCleanup }) => {
      const category = newFaqCategory();
      await createFaqCategory(category);
      const question = newFaqQuestion();
      faqCleanup.trackQuestion(question.questionEn);

      await test.step('fill the form and Save & Publish', async () => {
        await questions.goto();
        await questions.openCreateForm();
        await expect(page).toHaveURL(faqUrls.questionCreate);
        await expect(questions.pageHeading).toHaveText(faqText.createQuestionTitle);
        await questions.selectCategory(category.nameEn);
        await questions.fillForm(question);
        await questions.saveAndWaitForPageLoad(true);
      });

      const id = await test.step('its View page shows it published in the category', async () => {
        await expect(page).toHaveURL(faqUrls.questionView);
        await expect(questions.viewValue(faqViewLabels.isPublished)).toHaveText(
          faqText.published.yes,
        );
        await expect(questions.viewValue(faqViewLabels.category)).toHaveText(category.nameEn);
        await expect(questions.viewValue(faqViewLabels.question)).toHaveText(question.question);
        await expect(questions.viewValue(faqViewLabels.questionEn)).toHaveText(question.questionEn);
        await expect(questions.viewValue(faqViewLabels.answer)).toHaveText(question.answer);
        await expect(questions.viewValue(faqViewLabels.answerEn)).toHaveText(question.answerEn);
        return questions.idFromViewUrl(question.questionEn);
      });

      await test.step('the list shows it published', async () => {
        await questions.gotoSearch({ question_en: question.questionEn });
        const row = questions.row(id);
        await expect(questions.categoryCell(row)).toHaveText(category.nameEn);
        await expect(questions.publishedState(row)).toBeChecked();
      });
    },
  );

  test(
    'Save keeps a new question unpublished, and the Is Published switch publishes it',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ faqQuestionPage: questions, createFaqCategory, createFaqQuestion }) => {
      const category = newFaqCategory();
      await createFaqCategory(category);
      const question = newFaqQuestion();
      const id = await createFaqQuestion(category.nameEn, question, false);

      await test.step('saved unpublished', async () => {
        await expect(questions.viewValue(faqViewLabels.isPublished)).toHaveText(
          faqText.published.no,
        );
        await questions.gotoSearch({ question_en: question.questionEn, is_published: '-1' });
        await expect(questions.publishedState(questions.row(id))).not.toBeChecked();
      });

      await test.step('the switch asks first, then publishes', async () => {
        await questions.clickPublishedSwitch(id);
        await expect(questions.resultAlertTitle).toHaveText(faqText.publishConfirmTitle);
        await expect(questions.resultAlertText).toHaveText(faqText.publishConfirmText);
        expect(await questions.confirmPublishedChange()).toBe(faqText.publishUpdated);
      });

      await test.step('it stays published after a reload', async () => {
        await questions.gotoSearch({ question_en: question.questionEn, is_published: '-1' });
        await expect(questions.publishedState(questions.row(id))).toBeChecked();
        await questions.gotoView(id);
        await expect(questions.viewValue(faqViewLabels.isPublished)).toHaveText(
          faqText.published.yes,
        );
      });
    },
  );

  test(
    'Updates the question and answer, shown on the View page and in the list',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({
      page,
      faqQuestionPage: questions,
      createFaqCategory,
      createFaqQuestion,
      faqCleanup,
    }) => {
      const category = newFaqCategory();
      await createFaqCategory(category);
      const question = newFaqQuestion();
      const edited = editedFaqQuestion(question);
      faqCleanup.trackQuestion(edited.questionEn);
      const id = await createFaqQuestion(category.nameEn, question);

      await questions.gotoUpdate(id);
      await expect(page).toHaveURL(faqUrls.questionUpdate(id));
      await expect(questions.pageHeading).toHaveText(faqText.updateTitle(question.questionEn));
      await expect(questions.categoryValue).toHaveAttribute('title', category.nameEn);
      await expect(questions.questionEnInput).toHaveValue(question.questionEn);
      await questions.fillForm(edited);
      await questions.saveAndWaitForPageLoad(true);

      await expect(page).toHaveURL(faqUrls.questionView);
      await expect(questions.viewValue(faqViewLabels.questionEn)).toHaveText(edited.questionEn);
      await expect(questions.viewValue(faqViewLabels.answer)).toHaveText(edited.answer);
      await expect(questions.viewValue(faqViewLabels.answerEn)).toHaveText(edited.answerEn);
      await questions.gotoSearch({ question_en: edited.questionEn });
      await expect(questions.questionCell(questions.row(id))).toHaveText(edited.question);
    },
  );

  test(
    'Deletes a question from the grid after confirmation',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ faqQuestionPage: questions, createFaqCategory, createFaqQuestion }) => {
      const category = newFaqCategory();
      await createFaqCategory(category);
      const question = newFaqQuestion();
      const id = await createFaqQuestion(category.nameEn, question);
      await questions.gotoSearch({ question_en: question.questionEn, is_published: '-1' });

      await questions.openDeleteConfirmation(id);
      await expect(questions.deleteDialog.message).toHaveText(faqText.deleteConfirm);
      await questions.deleteDialog.confirmAndWaitForPageLoad();

      await expect(questions.successAlert).toContainText(faqText.questionDeleted);
      await questions.gotoSearch({ question_en: question.questionEn, is_published: '-1' });
      await expect(questions.rows).toHaveCount(0);
    },
  );
});
