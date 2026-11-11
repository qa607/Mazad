import { expect, test } from '@fixtures/test.fixture';
import type { QuestionFormField } from '@pages/backend/survey/confirm-delivery-survey.page';
import {
  type AccessProfile,
  backendHomePath,
  expectedAccess,
  forbiddenStatus,
} from '@test-data/backend-permissions.data';
import {
  confirmDeliveryAccess,
  confirmDeliveryData,
  confirmDeliveryScaleRules,
  confirmDeliveryText,
  confirmDeliveryUrls,
  invalidScaleCases,
} from '@test-data/backend-confirm-delivery-survey.data';

// Survey > Confirm Delivery (/backend/survey/confirm-delivery-survey/index): the questions a buyer
// answers after confirming delivery. Read-only: Update is opened without saving and the Add
// Question form is only submitted while invalid (the browser blocks it, nothing is sent). Then,
// who can manage the questions.

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Backend - Confirm Delivery Survey', { tag: '@regression' }, () => {
  test.use({ signedInAs: 'devRoot' });

  test.beforeEach(async ({ page, confirmDeliverySurveyPage }) => {
    await confirmDeliverySurveyPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(confirmDeliveryUrls.list);
    await expect(
      confirmDeliverySurveyPage.rows.first(),
      'No survey question on staging.',
    ).toBeVisible();
  });

  test(
    'Page shows the heading, Add Question button, filters and the questions grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, confirmDeliverySurveyPage: survey }) => {
      await expect(page).toHaveTitle(confirmDeliveryText.pageTitle);
      await expect(survey.breadcrumbCurrent).toHaveText(confirmDeliveryText.pageTitle);
      await expect(survey.sidebarLink).toHaveText(confirmDeliveryText.sidebarLabel);

      await expect(survey.addQuestionButton).toBeVisible();
      for (const input of [survey.questionInput, survey.questionEnInput]) {
        await expect(input).toBeEditable();
      }
      await expect(survey.columnHeaders).toHaveText([...confirmDeliveryText.columnHeaders]);
      await expect(survey.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
    },
  );

  test.describe('rows', () => {
    test(
      'Every question has View and Update, and no Delete',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        const count = await survey.rows.count();

        await expect(survey.rows.locator('a[title="View"]')).toHaveCount(count);
        await expect(survey.rows.locator('a[title="Update"]')).toHaveCount(count);
        await expect(survey.rows.locator('a[title="Delete"]')).toHaveCount(0);
      },
    );

    test(
      'Every question has both languages and a valid answer scale',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        const rows = await survey.readRows();

        for (const row of rows) {
          await test.step(`question ${row.id}`, () => {
            expect(row.question, 'Arabic question').not.toBe('');
            expect(row.questionEn, 'English question').not.toBe('');
            expect(row.isActive).toMatch(/^(Yes|No)$/);
            expect(row.from).toBeGreaterThanOrEqual(confirmDeliveryScaleRules.minFrom);
            expect(row.from).toBeLessThanOrEqual(confirmDeliveryScaleRules.maxFrom);
            expect(row.to).toBeGreaterThanOrEqual(confirmDeliveryScaleRules.minTo);
            expect(row.updatedAt >= row.createdAt, 'Updated At not before Created At').toBe(true);
          });
        }
      },
    );

    test(
      'At least one question is active (the survey is not empty)',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        const rows = await survey.readRows();

        expect(rows.filter((row) => row.isActive === 'Yes').length).toBeGreaterThan(0);
      },
    );
  });

  test.describe('filters', () => {
    test(
      'Arabic and English question filters find the question',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        const [first] = await survey.readRows();

        for (const [field, value] of [
          ['questionInput', first.question.split(' ').slice(0, 3).join(' ')],
          ['questionEnInput', first.questionEn.split(' ').slice(0, 3).join(' ')],
        ] as const) {
          await test.step(field, async () => {
            await survey.goto();
            await survey.searchBy(field, value);
            await expect(survey.row(first.id)).toHaveCount(1);
          });
        }
      },
    );

    test(
      'English question filter ignores letter case',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        const [first] = await survey.readRows();

        await survey.gotoFiltered({ question_en: first.questionEn.toUpperCase() });

        await expect(survey.row(first.id)).toHaveCount(1);
      },
    );

    test(
      'An unknown question shows no results',
      { tag: ['@functional', '@negative'] },
      async ({ confirmDeliverySurveyPage: survey }) => {
        await survey.searchBy('questionEnInput', confirmDeliveryData.unknownQuestion);

        await expect(survey.rows).toHaveCount(0);
        await expect(survey.emptyMessage).toHaveText(confirmDeliveryText.noResults);
      },
    );

    test(
      'Reset clears the filters',
      { tag: '@functional' },
      async ({ page, confirmDeliverySurveyPage: survey }) => {
        const total = await survey.totalCount();
        await survey.gotoFiltered({ question_en: confirmDeliveryData.unknownQuestion });
        await survey.reset();

        await expect(page).toHaveURL(confirmDeliveryUrls.listPlain);
        expect(await survey.totalCount()).toBe(total);
      },
    );
  });

  test.describe('sorting', () => {
    test(
      'Only ID, From, To and the dates are sortable',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        await expect(survey.columnHeaders.locator('a')).toHaveText([
          ...confirmDeliveryText.sortableHeaders,
        ]);
      },
    );

    test(
      'ID sorts ascending, then descending',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        await survey.sortBy('ID');
        const ascending = (await survey.readRows()).map((row) => Number(row.id));
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await survey.sortBy('ID');
        const descending = (await survey.readRows()).map((row) => Number(row.id));
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
      },
    );

    test(
      'To sorts the questions by scale',
      { tag: '@functional' },
      async ({ confirmDeliverySurveyPage: survey }) => {
        await survey.sortBy('To');
        const ascending = (await survey.readRows()).map((row) => row.to);
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await survey.sortBy('To');
        const descending = (await survey.readRows()).map((row) => row.to);
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
      },
    );
  });

  test.describe('View and Update', () => {
    test(
      'View shows the question as the list does',
      { tag: '@functional' },
      async ({ page, confirmDeliverySurveyPage: survey }) => {
        const [first] = await survey.readRows();

        await page.goto(survey.viewPath(first.id));

        await expect(page).toHaveURL(confirmDeliveryUrls.view(first.id));
        await expect(survey.detailLabels).toHaveText([...confirmDeliveryText.viewLabels]);
        await expect(survey.detailValue('Question')).toHaveText(first.question);
        await expect(survey.detailValue('Question En')).toHaveText(first.questionEn);
        await expect(survey.detailValue('From')).toHaveText(String(first.from));
        await expect(survey.detailValue('To')).toHaveText(String(first.to));
        await expect(survey.detailValue('Is Active')).toHaveText(first.isActive);
      },
    );

    test(
      'Update opens the form filled with the question (not saved)',
      { tag: '@functional' },
      async ({ page, confirmDeliverySurveyPage: survey }) => {
        const [first] = await survey.readRows();

        await page.goto(survey.updatePath(first.id));

        await expect(page).toHaveURL(confirmDeliveryUrls.update(first.id));
        await expect(survey.formInput('question')).toHaveValue(first.question);
        await expect(survey.formInput('questionEn')).toHaveValue(first.questionEn);
        await expect(survey.formInput('from')).toHaveValue(String(first.from));
        await expect(survey.formInput('to')).toHaveValue(String(first.to));
        await expect(survey.formInput('isActive')).toBeChecked({
          checked: first.isActive === 'Yes',
        });
      },
    );
  });

  test.describe('Add Question validation (nothing is saved)', () => {
    test.beforeEach(async ({ page, confirmDeliverySurveyPage: survey }) => {
      await survey.addQuestionButton.click();
      await expect(page).toHaveURL(confirmDeliveryUrls.create);
      await expect(page).toHaveTitle(confirmDeliveryText.createTitle);
    });

    test(
      'Empty form lists every required field and sends nothing',
      { tag: ['@functional', '@negative'] },
      async ({ page, confirmDeliverySurveyPage: survey }) => {
        const posts = survey.countPostRequests(confirmDeliveryUrls.createPath);

        await survey.submitQuestionForm({});

        for (const [field, message] of Object.entries(confirmDeliveryText.requiredFields) as [
          QuestionFormField,
          string,
        ][]) {
          await expect(survey.fieldError(field)).toHaveText(message);
        }
        await expect(survey.formErrors).toHaveCount(
          Object.keys(confirmDeliveryText.requiredFields).length,
        );
        await expect(page).toHaveURL(confirmDeliveryUrls.create);
        expect(posts(), 'create requests sent').toBe(0);
      },
    );

    for (const { name, from, to, errors } of invalidScaleCases) {
      test(
        `Rejects a scale with ${name}`,
        { tag: ['@functional', '@negative'] },
        async ({ confirmDeliverySurveyPage: survey }) => {
          await survey.submitQuestionForm({ from, to });

          for (const field of ['from', 'to'] as const) {
            const message = (errors as Partial<Record<'from' | 'to', string>>)[field];
            // A field without a message for this case must show none.
            await expect(survey.fieldError(field)).toHaveText(message ?? '');
          }
        },
      );
    }

    test(
      'Cancel returns to the list without adding a question',
      { tag: '@functional' },
      async ({ page, confirmDeliverySurveyPage: survey }) => {
        await survey.goto();
        const total = await survey.totalCount();
        await survey.addQuestionButton.click();

        await survey.formCancelButton.click();

        await expect(page).toHaveURL(confirmDeliveryUrls.list);
        expect(await survey.totalCount()).toBe(total);
      },
    );
  });
});

