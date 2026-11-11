import type { Browser, Page } from '@playwright/test';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { signInError } from '@fixtures/backend-sign-in';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import {
  ccManagerMaxLength,
  invalidOperationCases,
  isTestOperation,
  newTestOperation,
  operationFormLabels,
  operationRoles,
  operationRowActions,
  operationText as text,
  operationUrls,
  operationViewLabels,
} from '@test-data/operation.data';

/**
 * Mazad Backend > Operations: create form validation, then one QA-AUTO test operation created,
 * checked everywhere it shows, edited (one field, role, several fields with password, status)
 * and deleted. The page has no Delete action, so the delete step and the cleanup use the
 * server's delete route. afterAll deletes the test operation (and any duplicate a broken check
 * let through) if an earlier step failed. Real operations are only read, never changed.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

type PagesOn = (tab: Page) => BackendPages;

/** Deletes, in a fresh Dev Root tab, every QA-AUTO operation with one of these phones. */
async function deleteOperationsByPhone(browser: Browser, pagesOn: PagesOn, phones: string[]) {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: DEV_ROOT_SESSION_FILE,
  });
  const { operationListPage: list } = pagesOn(await context.newPage());
  for (const phone of phones) {
    await list.open({ phone });
    for (const row of await list.readRows()) {
      if (isTestOperation(row)) await list.deleteById(row.ID);
    }
  }
  await context.close();
}

/** Phone used by a would-be duplicate operation; differs from the original in its 4th digit. */
const otherPhone = (phone: string) => `0598${phone.slice(4)}`;

test.describe('Operation - create form validation', { tag: ['@regression'] }, () => {
  const valid = newTestOperation();

  test.beforeEach(async ({ operationFormPage: form }) => {
    await form.gotoCreate();
  });

  // A refusal that stops working would save an operation; remove any such record.
  test.afterAll(async ({ browser, pagesOn }) => {
    await deleteOperationsByPhone(browser, pagesOn, [valid.phone, otherPhone(valid.phone)]);
  });

  test(
    'Create form shows its fields with Role and Status not chosen',
    { tag: ['@smoke', '@ui'] },
    async ({ page, operationFormPage: form }) => {
      await expect(page).toHaveTitle(text.createTitle);
      await expect(form.pageHeading).toHaveText(text.createTitle);
      await expect(form.content).toContainText(text.formSection);
      await expect(form.fieldLabels).toHaveText([...operationFormLabels]);
      await expect(form.selectedRole()).toHaveText(text.rolePlaceholder);
      await expect(form.roleOptions).toHaveText([text.rolePlaceholder, ...operationRoles]);
      await expect(form.selectedStatus()).toHaveText(text.statusPlaceholder);
      await expect(form.input('newPassword')).toHaveAttribute('type', 'password');
      await expect(form.input('passwordConfirm')).toHaveAttribute('type', 'password');
    },
  );

  test(
    'Empty form shows a required error for each mandatory field',
    { tag: ['@negative'] },
    async ({ page, operationFormPage: form }) => {
      await form.save();

      await expect(page).toHaveURL(operationUrls.create);
      // Only these five: Role, Email, CC Manager and the confirmation are optional.
      expect(await form.errorTexts()).toEqual(Object.values(text.required));
    },
  );

  for (const { name, data, confirm, error } of invalidOperationCases(valid)) {
    test(`Refuses ${name}`, { tag: ['@negative'] }, async ({ page, operationFormPage: form }) => {
      await form.fill({ ...valid, ...data });
      if (confirm !== undefined) await form.input('passwordConfirm').fill(confirm);
      await form.save();

      await expect(page).toHaveURL(operationUrls.create);
      expect(await form.errorTexts()).toContain(error);
    });
  }

  test(
    'CC Manager stops at 1024 characters while typing',
    { tag: ['@negative'] },
    async ({ operationFormPage: form }) => {
      await form.typeInto('ccManager', 'a'.repeat(ccManagerMaxLength + 6));
      await expect(form.input('ccManager')).toHaveValue('a'.repeat(ccManagerMaxLength));
    },
  );

  test(
    'Refuses the phone and the email of an existing operation',
    { tag: ['@negative'] },
    async ({ page, operationListPage: list, operationFormPage: form }) => {
      await list.goto();
      const existing = (await list.readRows()).find(
        (row) => !isTestOperation(row) && row.Email !== '(not set)',
      )!;

      await form.gotoCreate();
      await form.fill({ ...valid, phone: existing.Phone });
      await form.save();
      await expect(page).toHaveURL(operationUrls.create);
      await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);

      // A fresh form: after a server error the password fields come back empty.
      await form.gotoCreate();
      const upperEmail = existing.Email.toUpperCase();
      await form.fill({ ...valid, phone: otherPhone(valid.phone), email: upperEmail });
      await form.save();
      await expect(page).toHaveURL(operationUrls.create);
      await expect(form.fieldError('email')).toHaveText(text.duplicate.email(upperEmail));
    },
  );

  test(
    'Keeps the entered values after a validation error',
    { tag: ['@negative'] },
    async ({ operationFormPage: form }) => {
      await form.fill({ ...valid, email: 'bad' });
      await form.save();

      await expect(form.fieldError('email')).toHaveText(text.invalid.email);
      await expect(form.input('name')).toHaveValue(valid.name);
      await expect(form.input('nameEn')).toHaveValue(valid.nameEn);
      await expect(form.input('ccManager')).toHaveValue(valid.ccManager);
      await expect(form.selectedRole()).toHaveText(shownOption(valid.role));
      await expect(form.selectedStatus()).toHaveText(shownOption(valid.status));
    },
  );
});

