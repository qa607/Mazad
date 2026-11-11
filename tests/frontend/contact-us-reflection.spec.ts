import { expect, test } from '@fixtures/website.fixture';
import { LANGUAGES } from '@locales';
import { contactTypes, contactUsText } from '@test-data/backend-contact-us.data';
import {
  contactUsInputs,
  contactUsViewLabels,
  contactUsWebUrls,
  createdAtToleranceMinutes,
  invalidEmailCases,
  invalidMobileCases,
  newContactMessage,
  requiredFieldCases,
} from '@test-data/contact-us-web.data';
import { minutesBetween, parseRiyadhDateTime } from '@utils/date';

// Runs in every frontend-<language>-<desktop|mobile> project: English (LTR) and Arabic (RTL),
// on Desktop Chrome and on a Pixel 7. The website request guard is on for every test; the
// only request it lets through is the Contact Us submit with the synthetic QA-AUTO values.

// The reflection test opens a back-office tab signed in as Dev Root, which traces and videos
// would record, so they are off for the file (Playwright allows these settings only at the top
// level). On failure the fixtures attach screenshots instead: the website tab as is (synthetic
// data only) and the back-office tab with account details masked.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Contact Us - website form', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, websiteContactUsPage: form }) => {
    await form.goto();
    await expect(page).toHaveURL(contactUsWebUrls.form);
  });

  test.describe('page', () => {
    test(
      'Opens in the page language and direction',
      { tag: ['@smoke', '@ui'] },
      async ({ page, language, t, websiteContactUsPage: form }) => {
        await expect(form.document).toHaveAttribute('lang', language);
        await expect(form.document).toHaveAttribute('dir', LANGUAGES[language].dir);
        await expect(page).toHaveTitle(t('contactUsPageTitle'));
        await expect(form.heading).toBeVisible();
      },
    );

    test(
      'Shows every field with its label and placeholder, and Send disabled',
      { tag: ['@functional', '@ui'] },
      async ({ t, websiteContactUsPage: form }) => {
        await expect(form.labels).toHaveText([
          t('contactUsNameLabel'),
          t('contactUsEmailLabel'),
          t('contactUsMobileLabel'),
          t('contactUsMessageLabel'),
        ]);
        await expect(form.nameInput).toHaveAttribute('placeholder', t('contactUsNamePlaceholder'));
        await expect(form.emailInput).toHaveAttribute(
          'placeholder',
          t('contactUsEmailPlaceholder'),
        );
        await expect(form.mobileInput).toHaveAttribute(
          'placeholder',
          t('contactUsMobilePlaceholder'),
        );
        await expect(form.messageInput).toHaveAttribute(
          'placeholder',
          t('contactUsMessagePlaceholder'),
        );
        await expect(form.sendButton).toBeDisabled();
      },
    );

    test(
      'Shows the form beside its illustration',
      { tag: ['@ui', '@desktop-only'] },
      async ({ websiteContactUsPage: form }) => {
        await expect(form.form).toBeVisible();
        await expect(form.illustration).toBeVisible();
        await expect(form.menuButton).toBeHidden();
      },
    );

    test(
      'Fits the phone screen, without the illustration',
      { tag: ['@ui', '@mobile-only'] },
      async ({ page, websiteContactUsPage: form }) => {
        await expect(form.menuButton).toBeVisible();
        await expect(form.illustration).toBeHidden();
        expect(await form.horizontalOverflow()).toBe(0);

        const width = page.viewportSize()!.width;
        const box = (await form.form.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      },
    );

    test(
      'The Message box can be found from its label',
      {
        tag: ['@ui', '@known-bug'],
        annotation: {
          type: 'issue',
          description:
            'Message label has for="contact-us-message" but the box\'s id is "message"; no ticket yet.',
        },
      },
      async ({ websiteContactUsPage: form }) => {
        test.fail(
          true,
          'BUG: The Message label is not linked to its box (for="contact-us-message", box id "message"), so the box has no accessible name.',
        );
        await expect(form.messageByLabel).toBeVisible({ timeout: 2_000 });
      },
    );
  });

  test.describe('validation', () => {
    for (const { field, error } of requiredFieldCases) {
      test(
        `Requires the ${field}`,
        { tag: '@negative' },
        async ({ t, websiteContactUsPage: form }) => {
          await form.touch(field);

          await expect(form.error(field)).toHaveText(t(error));
          await expect(form.sendButton).toBeDisabled();
        },
      );
    }

    test(
      'Shows every required error when all fields are left empty',
      { tag: '@negative' },
      async ({ t, websiteContactUsPage: form }) => {
        for (const { field } of requiredFieldCases) await form.touch(field);

        for (const { field, error } of requiredFieldCases) {
          await expect(form.error(field), field).toHaveText(t(error));
        }
        await expect(form.sendButton).toBeDisabled();
      },
    );

    for (const { name, input } of invalidEmailCases) {
      test(`Rejects ${name}`, { tag: '@negative' }, async ({ t, websiteContactUsPage: form }) => {
        await form.enter('email', input);
        await form.leave('email');

        await expect(form.error('email')).toHaveText(t('contactUsEmailInvalid'));
        await expect(form.sendButton).toBeDisabled();
      });
    }

    for (const { name, input, error } of invalidMobileCases) {
      test(`Rejects ${name}`, { tag: '@negative' }, async ({ t, websiteContactUsPage: form }) => {
        await form.enter('mobile', input);
        await form.leave('mobile');

        await expect(form.error('mobile')).toHaveText(t(error));
        await expect(form.sendButton).toBeDisabled();
      });
    }

    test(
      'Mobile Number ignores letters and stops at 10 digits',
      { tag: '@negative' },
      async ({ websiteContactUsPage: form }) => {
        await form.enter('mobile', contactUsInputs.lettersInMobile);
        await expect(form.mobileInput).toHaveValue('');

        await form.enter('mobile', contactUsInputs.tooLongMobile);
        await expect(form.mobileInput).toHaveValue(
          contactUsInputs.tooLongMobile.slice(0, contactUsInputs.mobileMaxLength),
        );
      },
    );

    test(
      'Name keeps letters only',
      { tag: '@functional' },
      async ({ websiteContactUsPage: form }) => {
        await form.enter('name', contactUsInputs.nameWithDigitsAndSymbols);

        await expect(form.nameInput).toHaveValue(contactUsInputs.nameAfterFiltering);
      },
    );

    test(
      'Send turns on only once every field is valid',
      { tag: '@functional' },
      async ({ websiteContactUsPage: form }) => {
        const message = newContactMessage();
        const steps = [
          ['name', message.name],
          ['email', message.email],
          ['mobile', message.phone],
          ['message', message.message],
        ] as const;

        const last = steps[steps.length - 1];
        for (const [field, value] of steps.slice(0, -1)) {
          await form.enter(field, value);
          await form.leave(field);
          await expect(form.sendButton, `after ${field}`).toBeDisabled();
        }
        await form.enter(last[0], last[1]);
        await form.leave(last[0]);

        // Not pressed: sending is covered by the reflection test.
        await expect(form.sendButton).toBeEnabled();
        for (const [field] of steps) await expect(form.error(field)).toHaveCount(0);
      },
    );
  });

  test.describe('reflection in the back office', { tag: '@mutates' }, () => {
    // A retry would send a second message, so none.
    test.describe.configure({ retries: 0 });

    test(
      'A sent message appears in the back office Contact us list',
      { tag: ['@smoke', '@functional'] },
      async ({ t, websiteContactUsPage: form, devRootBackend }, testInfo) => {
        const message = newContactMessage();
        const list = devRootBackend.contactUsPage;

        const sentAt = await test.step('send the form on the website', async () => {
          await form.fillForm(message);
          await expect(form.sendButton).toBeEnabled();
          const status = await form.send();
          const time = Date.now();

          expect(status).toBe(200);
          await expect(form.successMessage).toHaveText(t('contactUsSent'));
          for (const field of ['name', 'email', 'mobile', 'message'] as const) {
            await expect(form.input(field), `${field} cleared`).toHaveValue('');
          }
          return time;
        });

        const row = await test.step('find it in the back office by its email', async () => {
          await list.goto();
          // A login page here instead means the saved Dev Root session was rejected or expired.
          await expect(list.pageHeading).toHaveText(contactUsText.pageTitle);
          await list.searchBy('emailInput', message.email);
          await expect(list.rows).toHaveCount(1);
          return list.readRow(list.rows.first());
        });

        testInfo.annotations.push({
          type: 'contact-us-id',
          description: `${row.id} (${message.email})`,
        });

        await test.step('the row holds what was sent', () => {
          expect(row).toMatchObject({
            type: contactTypes.contact_us,
            name: message.name,
            mobile: message.phone,
            email: message.email,
            company: contactUsText.notSet,
          });
          const created = parseRiyadhDateTime(row.createdAt);
          expect(created, `Created At "${row.createdAt}"`).not.toBeNaN();
          expect(minutesBetween(created, sentAt)).toBeLessThanOrEqual(createdAtToleranceMinutes);
        });

        await test.step('its View page shows the message', async () => {
          await list.gotoView(row.id);
          await expect(list.viewValue(contactUsViewLabels.id)).toHaveText(row.id);
          await expect(list.viewValue(contactUsViewLabels.message)).toHaveText(message.message);
          await expect(list.viewValue(contactUsViewLabels.email)).toHaveText(message.email);
        });
      },
    );
  });
});
