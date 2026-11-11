import type { FaqCategoryPage } from '@pages/backend/help-center/faq-category.page';
import type { FaqQuestionPage } from '@pages/backend/help-center/faq-question.page';

/** Records the FAQ categories and questions a test creates (or renames to). */
export interface FaqTracker {
  trackCategory: (nameEn: string) => void;
  trackQuestion: (questionEn: string) => void;
}

/**
 * Clean-up shared by the FAQ fixtures: a tracker for the test, and a run() for the fixture's
 * teardown that deletes every tracked question, then every tracked category, by exact English
 * text through the back-office grids (in whichever signed-in tab the page objects are bound to).
 */
export function faqCleanup(pages: {
  faqCategoryPage: FaqCategoryPage;
  faqQuestionPage: FaqQuestionPage;
}): { tracker: FaqTracker; run: () => Promise<void> } {
  const categories = new Set<string>();
  const questions = new Set<string>();
  return {
    tracker: {
      trackCategory: (nameEn) => categories.add(nameEn),
      trackQuestion: (questionEn) => questions.add(questionEn),
    },
    run: async () => {
      for (const questionEn of questions) {
        for (const id of await pages.faqQuestionPage.idsOfQuestionsTitledEn(questionEn)) {
          await pages.faqQuestionPage.deleteQuestion(id, questionEn);
        }
      }
      for (const nameEn of categories) {
        for (const id of await pages.faqCategoryPage.idsOfCategoriesNamedEn(nameEn)) {
          await pages.faqCategoryPage.deleteCategory(id, nameEn);
        }
      }
    },
  };
}
