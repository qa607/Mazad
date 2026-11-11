import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  companyText,
  emailOfLength,
  newQaAutoCompany,
  phoneCases,
} from '@test-data/backend-delivery.data';

// Delivery Company create form: validation only, as Dev Root. Nothing here is ever saved. Fields
// are checked as they are left, and Save is pressed only on the empty form, which the page itself
// refuses to send. Every test asserts no create request reached the server.
test.use(devRootSession);

test.afterEach(async ({ page, mazadDashboardPage }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const screenshot = await page
    .screenshot({ mask: mazadDashboardPage.sensitiveAreas() })
    .catch(() => null);
  if (screenshot) {
    await testInfo.attach('screenshot (account details masked)', {
      body: screenshot,
      contentType: 'image/png',
    });
  }
});

test.describe(
  'Backend - Delivery Companies - create form validation',
  { tag: ['@regression'] },
  () => {
    let createRequests: () => number;

    test.beforeEach(async ({ deliveryCompanyFormPage }) => {
      createRequests = deliveryCompanyFormPage.countCreateRequests();
      await deliveryCompanyFormPage.gotoCreate();
      await expect(deliveryCompanyFormPage.form).toBeVisible();
    });

    test.afterEach(() => {
      expect(createRequests(), 'create requests sent to the server').toBe(0);
    });

    test(
      'DC-FRM-01 The form shows the four fields, Save and Cancel, and Cancel returns to the list',
      { tag: ['@smoke', '@functional'] },
      async ({ page, deliveryCompanyFormPage: form }) => {
        for (const field of ['arabicName', 'englishName', 'email', 'phone'] as const) {
          await expect(form.input(field)).toBeEditable();
          await expect(form.input(field)).toHaveValue('');
        }
        await expect(form.saveButton).toBeEnabled();

        await form.cancelLink.click();

        await expect(page).toHaveURL(/\/delivery-company\/index$/);
      },
    );

    test(
      'DC-FRM-02 Saving the empty form shows "cannot be blank" on the three required fields and sends nothing',
      { tag: ['@functional', '@negative'] },
      async ({ page, deliveryCompanyFormPage: form }) => {
        await form.save();

        await expect(form.fieldError('arabicName')).toHaveText(companyText.required.arabicName);
        await expect(form.fieldError('englishName')).toHaveText(companyText.required.englishName);
        await expect(form.fieldError('email')).toHaveText(companyText.required.email);
        await expect(form.fieldError('phone')).toHaveText('');
        await expect(page).toHaveURL(/\/delivery-company\/create$/);
      },
    );

    for (const field of ['arabicName', 'englishName', 'email'] as const) {
      test(
        `DC-FRM-03 ${field}: leaving it empty shows the required message`,
        { tag: ['@functional', '@negative'] },
        async ({ deliveryCompanyFormPage: form }) => {
          await form.input(field).focus();
          await form.input(field).blur();

          await expect(form.fieldError(field)).toHaveText(companyText.required[field]);
        },
      );
    }

    test(
      'DC-FRM-04 Email: a text without @ or a domain is not a valid address',
      { tag: ['@functional', '@negative'] },
      async ({ deliveryCompanyFormPage: form }) => {
        for (const bad of [
          'plainaddress',
          'qa@',
          '@example.com',
          'qa@@example.com',
          'qa example@example.com',
        ]) {
          await form.typeAndLeave('email', bad);

          await expect(form.fieldError('email'), bad).toHaveText(companyText.invalidEmail);
        }
      },
    );

    test(
      'DC-FRM-05 Email: a well-formed address clears the error, including one of exactly 100 characters',
      { tag: ['@functional'] },
      async ({ deliveryCompanyFormPage: form }) => {
        await form.typeAndLeave('email', 'plainaddress');
        await expect(form.fieldError('email')).toHaveText(companyText.invalidEmail);

        for (const good of [newQaAutoCompany().email, emailOfLength(companyText.emailMaxLength)]) {
          await form.typeAndLeave('email', good);

          await expect(form.fieldError('email')).toHaveText('');
          await expect(form.input('email')).toHaveValue(good);
        }
      },
    );

    for (const field of ['arabicName', 'englishName'] as const) {
      test(
        `DC-FRM-06 ${field}: 100 characters are accepted and 101 are not allowed`,
        { tag: ['@functional', '@negative'] },
        async ({ deliveryCompanyFormPage: form }) => {
          await form.typeAndLeave(field, 'a'.repeat(companyText.nameMaxLength));
          await expect(form.fieldError(field)).toHaveText('');

          await form.typeAndLeave(field, 'a'.repeat(companyText.nameMaxLength + 1));

          // The page either stops the 101st character or shows the "at most 100" message.
          const kept = (await form.input(field).inputValue()).length;
          if (kept > companyText.nameMaxLength) {
            await expect(form.fieldError(field)).toHaveText(
              field === 'arabicName'
                ? companyText.arabicNameTooLong
                : companyText.englishNameTooLong,
            );
          } else {
            expect(kept).toBe(companyText.nameMaxLength);
          }
        },
      );
    }

    test(
      'DC-FRM-07 Phone is optional: leaving it empty shows no error',
      { tag: ['@functional'] },
      async ({ deliveryCompanyFormPage: form }) => {
        await form.input('phone').focus();
        await form.input('phone').blur();

        await expect(form.fieldError('phone')).toHaveText('');
      },
    );

    for (const phone of phoneCases.valid) {
      test(
        `DC-FRM-08 Phone: the valid number "${phone}" shows no error`,
        { tag: ['@functional'] },
        async ({ deliveryCompanyFormPage: form }) => {
          await form.typeAndLeave('phone', phone);

          await expect(form.fieldError('phone')).toHaveText('');
        },
      );
    }

    for (const phone of phoneCases.invalid) {
      test(
        `DC-FRM-09 Phone: "${phone}" is refused`,
        { tag: ['@functional', '@negative'] },
        async ({ deliveryCompanyFormPage: form }) => {
          await form.typeAndLeave('phone', phone);

          await expect(form.fieldError('phone')).toHaveText(companyText.invalidPhone);
        },
      );
    }

    test(
      'DC-FRM-10 Phone: more than 15 characters is not allowed',
      { tag: ['@functional', '@negative'] },
      async ({ deliveryCompanyFormPage: form }) => {
        await form.typeAndLeave('phone', phoneCases.tooLong);

        const kept = (await form.input('phone').inputValue()).length;
        if (kept > companyText.phoneMaxLength) {
          await expect(form.fieldError('phone')).toHaveText(companyText.phoneTooLong);
        } else {
          expect(kept).toBe(companyText.phoneMaxLength);
        }
      },
    );
  },
);
