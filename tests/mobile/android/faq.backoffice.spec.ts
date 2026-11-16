import { MazadApiClient } from '@api/mazad-api.client';
import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import type { HelpCenterScreen } from '@mobile/screens/help-center.screen';
import type { AppShellScreen } from '@mobile/screens/app-shell.screen';
import type { AndroidDriver } from '@mobile/android.session';
import {
  editedFaqQuestion,
  faqIconFile,
  newFaqCategory,
  newFaqQuestion,
} from '@test-data/faq.data';
import { languageOptions } from '@test-data/mobile-app.data';
import { mobileContactUsText } from '@test-data/mobile-contact-us.data';
import { categoryName, questionText } from '@test-data/mobile-faq.data';
import type { Language } from '@typings';

/**
 * Help Center FAQs end to end: what the back office publishes shows in the Android app.
 *
 * Each test creates its own "QA-AUTO FAQ" category and questions in a back-office tab signed in as
 * Dev Root (devRootBackend), BEFORE opening the app, so the app loads them fresh. The
 * devRootFaqCleanup fixture deletes every record a test tracked when that test ends, passed or
 * failed; afterAll then checks through the API that none of them is left. The app only reads.
 * Runs in the android-backoffice project (after backend-setup saves the Dev Root session).
 */

// The back-office tab is signed in as Dev Root: no trace or video (see website.fixture's
// devRootBackend, which attaches a masked screenshot on failure instead).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device, and a retry would create a second set of records while the first is cleaned up.
test.describe.configure({ mode: 'serial', retries: 0 });

/** Every category name (Arabic and English) this file creates, for the final leftover check. */
const createdCategoryNames = new Set<string>();

/** From a fresh app start: the language, then More → Help Center. */
async function openHelpCenter(
  driver: AndroidDriver,
  appShell: AppShellScreen,
  help: HelpCenterScreen,
  lang: Language,
): Promise<void> {
  await restartApp(driver);
  await appShell.waitUntilReady();
  await appShell.dismissAnnouncement();
  await appShell.setLanguage(lang, languageOptions);
  await appShell.dismissAnnouncement();
  await appShell.open('more');
  await help.open(mobileContactUsText[lang].helpCenter);
  await help.item(mobileContactUsText[lang].helpCenter).waitForDisplayed({ timeout: 15_000 });
}

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

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `Help Center FAQs - Android app (${lang}) - back office`,
    { tag: ['@regression', '@mutates'] },
    () => {
      test(
        'A published question and its category show in the app, and the question opens and closes',
        { tag: ['@smoke', '@functional'] },
        async ({ driver, appShell, helpCenterScreen: help, devRootBackend, devRootFaqCleanup }) => {
          const category = newFaqCategory();
          const question = newFaqQuestion();
          const shown = questionText(question, lang);
          const name = categoryName(category, lang);

          await test.step('the back office creates a category and publishes a question', async () => {
            devRootFaqCleanup.trackCategory(category.nameEn);
            devRootFaqCleanup.trackQuestion(question.questionEn);
            createdCategoryNames.add(category.name).add(category.nameEn);
            await devRootBackend.faqCategoryPage.createCategory(category, faqIconFile);
            await devRootBackend.faqQuestionPage.createQuestion(category.nameEn, question, true);
          });

          await test.step('Help Center lists the category', async () => {
            await openHelpCenter(driver, appShell, help, lang);
            await help.scrollTo(name);
            await expect.poll(() => help.item(name).isDisplayed(), { timeout: 20_000 }).toBe(true);
          });

          await test.step('the category lists exactly its question, answer hidden', async () => {
            await help.openCategory(name);
            await expect.poll(() => help.item(shown.question).isDisplayed()).toBe(true);
            const texts = await help.visibleTexts();
            expect(texts[0], 'page title').toBe(name);
            expect(texts).toContain(shown.question);
            expect(texts).not.toContain(shown.answer);
          });

          await test.step('the question opens to its exact answer, then closes', async () => {
            await help.toggleQuestion(shown.question);
            await expect.poll(() => help.item(shown.answer).isDisplayed()).toBe(true);
            await help.toggleQuestion(shown.question);
            await expect.poll(() => help.item(shown.answer).isExisting()).toBe(false);
          });
        },
      );
    },
  );
}

test.describe(
  'Help Center FAQs - Android app (en) - back office changes',
  { tag: ['@regression', '@mutates'] },
  () => {
    const lang: Language = 'en';

    test(
      'Two published questions of a category are both listed',
      { tag: '@functional' },
      async ({ driver, appShell, helpCenterScreen: help, devRootBackend, devRootFaqCleanup }) => {
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
          await openHelpCenter(driver, appShell, help, lang);
          await help.openCategory(category.nameEn);
          await expect.poll(() => help.item(first.questionEn).isDisplayed()).toBe(true);
          const texts = await help.visibleTexts();
          expect(texts).toEqual(expect.arrayContaining([first.questionEn, second.questionEn]));
        });
      },
    );

    test(
      'A category whose only question is unpublished is not listed',
      { tag: ['@functional', '@negative'] },
      async ({
        driver,
        appShell,
        helpCenterScreen: help,
        devRootBackend,
        devRootFaqCleanup,
        mazadApi,
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
          await openHelpCenter(driver, appShell, help, lang);
          // Wait for the real list first, so "not listed" is not just "not loaded yet".
          const { body } = await mazadApi.getFaqCategories(lang);
          await expect.poll(() => help.item(body.data[0].name).isDisplayed()).toBe(true);
          await help.scrollTo(category.nameEn);
          expect(await help.item(category.nameEn).isExisting()).toBe(false);
        });
      },
    );

    test(
      'An edited question shows its new text, and unpublishing it removes the category',
      { tag: '@functional' },
      async ({ driver, appShell, helpCenterScreen: help, devRootBackend, devRootFaqCleanup }) => {
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
          await openHelpCenter(driver, appShell, help, lang);
          await help.openCategory(category.nameEn);
          await expect.poll(() => help.item(question.questionEn).isDisplayed()).toBe(true);
        });

        await test.step('the back office edits the question and answer', async () => {
          await questions.gotoUpdate(id);
          await questions.fillForm(edited);
          await questions.saveAndWaitForPageLoad(true);
        });

        await test.step('reopening the category shows the edited question and answer', async () => {
          await help.goBack();
          await help.openCategory(category.nameEn);
          await expect.poll(() => help.item(edited.questionEn).isDisplayed()).toBe(true);
          expect(await help.item(question.questionEn).isExisting()).toBe(false);
          await help.toggleQuestion(edited.questionEn);
          await expect.poll(() => help.item(edited.answerEn).isDisplayed()).toBe(true);
        });

        await test.step('the back office unpublishes it with the Is Published switch', async () => {
          await questions.gotoSearch({ question_en: edited.questionEn, is_published: '-1' });
          await questions.clickPublishedSwitch(id);
          await questions.confirmPublishedChange();
        });

        await test.step('reopening Help Center no longer lists the category', async () => {
          await help.goBack(); // to Help Center
          await help.goBack(); // to More
          await help.open(mobileContactUsText[lang].helpCenter);
          await expect
            .poll(() => help.item(mobileContactUsText[lang].helpCenter).isDisplayed())
            .toBe(true);
          await help.scrollTo(category.nameEn);
          expect(await help.item(category.nameEn).isExisting()).toBe(false);
        });
      },
    );
  },
);
