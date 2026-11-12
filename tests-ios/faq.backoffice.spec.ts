import { MazadApiClient } from '@api/mazad-api.client';
import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import {
  editedFaqQuestion,
  faqIconFile,
  newFaqCategory,
  newFaqQuestion,
} from '@test-data/faq.data';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { categoryName, questionText } from '@test-data/mobile-faq.data';
import { allureLabels } from '@utils/allure-labels';
import { attachFailureEvidence, LANGUAGES, openGuestHelpCenter } from './ios-test-helpers';

/**
 * Mazad iOS: Help Center FAQs end to end. What the back office publishes shows in the app. The
 * same scenarios as tests/mobile/android/faq.backoffice.spec.ts.
 *
 * Each test creates its own "QA-AUTO FAQ" category and questions in a back-office tab signed in as
 * Dev Root (devRootBackend), BEFORE the app is opened. The devRootFaqCleanup fixture deletes every
 * record a test tracked when that test ends, passed or failed; afterAll then checks through the
 * API that none is left. The app only reads (navigation and display; nothing typed or sent).
 * Runs in the ios-backoffice project, after ios-backend-setup saves the Dev Root session.
 */
test.describe.configure({ mode: 'serial' });
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

/** Every category name (Arabic and English) this file creates, for the final leftover check. */
const createdCategoryNames = new Set<string>();

test.afterAll(async ({ playwright }) => {
  // Safety net: the per-test clean-up must have removed every category this file created.
  const request = await playwright.request.newContext({ baseURL: envConfig.baseURL });
  try {
    const api = new MazadApiClient(request);
    for (const lang of ['en', 'ar'] as const) {
      const { body } = await api.getFaqCategories(lang);
      const leftovers = body.data.filter((c) => createdCategoryNames.has(c.name));
      expect(
        leftovers.map((c) => c.name),
        `test categories left (${lang})`,
      ).toEqual([]);
    }
  } finally {
    await request.dispose();
  }
});

for (const lang of LANGUAGES) {
  test.describe(
    `iOS Help Center FAQs (${lang}) - back office`,
    {
      ...allureLabels({
        feature: 'Help Center FAQs',
        story: 'Back office to app',
        severity: 'critical',
        platform: 'ios',
        language: lang,
      }),
      tag: ['@ios', `@${lang}`, '@mutates'],
    },
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      test(
        GUEST_FORM_TEST_TITLES[29],
        async ({
          driver,
          iosConfig,
          appShell,
          helpCenterScreen: help,
          text,
          devRootBackend,
          devRootFaqCleanup,
        }) => {
          const category = newFaqCategory();
          const question = newFaqQuestion();
          const name = categoryName(category, lang);
          const shown = questionText(question, lang);

          await test.step('the back office creates a category and publishes a question', async () => {
            devRootFaqCleanup.trackCategory(category.nameEn);
            devRootFaqCleanup.trackQuestion(question.questionEn);
            createdCategoryNames.add(category.name).add(category.nameEn);
            await devRootBackend.faqCategoryPage.createCategory(category, faqIconFile);
            await devRootBackend.faqQuestionPage.createQuestion(category.nameEn, question, true);
          });

          await test.step('Help Center lists the category', async () => {
            await restartIosApp(driver, iosConfig);
            await openGuestHelpCenter(appShell, help, lang, text);
            expect(await (await help.onlyText(name)).isDisplayed()).toBe(true);
          });

          await test.step('the category lists its question, answer hidden', async () => {
            await help.openCategory(name);
            await help.onlyText(shown.question);
            expect((await help.visibleTexts())[0], 'page title').toBe(name);
            expect(await help.shownCount(shown.answer)).toBe(0);
          });

          await test.step('the question opens to its exact answer, then closes', async () => {
            await help.toggleQuestion(shown.question);
            await expect.poll(() => help.shownCount(shown.answer)).toBe(1);
            await help.toggleQuestion(shown.question);
            await expect.poll(() => help.shownCount(shown.answer)).toBe(0);
          });
        },
      );
    },
  );
}

