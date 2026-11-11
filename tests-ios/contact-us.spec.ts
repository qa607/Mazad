import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import {
  contactLabels,
  contactPlaceholders,
  IOS_CONTACT_MOBILE_PREFIX,
  type IosContactField,
} from '@test-data/ios-app.data';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { draftValues, mobileContactInputs } from '@test-data/mobile-contact-us.data';
import { MOBILE_CONTACT_SUBMIT_BLOCKED } from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations } from '@utils/test-category';
import {
  attachFailureEvidence,
  CONTACT_SEND_PENDING,
  isEnabled,
  LANGUAGES,
  openGuestContactForm,
  pendingDetails,
} from './ios-test-helpers';

/**
 * Mazad iOS Contact Us, reached as a guest through More → Help Center → a category → Contact Us.
 * The same coverage as the Android suite (tests/mobile/android/contact-us.spec.ts), one scenario
 * list for English and Arabic. Observed on the device 2026-11-11 (build 8.3 (1491)): the form
 * behaves as on Android (no inline errors; Send turns on once all four fields have text, even with
 * a malformed email or a short mobile; Name drops digits and symbols; Mobile Number drops letters
 * and stops at 10 digits).
 *
 * Nothing here taps Send. Send has no accessible name on iOS, so the tests that read its state are
 * declared pending until the iOS team adds an accessibility id (src/mobile/ios/ios-selectors.ts).
 */
test.describe.configure({ mode: 'serial' });
// The guest display and typing tests run on the narrow text gate (test-data/ios-verified-text.ts);
// every other test is skipped at declaration while IOS_TEXT_VERIFIED is closed.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

const FIELDS: readonly IosContactField[] = ['name', 'email', 'mobile', 'message'];

const SEND_NOT_AUTOMATED =
  'Pending: tapping Send needs its accessibility id and a guarded screen action (src/mobile/ios/account/action-guard.ts); a device run has no request guard.';

for (const lang of LANGUAGES) {
  test.describe(
    `iOS Contact Us (${lang})`,
    allureLabels({
      feature: 'Contact Us',
      story: 'Guest Contact Form',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      // A fresh app in guest state, on the Contact Form in its language.
      test.describe(() => {
        test.beforeEach(async ({ driver, iosConfig, appShell, contactFormScreen, text }) => {
          await restartIosApp(driver, iosConfig);
          await openGuestContactForm(appShell, contactFormScreen, lang, text);
        });

        test(GUEST_FORM_TEST_TITLES[22], async ({ contactFormScreen: form, text }) => {
          const labels = contactLabels(text.contactUs);
          const placeholders = contactPlaceholders(text.contactUs);
          expect(await (await form.onlyText(text.contactUs.contactFormTitle)).isDisplayed()).toBe(
            true,
          );
          expect(await (await form.onlyText(text.contactUs.contactIntro)).isDisplayed()).toBe(true);
          for (const field of FIELDS) {
            expect.soft(await (await form.onlyText(labels[field])).isDisplayed(), field).toBe(true);
            // An empty field reports its placeholder as its value.
            expect
              .soft(await form.value(field, placeholders[field]), `${field} is empty`)
              .toBe(placeholders[field]);
          }
          expect(await (await form.onlyText(IOS_CONTACT_MOBILE_PREFIX)).isDisplayed()).toBe(true);
        });

        test(GUEST_FORM_TEST_TITLES[23], async ({ contactFormScreen: form, text }) => {
          const placeholder = text.contactUs.contactNamePlaceholder;
          await form.enter('name', placeholder, mobileContactInputs.nameWithDigitsAndSymbols);

          await expect
            .poll(() => form.value('name', placeholder))
            .toBe(mobileContactInputs.nameAfterFiltering);
        });

        test(GUEST_FORM_TEST_TITLES[24], async ({ contactFormScreen: form, text }) => {
          const placeholder = text.contactUs.contactMobilePlaceholder;
          await form.enter('mobile', placeholder, mobileContactInputs.mobileWithLetters);
          await expect
            .poll(() => form.value('mobile', placeholder))
            .toBe(mobileContactInputs.mobileWithLettersAfterFiltering);

          await form.enter('mobile', placeholder, mobileContactInputs.tooLongMobile);
          await expect
            .poll(() => form.value('mobile', placeholder))
            .toBe(mobileContactInputs.tooLongMobile.slice(0, mobileContactInputs.mobileMaxLength));
        });

        // Needs more than the narrow gate: declared skipped (no hook, no fixture, no app action)
        // while the full IOS_TEXT_VERIFIED gate is closed, and pending until Send has an id.
        test.describe(() => {
          test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

          /* eslint-disable @typescript-eslint/unbound-method, playwright/no-standalone-expect */
          (CONTACT_SEND_PENDING ? test.fixme : test)(
            'Contact Form keeps Send off while the form is empty',
            pendingDetails(CONTACT_SEND_PENDING, OTHER_TESTS_PROBLEM),
            async ({ contactFormScreen: form }) => {
              expect(await isEnabled(await form.sendButton())).toBe(false);
            },
          );

          for (const empty of FIELDS) {
            (CONTACT_SEND_PENDING ? test.fixme : test)(
              `Contact Form keeps Send off while the ${empty} is empty`,
              pendingDetails(CONTACT_SEND_PENDING, OTHER_TESTS_PROBLEM),
              async ({ contactFormScreen: form, text }) => {
                const placeholders = contactPlaceholders(text.contactUs);
                for (const field of FIELDS.filter((f) => f !== empty)) {
                  await form.enter(field, placeholders[field], draftValues[field]);
                }
                await form.hideKeyboard();

                expect(await form.value(empty, placeholders[empty])).toBe(placeholders[empty]);
                expect(await isEnabled(await form.sendButton())).toBe(false);
              },
            );
          }

          (CONTACT_SEND_PENDING ? test.fixme : test)(
            'Contact Form turns Send on once every field has text',
            pendingDetails(CONTACT_SEND_PENDING, OTHER_TESTS_PROBLEM),
            async ({ contactFormScreen: form, text }) => {
              const placeholders = contactPlaceholders(text.contactUs);
              for (const field of FIELDS) {
                await form.enter(field, placeholders[field], draftValues[field]);
              }
              await form.hideKeyboard();

              // Read, never tapped: sending is covered by the back-office test below.
              expect(await isEnabled(await form.sendButton())).toBe(true);
            },
          );
          /* eslint-enable @typescript-eslint/unbound-method, playwright/no-standalone-expect */
        });
      });

      // Sending a message and finding it in the back office: skipped by default. It needs the
      // Send id, a guarded Send action, and the QA owner's approval for the run
      // (MAZAD_ALLOW_MOBILE_CONTACT_SUBMIT); on a device nothing can block the request itself.
      test.describe(() => {
        test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

        test.fixme(
          'A message sent from the iOS app appears in the back office Contact us list',
          {
            tag: '@mutates',
            annotation: categoryAnnotations({
              pending: CONTACT_SEND_PENDING ?? SEND_NOT_AUTOMATED,
              authorization: MOBILE_CONTACT_SUBMIT_BLOCKED,
              textGate: OTHER_TESTS_PROBLEM,
            }),
          },
          () => {
            // Declared only. Once Send has an id: send newMobileContactMessage() values from the form
            // through a guarded Send action, then search the back office by its email exactly as
            // tests/mobile/android/contact-us.backoffice.spec.ts does.
          },
        );
      });
    },
  );
}
