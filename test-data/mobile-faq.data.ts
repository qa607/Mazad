import type { FaqCategoryData, FaqQuestionData } from '@test-data/faq.data';
import { testFaqPrefix } from '@test-data/faq.data';
import type { Language } from '@typings';
import type { FaqCategory } from '@typings/mazad';

/**
 * Mazad Android app — Help Center FAQs. Recorded on staging (stg-154) with 8.2.2-stage on an
 * emulator, English and Arabic, 2026-11-11/12:
 * - Help Center lists exactly the categories of GET /v1/faq-list, in the API's order. (A
 *   "Selling on Mazad" category seen on 2026-11-11 came from mazad-v3.motory.dev, the backend the
 *   app used before the switch to stg-154; stg-154 does not serve it.)
 * - Opening a category calls GET /v1/faq-list?id=<id>, which returns its published questions and
 *   answers; the page lists the questions, then "Can't find your answer?" and "Contact Us".
 * - Tapping a question shows its answer right below it; tapping it again hides it.
 *
 * End-to-end records are the FAQ suite's own synthetic ones (test-data/faq.data.ts: unique
 * "QA-AUTO FAQ <stamp>" categories and questions), created in the back office as Dev Root and
 * deleted by the devRootFaqCleanup fixture after each test, passed or failed.
 */

/** The name the app shows for a category in a language (the back office's Name / Name En). */
export function categoryName(category: FaqCategoryData, language: Language): string {
  return language === 'en' ? category.nameEn : category.name;
}

/** The question and answer the app shows in a language. */
export function questionText(
  question: FaqQuestionData,
  language: Language,
): { question: string; answer: string } {
  return language === 'en'
    ? { question: question.questionEn, answer: question.answerEn }
    : { question: question.question, answer: question.answer };
}

/** True for a record created by the FAQ suites (never part of the stable Help Center content). */
export function isTestFaqCategory(name: string): boolean {
  return name.startsWith(testFaqPrefix);
}

/** The real (non-test) categories, in the API's order. */
export function realFaqCategories(categories: readonly FaqCategory[]): FaqCategory[] {
  return categories.filter((category) => !isTestFaqCategory(category.name));
}