test.describe(
  'iOS Help Center FAQs (en) - back office changes',
  {
    ...allureLabels({
      feature: 'Help Center FAQs',
      story: 'Back office to app',
      severity: 'normal',
      platform: 'ios',
      language: 'en',
    }),
    tag: ['@ios', '@en', '@mutates'],
  },
  () => {
    const lang = 'en' as const;
    test.use({ language: lang });

    test.afterEach(async ({ driver }, testInfo) => {
      await attachFailureEvidence(driver, testInfo);
    });

    test(
      GUEST_FORM_TEST_TITLES[30],
      async ({
        driver,
        iosConfig,
        appShell,
        helpCenterScreen: help,
        text,
        devRootBackend,
        devRootFaqCleanup,
      }) => {
        const category = newFaqCategory();
        const first = newFaqQuestion();
        const second = newFaqQuestion();

        await test.step('the back office publishes two questions in a new category', async () => {
          devRootFaqCleanup.trackCategory(category.nameEn);
          devRootFaqCleanup.trackQuestion(first.questionEn);
          devRootFaqCleanup.trackQuestion(second.questionEn);
          createdCategoryNames.add(category.name).add(category.nameEn);
          await devRootBackend.faqCategoryPage.createCategory(category, faqIconFile);
          await devRootBackend.faqQuestionPage.createQuestion(category.nameEn, first, true);
          await devRootBackend.faqQuestionPage.createQuestion(category.nameEn, second, true);
        });

        await test.step('the app lists both questions', async () => {
          await restartIosApp(driver, iosConfig);
          await openGuestHelpCenter(appShell, help, lang, text);
          await help.openCategory(category.nameEn);
          expect(await (await help.onlyText(first.questionEn)).isDisplayed()).toBe(true);
          expect(await (await help.onlyText(second.questionEn)).isDisplayed()).toBe(true);
        });
      },
    );

    test(
      GUEST_FORM_TEST_TITLES[31],
      async ({
        driver,
        iosConfig,
        appShell,
        helpCenterScreen: help,
        text,
        mazadApi,
        devRootBackend,
        devRootFaqCleanup,
      }) => {
        const category = newFaqCategory();
        const question = newFaqQuestion();

        await test.step('the back office saves an unpublished question in a new category', async () => {
          devRootFaqCleanup.trackCategory(category.nameEn);
          devRootFaqCleanup.trackQuestion(question.questionEn);
          createdCategoryNames.add(category.name).add(category.nameEn);
          await devRootBackend.faqCategoryPage.createCategory(category, faqIconFile);
          await devRootBackend.faqQuestionPage.createQuestion(category.nameEn, question, false);
        });

        await test.step('Help Center does not list the category', async () => {
          await restartIosApp(driver, iosConfig);
          await openGuestHelpCenter(appShell, help, lang, text);
          // Wait for the real list first, so "not listed" is not just "not loaded yet".
          const { body } = await mazadApi.getFaqCategories(lang);
          await help.onlyText(body.data[0].name);
          expect(await help.shownCount(category.nameEn)).toBe(0);
        });
      },
    );

    test(
      GUEST_FORM_TEST_TITLES[32],
      async ({
        driver,
        iosConfig,
        appShell,
        helpCenterScreen: help,
        text,
        devRootBackend,
        devRootFaqCleanup,
      }) => {
        const category = newFaqCategory();
        const question = newFaqQuestion();
        const edited = editedFaqQuestion(question);
        const { faqCategoryPage: categories, faqQuestionPage: questions } = devRootBackend;

        const id =
          await test.step('the back office publishes a question in a new category', async () => {
            devRootFaqCleanup.trackCategory(category.nameEn);
            devRootFaqCleanup.trackQuestion(question.questionEn);
            devRootFaqCleanup.trackQuestion(edited.questionEn);
            createdCategoryNames.add(category.name).add(category.nameEn);
            await categories.createCategory(category, faqIconFile);
            return questions.createQuestion(category.nameEn, question, true);
          });

        await test.step('the app shows the question', async () => {
          await restartIosApp(driver, iosConfig);
          await openGuestHelpCenter(appShell, help, lang, text);
          await help.openCategory(category.nameEn);
          await help.onlyText(question.questionEn);
        });

        await test.step('the back office edits the question and answer', async () => {
          await questions.gotoUpdate(id);
          await questions.fillForm(edited);
          await questions.saveAndWaitForPageLoad(true);
        });

        await test.step('reopening the category shows the edited question and answer', async () => {
          await help.goBack();
          await help.openCategory(category.nameEn);
          await help.onlyText(edited.questionEn);
          expect(await help.shownCount(question.questionEn)).toBe(0);
          await help.toggleQuestion(edited.questionEn);
          await expect.poll(() => help.shownCount(edited.answerEn)).toBe(1);
        });

        await test.step('the back office unpublishes it with the Is Published switch', async () => {
          await questions.gotoSearch({ question_en: edited.questionEn, is_published: '-1' });
          await questions.clickPublishedSwitch(id);
          await questions.confirmPublishedChange();
        });

        await test.step('reopening Help Center no longer lists the category', async () => {
          await help.goBack(); // to Help Center
          await help.goBack(); // to More
          await help.openHelpCenter(text.contactUs.contactHelpCenter);
          await help.onlyText(text.contactUs.contactHelpCenter);
          await expect.poll(() => help.shownCount(category.nameEn)).toBe(0);
        });
      },
    );
  },
);
