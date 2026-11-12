import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { isTestFaqCategory, realFaqCategories } from '@test-data/mobile-faq.data';
import { allureLabels } from '@utils/allure-labels';
import {
  attachFailureEvidence,
  HELP_CENTER_BACK_PENDING_AR,
  LANGUAGES,
  openGuestHelpCenter,
  pendingDetails,
} from './ios-test-helpers';

/**
 * Mazad iOS: Help Center FAQs as a guest, read-only. The same coverage as the Android suite
 * (tests/mobile/android/faq.spec.ts), one scenario list for English and Arabic. The expected
 * categories, questions and answers come from the API the app calls (GET /v1/faq-list and
 * /v1/faq-list?id=<id>); records created by the FAQ suites ("QA-AUTO FAQ ...") are left out.
 *
 * Navigation and display only: categories and questions are tapped by their exact label, and Back
 * by its observed accessible name (English only; Arabic is declared pending).
 */
test.describe.configure({ mode: 'serial' });
// Every test here is a guest display test on the narrow text gate (test-data/ios-verified-text.ts).
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

for (const lang of LANGUAGES) {
  test.describe(
    `iOS Help Center FAQs (${lang})`,
    allureLabels({
      feature: 'Help Center FAQs',
      story: 'Guest Help Center',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      test.beforeEach(async ({ driver, iosConfig, appShell, helpCenterScreen, text }) => {
        await restartIosApp(driver, iosConfig);
        await openGuestHelpCenter(appShell, helpCenterScreen, lang, text);
      });

      test(GUEST_FORM_TEST_TITLES[25], async ({ helpCenterScreen: help, mazadApi, text }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const expected = realFaqCategories(body.data).map((c) => c.name);
        expect(expected.length, 'categories from the API').toBeGreaterThan(0);

        await help.onlyText(expected[0]);
        const listed = (await help.visibleTexts()).filter(
          (t) => t !== text.contactUs.contactHelpCenter && !isTestFaqCategory(t),
        );
        expect(listed).toEqual(expected);
      });

      test(GUEST_FORM_TEST_TITLES[26], async ({ helpCenterScreen: help, mazadApi, text }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const category = realFaqCategories(body.data).at(-1)!;
        const questions = (await mazadApi.getFaqCategory(lang, category.id))?.questions ?? [];
        expect(questions.length, `questions of "${category.name}"`).toBeGreaterThan(0);

        await help.openCategory(category.name);
        await help.onlyText(questions[0].question);

        const shown = await help.visibleTexts();
        expect(shown[0], 'page title').toBe(category.name);
        expect(shown.filter((t) => questions.some((q) => q.question === t))).toEqual(
          questions.map((q) => q.question),
        );
        for (const { answer } of questions) {
          expect.soft(await help.shownCount(answer), 'answers start hidden').toBe(0);
        }
        expect(
          await (await help.onlyText(text.contactUs.contactCantFindAnswer)).isDisplayed(),
        ).toBe(true);
        expect(await (await help.onlyText(text.contactUs.contactUsLink)).isDisplayed()).toBe(true);
      });

      test(GUEST_FORM_TEST_TITLES[27], async ({ helpCenterScreen: help, mazadApi }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const category = realFaqCategories(body.data).at(-1)!;
        const [first] = (await mazadApi.getFaqCategory(lang, category.id))?.questions ?? [];
        expect(first, `a question of "${category.name}"`).toBeDefined();

        await help.openCategory(category.name);
        await help.toggleQuestion(first.question);
        await expect.poll(() => help.shownCount(first.answer)).toBe(1);

        await help.toggleQuestion(first.question);
        await expect.poll(() => help.shownCount(first.answer)).toBe(0);
      });

      // Back is identified in English only: Arabic is declared pending (never a positional tap).
      /* eslint-disable @typescript-eslint/unbound-method, playwright/no-standalone-expect */
      (lang === 'ar' ? test.fixme : test)(
        GUEST_FORM_TEST_TITLES[28],
        pendingDetails(lang === 'ar' ? HELP_CENTER_BACK_PENDING_AR : undefined),
        async ({ helpCenterScreen: help, mazadApi, text }) => {
          const { body } = await mazadApi.getFaqCategories(lang);
          const category = realFaqCategories(body.data).at(-1)!;

          await help.openCategory(category.name);
          await expect.poll(async () => (await help.visibleTexts())[0]).toBe(category.name);

          await help.goBack();
          await expect
            .poll(async () => (await help.visibleTexts())[0])
            .toBe(text.contactUs.contactHelpCenter);

          await help.goBack();
          // More is back: its Help Center row is shown again.
          await expect.poll(() => help.shownCount(text.contactUs.contactHelpCenter)).toBe(1);
          await expect.poll(() => help.shownCount(category.name)).toBe(0);
        },
      );
      /* eslint-enable @typescript-eslint/unbound-method, playwright/no-standalone-expect */
    },
  );
}
