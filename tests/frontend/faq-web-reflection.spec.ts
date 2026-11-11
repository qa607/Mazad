import { expect, test } from '@fixtures/website.fixture';
import {
  editedFaqQuestion,
  faqCategorySlug,
  faqIconFile,
  faqUrls,
  newFaqCategory,
  newFaqQuestion,
} from '@test-data/faq.data';

/**
 * Help Center FAQ: what the back office publishes shows on the website's Help Center.
 *
 * Each test creates its own "QA-AUTO FAQ" category and question in a back-office tab signed in
 * as Dev Root (devRootBackend); the devRootFaqCleanup fixture deletes them afterwards, whether
 * the test passed or failed. The website is checked as a guest, in English on Desktop Chrome only
 * (@en-only, @desktop-only: the frontend-en-desktop project).
 */

// The back-office tab is signed in as Dev Root, which traces and videos would record; the
// fixtures attach screenshots on failure instead (the back-office one with account details
// masked).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe(
  'Help Center FAQ - website reflection',
  { tag: ['@regression', '@en-only', '@desktop-only', '@mutates'] },
  () => {
    // A retry would publish a second set of records while the first is cleaned up.
    test.describe.configure({ retries: 0 });

    test(
      'A published question and its category show on the Help Center',
      { tag: ['@smoke', '@functional'] },
      async ({ page, devRootBackend, devRootFaqCleanup, faqWebPage: web }) => {
        const category = newFaqCategory();
        const question = newFaqQuestion();
        const slug = faqCategorySlug(category.nameEn);

        await test.step('the back office creates a category and publishes a question in it', async () => {
          devRootFaqCleanup.trackCategory(category.nameEn);
          devRootFaqCleanup.trackQuestion(question.questionEn);
          await devRootBackend.faqCategoryPage.createCategory(category, faqIconFile);
          await devRootBackend.faqQuestionPage.createQuestion(category.nameEn, question, true);
        });

        await test.step('the Help Center lists the category', async () => {
          await web.goto();
          await expect(page).toHaveURL(faqUrls.webHelpCenter);
          await expect(web.heading).toBeVisible();
          await expect(web.categoryCard(category.nameEn)).toHaveCount(1);
        });

        await test.step('its page lists the question, which opens to its answer', async () => {
          await web.openCategory(category.nameEn);
          await expect(page).toHaveURL(faqUrls.webCategory(slug));
          await expect(web.categoryTitle).toHaveText(category.nameEn);
          await expect(web.questionTexts).toHaveText([question.questionEn]);
          await expect(web.answer(question.questionEn)).toBeHidden();

          await web.toggleQuestion(question.questionEn);

          await expect(web.answer(question.questionEn)).toBeVisible();
          await expect(web.answer(question.questionEn)).toHaveText(question.answerEn);
        });
      },
    );

    test(
      'An updated question shows on the website, and unpublishing it hides the category',
      { tag: '@functional' },
      async ({ devRootBackend, devRootFaqCleanup, faqWebPage: web }) => {
        const category = newFaqCategory();
        const question = newFaqQuestion();
        const edited = editedFaqQuestion(question);
        const slug = faqCategorySlug(category.nameEn);
        const { faqCategoryPage: categories, faqQuestionPage: questions } = devRootBackend;

        const id =
          await test.step('the back office publishes a question in a new category', async () => {
            devRootFaqCleanup.trackCategory(category.nameEn);
            devRootFaqCleanup.trackQuestion(question.questionEn);
            devRootFaqCleanup.trackQuestion(edited.questionEn);
            await categories.createCategory(category, faqIconFile);
            return questions.createQuestion(category.nameEn, question, true);
          });

        await test.step('the back office edits the question and answer', async () => {
          await questions.gotoUpdate(id);
          await questions.fillForm(edited);
          await questions.saveAndWaitForPageLoad(true);
        });

        await test.step('the category page shows the edited question and answer', async () => {
          await web.gotoCategory(slug);
          await expect(web.questionTexts).toHaveText([edited.questionEn]);
          await web.toggleQuestion(edited.questionEn);
          await expect(web.answer(edited.questionEn)).toHaveText(edited.answerEn);
        });

        await test.step('the back office unpublishes it with the Is Published switch', async () => {
          await questions.gotoSearch({ question_en: edited.questionEn, is_published: '-1' });
          await questions.clickPublishedSwitch(id);
          await questions.confirmPublishedChange();
        });

        await test.step('the Help Center no longer lists the category', async () => {
          await web.goto();
          await expect(web.categoryCards.first()).toBeVisible();
          await expect(web.categoryCard(category.nameEn)).toHaveCount(0);
        });
      },
    );
  },
);