const profiles = Object.keys(confirmDeliveryAccess) as AccessProfile[];

for (const profile of profiles) {
  const allowed = confirmDeliveryAccess[profile];

  test.describe(
    `Confirm Delivery Survey permissions - ${expectedAccess[profile].label}`,
    { tag: '@regression' },
    () => {
      test.use({ signedInAs: profile });

      for (const [label, path] of [
        ['the questions list', '/backend/survey/confirm-delivery-survey/index'],
        ['a question', '/backend/survey/confirm-delivery-survey/view?id=1'],
        ['the Update form', '/backend/survey/confirm-delivery-survey/update?id=1'],
        ['the Add Question form', confirmDeliveryUrls.createPath],
      ] as const) {
        test(
          `${allowed ? 'can' : 'cannot'} open ${label}`,
          { tag: '@functional' },
          async ({ page }) => {
            const response = await page.goto(path);

            expect(response?.status()).toBe(allowed ? 200 : forbiddenStatus);
          },
        );
      }

      test(
        `the sidebar ${allowed ? 'links to' : 'has no link to'} Confirm Delivery`,
        { tag: '@functional' },
        async ({ page }) => {
          await page.goto(backendHomePath);

          await expect(
            page.locator('.app-sidebar a[href="/backend/survey/confirm-delivery-survey/index"]'),
          ).toHaveCount(allowed ? 1 : 0);
        },
      );

      // Sent only where it must be refused: an empty form (which could not create anything) and
      // a question ID that does not exist.
      if (!allowed) {
        test(
          'server rejects adding or updating a question',
          { tag: '@negative' },
          async ({ page, mazadDashboardPage }) => {
            await page.goto(backendHomePath);

            expect(
              await mazadDashboardPage.postAction(confirmDeliveryUrls.createPath),
              'create HTTP status',
            ).toBe(forbiddenStatus);
            expect(
              await mazadDashboardPage.postAction(confirmDeliveryUrls.updatePath('0')),
              'update HTTP status',
            ).toBe(forbiddenStatus);
          },
        );
      }
    },
  );
}
