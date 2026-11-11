import { expect, test } from '@fixtures/mobile.fixture';
import { openContactForm } from '@mobile/open-contact-form';
import type { ContactFormField } from '@mobile/screens/contact-form.screen';
import { languageOptions } from '@test-data/mobile-app.data';
import {
  draftValues,
  emptyFieldCases,
  mobileContactInputs,
  contactUsCategory,
  mobileContactUsText,
} from '@test-data/mobile-contact-us.data';
import type { Language } from '@typings';

// One device and one Appium session: the file runs in order (run the android project with
// --workers=1). Every test reopens the form from a fresh app start in its language. Nothing
// here presses Send; sending is covered, after sign-off, by contact-us.backoffice.spec.ts.
test.describe.configure({ mode: 'serial' });

const languages: Language[] = ['en', 'ar'];
const fields: readonly ContactFormField[] = ['name', 'email', 'mobile', 'message'];

for (const lang of languages) {
  const text = mobileContactUsText[lang];

  test.describe(`Contact Us - Android app (${lang})`, { tag: '@regression' }, () => {
    test.beforeEach(async ({ driver, appShell, helpCenterScreen, contactFormScreen, mazadApi }) => {
      // Help Center categories are served by the API; any real one leads to Contact Us.
      const { body } = await mazadApi.getFaqCategories(lang);
      const category = contactUsCategory(body.data);
      expect(category, 'Help Center has at least one category').toBeDefined();

      await openContactForm(
        driver,
        { appShell, helpCenter: helpCenterScreen, form: contactFormScreen },
        {
          language: lang,
          languageOptions,
          helpCenterLabel: text.helpCenter,
          categoryName: category!.name,
          contactUsLabel: text.contactUsLink,
          formTitle: text.formTitle,
        },
      );
    });

    test(
      'Help Center leads to the Contact Form, with every box empty and Send off',
      { tag: ['@smoke', '@ui'] },
      async ({ contactFormScreen: form }) => {
        expect(await form.byText(text.whatsapp).isDisplayed(), 'WhatsApp button').toBe(true);
        expect(await form.byText(text.intro).isDisplayed(), 'intro line').toBe(true);
        for (const field of fields) {
          expect
            .soft(await form.byText(text.labels[field]).isDisplayed(), `${field} label`)
            .toBe(true);
          expect
            .soft(await form.byText(text.placeholders[field]).isDisplayed(), `${field} placeholder`)
            .toBe(true);
          expect.soft(await form.value(field), `${field} starts empty`).toBe('');
        }
        expect(await form.byText(text.mobilePrefix).isDisplayed(), '+966 prefix').toBe(true);
        expect(await form.isSendEnabled(text.send)).toBe(false);
      },
    );

    for (const empty of emptyFieldCases) {
      test(
        `Keeps Send off while the ${empty} is empty`,
        { tag: '@negative' },
        async ({ contactFormScreen: form }) => {
          for (const field of fields.filter((f) => f !== empty)) {
            await form.enter(field, draftValues[field]);
          }

          expect(await form.value(empty)).toBe('');
          expect(await form.isSendEnabled(text.send)).toBe(false);
        },
      );
    }

    test(
      'Turns Send on once every box has text',
      { tag: '@functional' },
      async ({ contactFormScreen: form }) => {
        for (const field of fields.slice(0, -1)) {
          await form.enter(field, draftValues[field]);
          expect(await form.isSendEnabled(text.send), `after ${field}`).toBe(false);
        }
        await form.enter('message', draftValues.message);

        // Not pressed: sending is covered by the back-office reflection test.
        expect(await form.isSendEnabled(text.send)).toBe(true);
      },
    );

    test('Name keeps letters only', { tag: '@functional' }, async ({ contactFormScreen: form }) => {
      await form.enter('name', mobileContactInputs.nameWithDigitsAndSymbols);

      await expect.poll(() => form.value('name')).toBe(mobileContactInputs.nameAfterFiltering);
    });

    test(
      'Mobile Number ignores letters and stops at 10 digits',
      { tag: '@negative' },
      async ({ contactFormScreen: form }) => {
        await form.enter('mobile', mobileContactInputs.mobileWithLetters);
        await expect
          .poll(() => form.value('mobile'))
          .toBe(mobileContactInputs.mobileWithLettersAfterFiltering);

        await form.typeKeys('mobile', mobileContactInputs.tooLongMobile);
        await expect
          .poll(() => form.value('mobile'))
          .toBe(mobileContactInputs.tooLongMobile.slice(0, mobileContactInputs.mobileMaxLength));
      },
    );
  });
}
