import type { Browser, Page } from '@playwright/test';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { signInError } from '@fixtures/backend-sign-in';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import {
  adminRowActions,
  adminViewLabels,
  invalidAdminCases,
  isTestAdmin,
  newTestAdmin,
  superAdminText as text,
  superAdminUrls,
} from '@test-data/super-admin.data';

/**
 * Mazad Backend > Super Admins: create form validation, then one QA-AUTO test admin created,
 * checked everywhere it shows, edited (one field, several fields, status, password) and deleted.
 * The last test deletes the admin; afterAll deletes it (and any duplicate a broken check let
 * through) if an earlier step failed. Real admins are only read, never changed.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

type PagesOn = (tab: Page) => BackendPages;

/** Deletes, in a fresh Dev Root tab, every QA-AUTO admin with one of these phones. */
async function deleteAdminsByPhone(browser: Browser, pagesOn: PagesOn, phones: string[]) {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: DEV_ROOT_SESSION_FILE,
  });
  const { superAdminListPage: list } = pagesOn(await context.newPage());
  for (const phone of phones) {
    await list.open({ phone });
    for (const row of await list.readRows()) {
      if (row['English Name'].startsWith('QA-AUTO')) await list.deleteAdmin(row.ID);
    }
  }
  await context.close();
}

/** Phone used by a would-be duplicate admin; differs from the original in its 4th digit. */
const otherPhone = (phone: string) => `0598${phone.slice(4)}`;

test.describe('Super Admin - create form validation', { tag: ['@regression'] }, () => {
  const valid = newTestAdmin();

  test.beforeEach(async ({ superAdminFormPage: form }) => {
    await form.gotoCreate();
  });

  // A refusal that stops working would save an admin; remove any such record.
  test.afterAll(async ({ browser, pagesOn }) => {
    await deleteAdminsByPhone(browser, pagesOn, [valid.phone, otherPhone(valid.phone)]);
  });

  test(
    'Create form shows its fields with Status not chosen',
    { tag: ['@smoke', '@ui'] },
    async ({ page, superAdminFormPage: form }) => {
      await expect(page).toHaveTitle(text.createTitle);
      await expect(form.pageHeading).toHaveText(text.createTitle);
      await expect(form.content).toContainText(text.formSection);
      await expect(form.fieldLabels).toHaveText([
        'Arabic Name',
        'English Name',
        'Status',
        'Phone',
        'Email',
        'New Password',
        'Confirm the new password',
      ]);
      await expect(form.selectedStatus()).toHaveText(text.statusPlaceholder);
      await expect(form.input('newPassword')).toHaveAttribute('type', 'password');
      await expect(form.input('passwordConfirm')).toHaveAttribute('type', 'password');
    },
  );

  test(
    'Empty form shows a required error for each mandatory field',
    { tag: ['@negative'] },
    async ({ page, superAdminFormPage: form }) => {
      await form.save();

      await expect(page).toHaveURL(superAdminUrls.create);
      // Only these five: Email and the password confirmation are optional.
      expect(await form.errorTexts()).toEqual(Object.values(text.required));
    },
  );

  for (const { name, data, confirm, error } of invalidAdminCases(valid)) {
    test(`Refuses ${name}`, { tag: ['@negative'] }, async ({ page, superAdminFormPage: form }) => {
      await form.fill({ ...valid, ...data });
      if (confirm !== undefined) await form.input('passwordConfirm').fill(confirm);
      await form.save();

      await expect(page).toHaveURL(superAdminUrls.create);
      expect(await form.errorTexts()).toContain(error);
    });
  }

  test(
    'Refuses the phone and the email of an existing admin',
    { tag: ['@negative'] },
    async ({ page, superAdminListPage: list, superAdminFormPage: form }) => {
      await list.goto();
      const existing = (await list.readRows()).find((row) => row.Email !== '(not set)')!;

      await form.gotoCreate();
      await form.fill({ ...valid, phone: existing.Phone });
      await form.save();
      await expect(page).toHaveURL(superAdminUrls.create);
      await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);

      // A fresh form: after a server error the password fields come back empty.
      await form.gotoCreate();
      const upperEmail = existing.Email.toUpperCase();
      await form.fill({ ...valid, phone: otherPhone(valid.phone), email: upperEmail });
      await form.save();
      await expect(page).toHaveURL(superAdminUrls.create);
      await expect(form.fieldError('email')).toHaveText(text.duplicate.email(upperEmail));
    },
  );

  test(
    'Keeps the entered values after a validation error',
    { tag: ['@negative'] },
    async ({ superAdminFormPage: form }) => {
      await form.fill({ ...valid, email: 'bad' });
      await form.save();

      await expect(form.fieldError('email')).toHaveText(text.invalid.email);
      await expect(form.input('name')).toHaveValue(valid.name);
      await expect(form.input('nameEn')).toHaveValue(valid.nameEn);
      await expect(form.selectedStatus()).toHaveText(shownOption(valid.status));
    },
  );
});

