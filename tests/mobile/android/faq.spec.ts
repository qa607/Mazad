import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import { languageOptions } from '@test-data/mobile-app.data';
import { mobileContactUsText } from '@test-data/mobile-contact-us.data';
import { isTestFaqCategory, realFaqCategories } from '@test-data/mobile-faq.data';
import type { Language } from '@typings';

// Help Center FAQs as a guest, read-only: the expected categories, questions and answers come from
// the API the app calls (GET /v1/faq-list and /v1/faq-list?id=<id>). Records created by the FAQ
// suites ("QA-AUTO FAQ ...") are left out. One device: the file runs in order (--workers=1).
test.describe.configure({ mode: 'serial' });

const languages: Language[] = ['en', 'ar'];

for (const lang of languages) {
  const text = mobileContactUsText[lang];

  test.describe(`Help Center FAQs - Android app (${lang})`, { tag: '@regression' }, () => {
    test.beforeEach(async ({ driver, appShell, helpCenterScreen }) => {
      await restartApp(driver);
      await appShell.waitUntilReady();
      await appShell.dismissAnnouncement();
      await appShell.setLanguage(lang, languageOptions);
      await appShell.dismissAnnouncement();
      await appShell.open('more');
      await helpCenterScreen.open(text.helpCenter);
      await helpCenterScreen.item(text.helpCenter).waitForDisplayed({ timeout: 15_000 });
    });

    test(
      "Lists exactly the API's categories, in order",
      { tag: ['@smoke', '@functional'] },
      async ({ helpCenterScreen: help, mazadApi }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const expected = realFaqCategories(body.data).map((c) => c.name);
        expect(expected.length, 'categories from the API').toBeGreaterThan(0);

        await expect.poll(() => help.item(expected[0]).isDisplayed()).toBe(true);
        const listed = (await help.visibleTexts()).filter(
          (t) => t !== text.helpCenter && !isTestFaqCategory(t),
        );

        expect(listed).toEqual(expected);
      },
    );

    test(
      'A category lists its published questions, then Contact Us',
      { tag: '@functional' },
      async ({ helpCenterScreen: help, mazadApi }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const category = realFaqCategories(body.data).at(-1)!;
        const questions = (await mazadApi.getFaqCategory(lang, category.id))?.questions ?? [];
        expect(questions.length, `questions of "${category.name}"`).toBeGreaterThan(0);

        await help.openCategory(category.name);
        await expect.poll(() => help.item(questions[0].question).isDisplayed()).toBe(true);

        const shown = await help.visibleTexts();
        expect(shown[0], 'page title').toBe(category.name);
        expect(shown.filter((t) => questions.some((q) => q.question === t))).toEqual(
          questions.map((q) => q.question),
        );
        for (const { answer } of questions) {
          expect.soft(shown, 'answers start hidden').not.toContain(answer);
        }
        expect(await help.item(text.cantFindAnswer).isDisplayed()).toBe(true);
        expect(await help.item(text.contactUsLink).isDisplayed()).toBe(true);
      },
    );

    test(
      'A question opens to its answer and closes again',
      { tag: '@functional' },
      async ({ helpCenterScreen: help, mazadApi }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const category = realFaqCategories(body.data).at(-1)!;
        const [first] = (await mazadApi.getFaqCategory(lang, category.id))?.questions ?? [];
        expect(first, `a question of "${category.name}"`).toBeDefined();

        await help.openCategory(category.name);
        await help.toggleQuestion(first.question);
        await expect.poll(() => help.item(first.answer).isDisplayed()).toBe(true);

        await help.toggleQuestion(first.question);
        await expect.poll(() => help.item(first.answer).isExisting()).toBe(false);
      },
    );

    test(
      'Back returns from a category to Help Center, then to More',
      { tag: '@functional' },
      async ({ appShell, helpCenterScreen: help, mazadApi }) => {
        const { body } = await mazadApi.getFaqCategories(lang);
        const category = realFaqCategories(body.data).at(-1)!;

        await help.openCategory(category.name);
        await expect.poll(async () => (await help.visibleTexts())[0]).toBe(category.name);

        await help.goBack();
        await expect.poll(async () => (await help.visibleTexts())[0]).toBe(text.helpCenter);

        await help.goBack();
        // More is back: its Help Center row is shown and the More tab is selected.
        await expect.poll(() => help.item(text.helpCenter).isDisplayed()).toBe(true);
        expect(await appShell.isSelected('more')).toBe(true);
      },
    );
  });
}
