import path from 'node:path';
import { testRecordPrefix } from '@test-data/backend-common.data';
import { uniqueDigits } from '@utils/unique';

/**
 * Help Center FAQ test data: the back office's Faq Categories (/backend/helpCenter/faq-category)
 * and Faq Questions (/backend/helpCenter/faq-question), and the website's Help Center
 * (/<lang>/help-center/). Recorded on staging (stg-154) on 2026-11-11 from the live UI and the
 * forms' client validation rules. The Backend has no localization, so its UI text lives here.
 *
 * Behaviour accepted as intended (tests assert it, so a change shows up as a failure):
 * - A category needs an icon (uploaded straight to S3 by the page), a Name and a Name En (at most
 *   40 characters). Saving opens its View page, headed with the (Arabic) Name. Its website slug
 *   is the Name En in lower case with spaces as dashes.
 * - A question needs a category, Question / Question En (at most 150 characters) and Answer /
 *   Answer En. "Save & Publish" publishes it, "Save" keeps it unpublished. Saving opens its View
 *   page.
 * - Create and update show no message; deleting from the grid asks in a page dialog and then
 *   confirms with a success message.
 * - The grid's Is Published switch asks "Are you sure?" first and answers "Updated successfully."
 * - The website lists a category only while it has at least one published question; its page
 *   lists the published questions, and a question opens to show its answer. Changes show at once.
 */

export const faqText = {
  sidebarParent: 'Help Center',
  categoriesSidebarLabel: 'Faq Categories',
  questionsSidebarLabel: 'Faq Questions',
  categoriesTitle: 'Faq Categories',
  questionsTitle: 'Faq Questions',
  createCategoryTitle: 'Create Faq Category',
  createQuestionTitle: 'Create Faq Question',
  updateTitle: (name: string) => `Update : ${name}`,
  /** The Sorting button's page; each row's Sort link adds ?id=<category id>. */
  orderingPath: '/backend/helpCenter/faq-category/ordering',
  noResults: 'No results found.',
  deleteConfirm: 'Are you sure to delete this item?',
  categoryDeleted: 'Category has been deleted successfully.',
  questionDeleted: 'Question has been deleted successfully.',
  publishConfirmTitle: 'Are you sure?',
  publishConfirmText: 'Do you want to update the publish?',
  publishUpdated: 'Updated successfully.',
  categoryPlaceholder: 'Select Category',
  publishedPlaceholder: 'Select Published Status',
  published: { yes: 'Yes', no: 'No' },
  /** Created At range preset used by the date filter test. */
  todayRange: 'Today',
} as const;

export const faqCategoryErrors = {
  icon: 'Icon cannot be blank.',
  name: 'Name cannot be blank.',
  nameEn: 'Name En cannot be blank.',
} as const;

export const faqQuestionErrors = {
  category: 'Category cannot be blank.',
  question: 'Question cannot be blank.',
  questionEn: 'Question En cannot be blank.',
  answer: 'Answer cannot be blank.',
  answerEn: 'Answer En cannot be blank.',
} as const;

export const faqCategoryColumns = [
  '#',
  'Name',
  'Name En',
  'Created At',
  'Updated At',
  'Sorting',
  'Actions',
] as const;
export const faqCategoryFilters = ['Name', 'Name En', 'Created At'] as const;

export const faqQuestionColumns = [
  '#',
  'Category',
  'Is Published',
  'Question',
  'Question En',
  'Created At',
  'Updated At',
  'Actions',
] as const;
export const faqQuestionFilters = ['Category', 'Question', 'Question En', 'Is Published'] as const;

/** Is Published filter options: label and whether the rows' switch is on. */
export const faqPublishedFilters = [
  { label: 'Yes', published: true },
  { label: 'No', published: false },
] as const;

/** Row actions of both grids (accessible names), in display order. */
export const faqRowActions = ['View', 'Update', 'Delete'] as const;

/** An existing category used by the read-only Category filter test. */
export const faqExistingCategory = 'About Auctions';

export const faqViewLabels = {
  name: 'Name',
  nameEn: 'Name En',
  slugEn: 'Slug En',
  isPublished: 'Is Published',
  category: 'Category',
  question: 'Question',
  questionEn: 'Question En',
  answer: 'Answer',
  answerEn: 'Answer En',
} as const;