test.describe(
  'Operation - create, view, edit and delete',
  { tag: ['@regression', '@crud', '@mutates'] },
  () => {
    // Steps build on each other, and a retry would create another test operation.
    test.describe.configure({ mode: 'serial', retries: 0 });
    const operation = newTestOperation();
    /** The CC Manager list as the server stores it (no space after commas). */
    const savedCc = operation.ccManager.replace(/,\s*/g, ',');
    const edited = {
      name: `${operation.name} معدل`,
      nameEn: `${operation.nameEn} Edited`,
      email: operation.email.replace('@', '.edited@'),
      phone: `0596${operation.phone.slice(4)}`,
      password: `${operation.password}b`,
    };
    let operationId = '';

    test.afterAll(async ({ browser, pagesOn }) => {
      await deleteOperationsByPhone(browser, pagesOn, [
        operation.phone,
        edited.phone,
        otherPhone(operation.phone),
      ]);
    });

    test(
      'Creates an operation with every field filled',
      { tag: ['@functional'] },
      async ({ page, operationListPage: list, operationFormPage: form }) => {
        await form.gotoCreate();
        await form.fill(operation);
        await form.save();

        await expect(page).toHaveURL(operationUrls.list);
        await expect(list.flashMessage).toContainText(text.createdMessage);
        await list.open({ phone: operation.phone });
        const ids = await list.rowIds();
        expect(ids).toHaveLength(1);
        operationId = ids[0];
      },
    );

    test(
      'The new operation is listed above every real operation, with the saved values',
      { tag: ['@functional'] },
      async ({ operationListPage: list }) => {
        await list.goto();
        const rows = await list.readRows();
        // Other QA-AUTO operations from the access spec may be listed above it.
        const index = rows.findIndex((row) => row.ID === operationId);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(rows.findIndex((row) => !isTestOperation(row)));

        expect(rows[index]).toMatchObject({
          '#': String(index + 1),
          'Arabic Name': operation.name,
          'English Name': operation.nameEn,
          Status: 'active',
          Email: operation.email,
          Phone: operation.phone,
          'Job Title': operation.role,
        });
        expect(await list.rowActions(operationId)).toEqual([...operationRowActions]);
      },
    );

    test(
      'Each filter finds the new operation',
      { tag: ['@functional'] },
      async ({ operationListPage: list }) => {
        for (const filters of [
          { phone: operation.phone },
          { nameEn: operation.nameEn },
          { name: operation.name },
          { email: operation.email },
          { nameEn: operation.nameEn.toLowerCase(), status: 'active' },
        ]) {
          await test.step(`Filter by ${Object.keys(filters).join(' + ')}`, async () => {
            await list.goto();
            await list.searchBy(filters);
            expect(await list.rowIds()).toEqual([operationId]);
          });
        }
      },
    );

    test(
      'The View page shows the saved values, also after a refresh',
      { tag: ['@functional'] },
      async ({ page, operationFormPage: form }) => {
        await form.gotoView(operationId);
        await expect(page).toHaveTitle(operation.nameEn);
        await expect(form.viewLabels).toHaveText([...operationViewLabels]);
        await expect(form.viewDeleteButton).toHaveCount(0);

        for (const pass of ['first load', 'after refresh']) {
          const fields = await form.viewFields();
          expect(fields, pass).toMatchObject({
            'English Name': operation.nameEn,
            'Arabic Name': operation.name,
            'Operation Role': operation.role,
            Status: 'active',
            Email: operation.email,
            Phone: operation.phone,
            'CC Manager': savedCc,
          });
          expect(fields['Updated At']).toBe(fields['Created At']);
          await page.reload();
        }
      },
    );

    test(
      'The operation can sign in with the password set',
      { tag: ['@functional'] },
      async ({ browser, pagesOn }) => {
        expect(await signInError(browser, pagesOn, operation.phone, operation.password)).toBeNull();
      },
    );

    test(
      'A second operation with the same phone or email is refused',
      { tag: ['@negative'] },
      async ({ page, operationFormPage: form }) => {
        await form.gotoCreate();
        await form.fill({ ...operation, email: `other.${operation.email}` });
        await form.save();
        await expect(page).toHaveURL(operationUrls.create);
        await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);

        await form.gotoCreate();
        await form.fill({ ...operation, phone: otherPhone(operation.phone) });
        await form.save();
        await expect(page).toHaveURL(operationUrls.create);
        await expect(form.fieldError('email')).toHaveText(text.duplicate.email(operation.email));
      },
    );

    test(
      'The edit form is filled with the saved values',
      { tag: ['@functional'] },
      async ({ page, operationFormPage: form }) => {
        await form.gotoUpdate(operationId);

        await expect(page).toHaveTitle(`${text.updateTitlePrefix}${operation.name}`);
        await expect(form.fieldLabels).toHaveText([...operationFormLabels]);
        await expect(form.input('name')).toHaveValue(operation.name);
        await expect(form.input('nameEn')).toHaveValue(operation.nameEn);
        await expect(form.input('email')).toHaveValue(operation.email);
        await expect(form.input('ccManager')).toHaveValue(savedCc);
        await expect(form.selectedRole()).toHaveText(shownOption(operation.role));
        await expect(form.selectedStatus()).toHaveText(shownOption('active'));
        // The phone input shows the number without its leading 0, spaced out.
        await expect(form.input('phone')).toHaveValue(
          new RegExp(`^${operation.phone.slice(1).split('').join('\\s*')}$`),
        );
        // Password fields are never pre-filled.
        await expect(form.input('newPassword')).toBeEmpty();
        await expect(form.input('passwordConfirm')).toBeEmpty();
      },
    );

    test(
      'Invalid edits are refused and change nothing',
      { tag: ['@negative'] },
      async ({ operationListPage: list, operationFormPage: form }) => {
        const cases = [
          { field: 'nameEn', value: '', error: text.required.nameEn },
          { field: 'name', value: '', error: text.required.name },
          { field: 'phone', value: '', error: text.required.phone },
          { field: 'phone', value: '05123', error: text.invalid.phone },
          { field: 'email', value: 'bad@', error: text.invalid.email },
          { field: 'ccManager', value: 'x@y', error: text.invalid.ccManager('x@y') },
        ] as const;
        for (const { field, value, error } of cases) {
          await test.step(`${field} = "${value}"`, async () => {
            await form.gotoUpdate(operationId);
            await form.input(field).fill(value);
            await form.save();
            await expect(form.fieldError(field)).toHaveText(error);
          });
        }
        await test.step('Short and mismatching passwords', async () => {
          await form.gotoUpdate(operationId);
          await form.fill({ password: 'abc' });
          await form.save();
          await expect(form.fieldError('newPassword')).toHaveText(text.invalid.passwordTooShort);

          await form.gotoUpdate(operationId);
          await form.input('newPassword').fill(edited.password);
          await form.input('passwordConfirm').fill(`${edited.password}x`);
          await form.save();
          await expect(form.fieldError('passwordConfirm')).toHaveText(
            text.invalid.passwordMismatch,
          );
        });

        await list.open({ phone: operation.phone });
        expect((await list.readRows())[0]).toMatchObject({
          ID: operationId,
          'Arabic Name': operation.name,
          'English Name': operation.nameEn,
          Email: operation.email,
        });
      },
    );

    test(
      'Changing the phone or email to one already in use is refused',
      { tag: ['@negative'] },
      async ({ operationListPage: list, operationFormPage: form }) => {
        await list.goto();
        const other = (await list.readRows()).find(
          (row) => !isTestOperation(row) && row.Email !== '(not set)',
        )!;

        await form.gotoUpdate(operationId);
        await form.input('phone').fill(other.Phone);
        await form.save();
        await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);

        await form.gotoUpdate(operationId);
        await form.input('email').fill(other.Email);
        await form.save();
        await expect(form.fieldError('email')).toHaveText(text.duplicate.email(other.Email));

        await list.open({ phone: operation.phone });
        expect(await list.columnValues('Email')).toEqual([operation.email]);
      },
    );

    test(
      'Editing one field saves it and keeps the password',
      { tag: ['@functional'] },
      async ({ page, browser, pagesOn, operationListPage: list, operationFormPage: form }) => {
        await form.gotoView(operationId);
        const { 'Created At': createdAt } = await form.viewFields();

        await form.gotoUpdate(operationId);
        await form.input('nameEn').fill(edited.nameEn);
        await form.save();

        await expect(page).toHaveURL(operationUrls.list);
        await expect(list.flashMessage).toContainText(text.updatedMessage);
        await list.open({ phone: operation.phone });
        expect(await list.columnValues('English Name')).toEqual([edited.nameEn]);

        await form.gotoView(operationId);
        const fields = await form.viewFields();
        expect(fields['English Name']).toBe(edited.nameEn);
        expect(fields['Created At']).toBe(createdAt);
        expect(fields['Updated At'] >= createdAt).toBe(true);
        expect(await signInError(browser, pagesOn, operation.phone, operation.password)).toBeNull();
      },
    );

    test(
      'Changing and clearing the Operation Role shows in the grid and View page',
      { tag: ['@functional'] },
      async ({ operationListPage: list, operationFormPage: form }) => {
        await test.step('Another role', async () => {
          await form.gotoUpdate(operationId);
          await form.selectRole('Customer Support');
          await form.save();
          await list.open({ phone: operation.phone });
          expect(await list.columnValues('Job Title')).toEqual(['Customer Support']);
        });

        await test.step('No role', async () => {
          await form.gotoUpdate(operationId);
          await form.selectRole('');
          await form.save();
          await list.open({ phone: operation.phone });
          expect(await list.columnValues('Job Title')).toEqual(['(not set)']);
          await form.gotoView(operationId);
          expect((await form.viewFields())['Operation Role']).toBe('');
        });
      },
    );

    test(
      'Editing several fields and the password saves them all',
      { tag: ['@functional'] },
      async ({ page, browser, pagesOn, operationListPage: list, operationFormPage: form }) => {
        await form.gotoUpdate(operationId);
        await form.fill({
          name: edited.name,
          role: operation.role,
          email: edited.email,
          phone: edited.phone,
          ccManager: '',
          password: edited.password,
        });
        await form.save();
        await expect(list.flashMessage).toContainText(text.updatedMessage);

        await test.step('The View page shows the new values after a refresh', async () => {
          await form.gotoView(operationId);
          await page.reload();
          expect(await form.viewFields()).toMatchObject({
            'English Name': edited.nameEn,
            'Arabic Name': edited.name,
            'Operation Role': operation.role,
            Email: edited.email,
            Phone: edited.phone,
            'CC Manager': '',
          });
        });

        await test.step('The list and filters show the new values, not the old ones', async () => {
          await list.open({ phone: edited.phone });
          expect((await list.readRows())[0]).toMatchObject({
            ID: operationId,
            'Arabic Name': edited.name,
            Email: edited.email,
          });
          await list.open({ email: edited.email });
          expect(await list.rowIds()).toEqual([operationId]);
          await list.open({ phone: operation.phone });
          await expect(list.emptyMessage).toHaveText(text.emptyState);
        });

        await test.step('Only the new phone and password sign in', async () => {
          expect(await signInError(browser, pagesOn, edited.phone, edited.password)).toBeNull();
          expect(await signInError(browser, pagesOn, edited.phone, operation.password)).toBe(
            text.wrongLogin,
          );
          expect(await signInError(browser, pagesOn, operation.phone, edited.password)).toBe(
            text.wrongLogin,
          );
        });
      },
    );

    test(
      'An inactive operation is listed as inactive and cannot sign in',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, operationListPage: list, operationFormPage: form }) => {
        await form.gotoUpdate(operationId);
        await form.selectStatus('inactive');
        await form.save();

        await list.open({ phone: edited.phone, status: 'inactive' });
        expect(await list.columnValues('Status')).toEqual(['inactive']);
        expect(await signInError(browser, pagesOn, edited.phone, edited.password)).toBe(
          text.inactiveLogin,
        );
      },
    );

    test(
      'An inactive operation can be made active again',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, operationListPage: list, operationFormPage: form }) => {
        await form.gotoUpdate(operationId);
        await form.selectStatus('active');
        await form.save();

        await list.open({ phone: edited.phone });
        expect(await list.columnValues('Status')).toEqual(['active']);
        expect(await signInError(browser, pagesOn, edited.phone, edited.password)).toBeNull();
      },
    );

    test(
      'Deleting removes the operation everywhere and it can no longer sign in',
      { tag: ['@functional'] },
      async ({ page, browser, pagesOn, operationListPage: list }) => {
        await list.open({ phone: edited.phone });
        // The page has no Delete action; this sends what a Delete link would.
        expect(await list.deleteById(operationId)).toBe(302);

        await list.goto();
        await expect(page).toHaveURL(operationUrls.list);
        await expect(list.flashMessage).toContainText(text.deletedMessage);
        await expect(list.row(operationId)).toHaveCount(0);
        for (const filters of [
          { phone: edited.phone },
          { email: edited.email },
          { nameEn: edited.nameEn },
        ]) {
          await list.open(filters);
          await expect(list.rows, JSON.stringify(filters)).toHaveCount(0);
        }
        expect(await signInError(browser, pagesOn, edited.phone, edited.password)).toBe(
          text.wrongLogin,
        );
      },
    );
  },
);