test.describe(
  'Super Admin - create, view, edit and delete',
  { tag: ['@regression', '@crud', '@mutates'] },
  () => {
    // Steps build on each other, and a retry would create another test admin.
    test.describe.configure({ mode: 'serial', retries: 0 });
    const admin = newTestAdmin();
    const edited = {
      name: `${admin.name} معدل`,
      nameEn: `${admin.nameEn} Edited`,
      email: admin.email.replace('@', '.edited@'),
      phone: `0597${admin.phone.slice(4)}`,
      password: `${admin.password}b`,
    };
    let adminId = '';

    test.afterAll(async ({ browser, pagesOn }) => {
      await deleteAdminsByPhone(browser, pagesOn, [
        admin.phone,
        edited.phone,
        otherPhone(admin.phone),
      ]);
    });

    test(
      'Creates an admin with valid data',
      { tag: ['@functional'] },
      async ({ page, superAdminListPage: list, superAdminFormPage: form }) => {
        await form.gotoCreate();
        await form.fill(admin);
        await form.save();

        await expect(page).toHaveURL(superAdminUrls.list);
        await expect(list.flashMessage).toContainText(text.createdMessage);
        // Totals are not compared: the access spec adds test admins in parallel.
        await list.open({ phone: admin.phone });
        const ids = await list.rowIds();
        expect(ids).toHaveLength(1);
        adminId = ids[0];
      },
    );

    test(
      'The new admin is listed above every real admin, with the saved values',
      { tag: ['@functional'] },
      async ({ superAdminListPage: list }) => {
        await list.goto();
        const rows = await list.readRows();
        // Other QA-AUTO admins from the access spec may be listed above it.
        const index = rows.findIndex((row) => row.ID === adminId);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(rows.findIndex((row) => !isTestAdmin(row)));

        expect(rows[index]).toMatchObject({
          '#': String(index + 1),
          ID: adminId,
          'Arabic Name': admin.name,
          'English Name': admin.nameEn,
          Status: 'active',
          Email: admin.email,
          Phone: admin.phone,
        });
        expect(await list.rowActions(adminId)).toEqual([...adminRowActions]);
      },
    );

    test(
      'Each filter finds the new admin',
      { tag: ['@functional'] },
      async ({ superAdminListPage: list }) => {
        for (const filters of [
          { phone: admin.phone },
          { nameEn: admin.nameEn },
          { name: admin.name },
          { email: admin.email },
          { nameEn: admin.nameEn.toLowerCase(), status: 'active' },
        ]) {
          await test.step(`Filter by ${Object.keys(filters).join(' + ')}`, async () => {
            await list.goto();
            await list.searchBy(filters);
            expect(await list.rowIds()).toEqual([adminId]);
          });
        }
      },
    );

    test(
      'The View page shows the saved values, also after a refresh',
      { tag: ['@functional'] },
      async ({ page, superAdminFormPage: form }) => {
        await form.gotoView(adminId);
        await expect(page).toHaveTitle(admin.nameEn);
        await expect(form.viewLabels).toHaveText([...adminViewLabels]);

        for (const pass of ['first load', 'after refresh']) {
          const fields = await form.viewFields();
          expect(fields, pass).toMatchObject({
            'English Name': admin.nameEn,
            'Arabic Name': admin.name,
            Status: 'active',
            Email: admin.email,
            Phone: admin.phone,
          });
          expect(fields['Updated At']).toBe(fields['Created At']);
          await page.reload();
        }
      },
    );

    test(
      'The admin can sign in with the password set',
      { tag: ['@functional'] },
      async ({ browser, pagesOn }) => {
        expect(await signInError(browser, pagesOn, admin.phone, admin.password)).toBeNull();
      },
    );

    test(
      'A second admin with the same phone or email is refused',
      { tag: ['@negative'] },
      async ({ page, superAdminFormPage: form }) => {
        await form.gotoCreate();
        await form.fill({ ...admin, email: `other.${admin.email}` });
        await form.save();
        await expect(page).toHaveURL(superAdminUrls.create);
        await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);

        await form.gotoCreate();
        await form.fill({ ...admin, phone: otherPhone(admin.phone) });
        await form.save();
        await expect(page).toHaveURL(superAdminUrls.create);
        await expect(form.fieldError('email')).toHaveText(text.duplicate.email(admin.email));
      },
    );

    test(
      'The edit form is filled with the saved values',
      { tag: ['@functional'] },
      async ({ page, superAdminFormPage: form }) => {
        await form.gotoUpdate(adminId);

        await expect(page).toHaveTitle(`${text.updateTitlePrefix}${admin.nameEn}`);
        await expect(form.input('name')).toHaveValue(admin.name);
        await expect(form.input('nameEn')).toHaveValue(admin.nameEn);
        await expect(form.input('email')).toHaveValue(admin.email);
        await expect(form.selectedStatus()).toHaveText(shownOption('active'));
        // The phone input shows the number without its leading 0, spaced out.
        await expect(form.input('phone')).toHaveValue(
          new RegExp(`^${admin.phone.slice(1).split('').join('\\s*')}$`),
        );
        // Password fields are never pre-filled.
        await expect(form.input('newPassword')).toBeEmpty();
        await expect(form.input('passwordConfirm')).toBeEmpty();
      },
    );

    test(
      'Invalid edits are refused and change nothing',
      { tag: ['@negative'] },
      async ({ superAdminListPage: list, superAdminFormPage: form }) => {
        const cases = [
          { field: 'nameEn', value: '', error: text.required.nameEn },
          { field: 'name', value: '', error: text.required.name },
          { field: 'email', value: 'bad@', error: text.invalid.email },
          { field: 'phone', value: '05123', error: text.invalid.phone },
        ] as const;
        for (const { field, value, error } of cases) {
          await test.step(`${field} = "${value}"`, async () => {
            await form.gotoUpdate(adminId);
            await form.input(field).fill(value);
            await form.save();
            await expect(form.fieldError(field)).toHaveText(error);
          });
        }

        await test.step('Short and mismatching passwords', async () => {
          await form.gotoUpdate(adminId);
          await form.fill({ password: 'abc' });
          await form.save();
          await expect(form.fieldError('newPassword')).toHaveText(text.invalid.passwordTooShort);

          await form.gotoUpdate(adminId);
          await form.input('newPassword').fill(edited.password);
          await form.input('passwordConfirm').fill(`${edited.password}x`);
          await form.save();
          await expect(form.fieldError('passwordConfirm')).toHaveText(
            text.invalid.passwordMismatch,
          );
        });

        await list.open({ phone: admin.phone });
        const [row] = await list.readRows();
        expect(row).toMatchObject({
          ID: adminId,
          'Arabic Name': admin.name,
          'English Name': admin.nameEn,
          Email: admin.email,
        });
      },
    );

    test(
      'Changing the phone or email to one already in use is refused',
      { tag: ['@negative'] },
      async ({ superAdminListPage: list, superAdminFormPage: form }) => {
        await list.goto();
        const other = (await list.readRows()).find(
          (row) => row.ID !== adminId && row.Email !== '(not set)',
        )!;

        await form.gotoUpdate(adminId);
        await form.input('phone').fill(other.Phone);
        await form.save();
        await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);

        await form.gotoUpdate(adminId);
        await form.input('email').fill(other.Email);
        await form.save();
        await expect(form.fieldError('email')).toHaveText(text.duplicate.email(other.Email));

        await list.open({ phone: admin.phone });
        expect(await list.columnValues('Email')).toEqual([admin.email]);
      },
    );

    test(
      'Editing one field saves it and keeps the password',
      { tag: ['@functional'] },
      async ({ page, browser, pagesOn, superAdminListPage: list, superAdminFormPage: form }) => {
        await form.gotoView(adminId);
        const { 'Created At': createdAt } = await form.viewFields();

        await form.gotoUpdate(adminId);
        await form.input('nameEn').fill(edited.nameEn);
        await form.save();

        await expect(page).toHaveURL(superAdminUrls.list);
        await expect(list.flashMessage).toContainText(text.updatedMessage);
        await list.open({ phone: admin.phone });
        expect(await list.columnValues('English Name')).toEqual([edited.nameEn]);

        await form.gotoView(adminId);
        const fields = await form.viewFields();
        expect(fields['Created At']).toBe(createdAt);
        expect(fields['Updated At'] >= createdAt).toBe(true);
        expect(await signInError(browser, pagesOn, admin.phone, admin.password)).toBeNull();
      },
    );

    test(
      'Editing several fields and the password saves them all',
      { tag: ['@functional'] },
      async ({ page, browser, pagesOn, superAdminListPage: list, superAdminFormPage: form }) => {
        await form.gotoUpdate(adminId);
        await form.fill({
          name: edited.name,
          email: edited.email,
          phone: edited.phone,
          password: edited.password,
        });
        await form.save();
        await expect(list.flashMessage).toContainText(text.updatedMessage);

        await test.step('The View page shows the new values after a refresh', async () => {
          await form.gotoView(adminId);
          await page.reload();
          expect(await form.viewFields()).toMatchObject({
            'English Name': edited.nameEn,
            'Arabic Name': edited.name,
            Email: edited.email,
            Phone: edited.phone,
          });
        });

        await test.step('Filters find the new values, not the old ones', async () => {
          await list.open({ phone: edited.phone });
          expect(await list.rowIds()).toEqual([adminId]);
          await list.open({ email: edited.email });
          expect(await list.rowIds()).toEqual([adminId]);
          await list.open({ phone: admin.phone });
          await expect(list.emptyMessage).toHaveText(text.emptyState);
        });

        await test.step('Only the new phone and password sign in', async () => {
          expect(await signInError(browser, pagesOn, edited.phone, edited.password)).toBeNull();
          expect(await signInError(browser, pagesOn, edited.phone, admin.password)).toBe(
            text.wrongLogin,
          );
          expect(await signInError(browser, pagesOn, admin.phone, edited.password)).toBe(
            text.wrongLogin,
          );
        });
      },
    );

    test(
      'An inactive admin is listed as inactive and cannot sign in',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, superAdminListPage: list, superAdminFormPage: form }) => {
        await form.gotoUpdate(adminId);
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
      'An inactive admin can be made active again',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, superAdminListPage: list, superAdminFormPage: form }) => {
        await form.gotoUpdate(adminId);
        await form.selectStatus('active');
        await form.save();

        await list.open({ phone: edited.phone });
        expect(await list.columnValues('Status')).toEqual(['active']);
        expect(await signInError(browser, pagesOn, edited.phone, edited.password)).toBeNull();
      },
    );

    test(
      'Delete asks for confirmation; Cancel keeps the admin',
      { tag: ['@functional'] },
      async ({ superAdminListPage: list }) => {
        await list.open({ phone: edited.phone });
        await list.clickDelete(adminId);
        await expect(list.confirmDialog.message).toHaveText(text.deleteConfirmation);

        await list.confirmDialog.cancel();
        await expect(list.confirmDialog.dialog).toBeHidden();
        await list.open({ phone: edited.phone });
        expect(await list.rowIds()).toEqual([adminId]);
      },
    );

    test(
      'Delete removes the admin everywhere and it can no longer sign in',
      { tag: ['@functional'] },
      async ({ page, browser, pagesOn, superAdminListPage: list }) => {
        await list.open({ phone: edited.phone });
        await list.deleteAdmin(adminId);

        await expect(page).toHaveURL(superAdminUrls.list);
        await expect(list.flashMessage).toContainText(text.deletedMessage);
        await expect(list.row(adminId)).toHaveCount(0);
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

    // The new admins below are QA-AUTO records; afterAll deletes them by phone.
    test(
      'The phone of a deleted admin can be used for a new admin',
      { tag: ['@functional'] },
      async ({ page, superAdminListPage: list, superAdminFormPage: form }) => {
        await form.gotoCreate();
        await form.fill({ ...newTestAdmin(), phone: edited.phone });
        await form.save();

        await expect(page).toHaveURL(superAdminUrls.list);
        await list.open({ phone: edited.phone });
        await expect(list.rows).toHaveCount(1);
      },
    );
  },
);