/** The synthetic icon every test category is created with. */
export const faqIconFile = path.resolve(__dirname, 'files', 'qa-faq-icon.png');

export interface FaqCategoryData {
  /** Arabic name. */
  name: string;
  nameEn: string;
}

export interface FaqQuestionData {
  /** Arabic question and answer. */
  question: string;
  questionEn: string;
  answer: string;
  answerEn: string;
}

/** Prefix of every category and question this suite creates (clean-up matches it exactly). */
export const testFaqPrefix = `${testRecordPrefix} FAQ`;

/** A new, unique category: "QA-AUTO FAQ 1234567 فئة" / "QA-AUTO FAQ 1234567 Category". */
export function newFaqCategory(): FaqCategoryData {
  const stamp = uniqueDigits(7);
  return { name: `${testFaqPrefix} ${stamp} فئة`, nameEn: `${testFaqPrefix} ${stamp} Category` };
}

/** A new, unique question. */
export function newFaqQuestion(): FaqQuestionData {
  const stamp = uniqueDigits(7);
  return {
    question: `${testFaqPrefix} ${stamp} سؤال؟`,
    questionEn: `${testFaqPrefix} ${stamp} Question?`,
    answer: `${testFaqPrefix} ${stamp} جواب`,
    answerEn: `${testFaqPrefix} ${stamp} Answer.`,
  };
}

export function editedFaqCategory(category: FaqCategoryData): FaqCategoryData {
  return { name: `${category.name} معدل`, nameEn: `${category.nameEn} edited` };
}

export function editedFaqQuestion(question: FaqQuestionData): FaqQuestionData {
  return {
    question: `${question.question} معدل`,
    questionEn: `${question.questionEn} edited`,
    answer: `${question.answer} معدل`,
    answerEn: `${question.answerEn} edited`,
  };
}

/** The website slug of a category: its Name En in lower case, spaces as dashes. */
export function faqCategorySlug(nameEn: string): string {
  return nameEn.trim().toLowerCase().replace(/\s+/g, '-');
}

export const faqSearchData = {
  unknown: 'zz-no-such-faq-zz',
  /** Part of an English text in other letter case (drops the first and last character). */
  partialEn: (text: string): string => text.trim().slice(1, -1).toLowerCase(),
  /** The last word of an Arabic text, a partial match. */
  partialAr: (text: string): string => text.trim().split(/\s+/).pop() ?? text,
} as const;

/** Help Center permissions of a role, as titled on its permission page. */
export const faqPermissions = {
  role: 'superAdmin',
  /** The two Ajax routes: their boxes may not show the role's state, so replies decide. */
  ajaxRoutes: [
    '/helpCenter/ajax/save-category-sorting',
    '/helpCenter/ajax/update-faq-question-is-published',
  ],
  /** Routes whose checkbox shows whether the role has them. */
  displayedRoutes: [
    '/helpCenter/faq-category/create',
    '/helpCenter/faq-category/delete',
    '/helpCenter/faq-category/index',
    '/helpCenter/faq-category/ordering',
    '/helpCenter/faq-category/update',
    '/helpCenter/faq-category/view',
    'sort-faq-category',
    '/helpCenter/faq-question/create',
    '/helpCenter/faq-question/delete',
    '/helpCenter/faq-question/index',
    '/helpCenter/faq-question/update',
    '/helpCenter/faq-question/view',
  ],
} as const;

export const faqUrls = {
  categoryList: /\/backend\/helpCenter\/faq-category\/index$/,
  categoryCreate: /\/backend\/helpCenter\/faq-category\/create$/,
  categoryView: /\/backend\/helpCenter\/faq-category\/view\?id=(\d+)$/,
  categoryUpdate: (id: string) => new RegExp(`/backend/helpCenter/faq-category/update\\?id=${id}$`),
  ordering: /\/backend\/helpCenter\/faq-category\/ordering$/,
  questionList: /\/backend\/helpCenter\/faq-question\/index$/,
  questionCreate: /\/backend\/helpCenter\/faq-question\/create$/,
  questionView: /\/backend\/helpCenter\/faq-question\/view\?id=(\d+)$/,
  questionUpdate: (id: string) => new RegExp(`/backend/helpCenter/faq-question/update\\?id=${id}$`),
  webHelpCenter: /\/en\/help-center\/?$/,
  webCategory: (slug: string) => new RegExp(`/en/help-center/${slug}/?$`),
} as const;
