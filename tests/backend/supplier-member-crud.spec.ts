import type { Browser, Page } from '@playwright/test';
import { BackendAccount, DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import {
  invalidMemberCases,
  memberRowActions,
  newTestMember,
  permissionSections,
  supplierMemberText as text,
  supplierMemberUrls,
} from '@test-data/supplier-member.data';

/**
 * Mazad Backend > Supplier Members: create form validation, then one QA-AUTO test member created
 * under the QA-AUTO test supplier, checked everywhere it shows, edited, given a permission and
 * deleted. The last test deletes the member; afterAll deletes it (and any duplicate a broken
 * check let through) if an earlier step failed.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

type PagesOn = (tab: Page) => BackendPages;

/**
 * Signs in as a member in a fresh, signed-out browser. Returns null when the sign-in succeeded,
 * or the error the login page shows.
 */
async function loginError(
  browser: Browser,
  pagesOn: PagesOn,
  phone: string,
  password: string,
): Promise<string | null> {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const tab = await context.newPage();
  const { mazadLoginPage: login } = pagesOn(tab);
  await login.goto();
  await Promise.all([tab.waitForEvent('load'), login.loginAs(new BackendAccount(phone, password))]);
  const signedIn = !(await login.form.isVisible());
  const errors = [
    ...(await login.phoneError.allInnerTexts()),
    ...(await login.passwordError.allInnerTexts()),
  ]
    .map((error) => error.trim())
    .filter(Boolean)
    .join(' ');
  await context.close();
  return signedIn ? null : errors;
}

test.describe('Supplier member - create form validation', { tag: ['@regression'] }, () => {
  const valid = newTestMember();
  let existingPhone = '';

  test.beforeEach(async ({ supplierMemberListPage: list, supplierMemberFormPage: form }) => {
    await list.goto();
    existingPhone = (await list.columnValues('Phone'))[0];
    await form.gotoCreate();
  });

  test(
    'Empty form shows a required error for each mandatory field',
    { tag: ['@negative'] },
    async ({ page, supplierMemberFormPage: form }) => {
      await expect(form.pageHeading).toHaveText(text.createTitle);
      await form.save();

      await expect(page).toHaveURL(supplierMemberUrls.create);
      // Only these six: Email and the password confirmation are optional.
      expect(await form.errorTexts()).toEqual(Object.values(text.required));
    },
  );

  for (const { name, data, confirm, error } of invalidMemberCases(valid)) {
    test(
      `Refuses ${name}`,
      { tag: ['@negative'] },
      async ({ page, supplierMemberFormPage: form }) => {
        await form.fill({ ...valid, ...data });
        if (confirm !== undefined) await form.input('passwordConfirm').fill(confirm);
        await form.save();

        await expect(page).toHaveURL(supplierMemberUrls.create);
        expect(await form.errorTexts()).toContain(error);
      },
    );
  }

  test(
    'Refuses the phone of an existing member',
    { tag: ['@negative'] },
    async ({ page, supplierMemberFormPage: form }) => {
      await form.fill({ ...valid, phone: existingPhone });
      await form.save();

      await expect(page).toHaveURL(supplierMemberUrls.create);
      await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);
    },
  );

  test(
    'Keeps the entered values after a validation error',
    { tag: ['@negative'] },
    async ({ supplierMemberFormPage: form }) => {
      await form.fill({ ...valid, email: 'bad' });
      await form.save();

      await expect(form.input('name')).toHaveValue(valid.name);
      await expect(form.input('nameEn')).toHaveValue(valid.nameEn);
      await expect(form.input('parent')).toHaveValue(valid.parentId);
    },
  );
});

test.describe(
  'Supplier member - create, edit, permissions and delete',
  { tag: ['@regression', '@crud', '@mutates'] },
  () => {
    // Steps build on each other, and a retry would create another test member.
    test.describe.configure({ mode: 'serial', retries: 0 });
    const member = newTestMember();
    /** Phone of the would-be duplicate in the "same email" check; deleted too if it was saved. */
    const duplicatePhone = `0596${member.phone.slice(-6)}`;
    const edited = {
      nameEn: `${member.nameEn} Edited`,
      email: member.email.replace('@', '.edited@'),
      password: `${member.password}b`,
    };
    let memberId = '';

    test.afterAll(async ({ browser, pagesOn }) => {
      const context = await browser.newContext({
        baseURL: envConfig.baseURL,
        storageState: DEV_ROOT_SESSION_FILE,
      });
      const { supplierMemberListPage: list } = pagesOn(await context.newPage());
      for (const phone of [member.phone, duplicatePhone]) {
        await list.open({ phone });
        for (const id of await list.rowIds()) await list.deleteMember(id);
      }
      await context.close();
    });

    test(
      'Create a member with valid data',
      { tag: ['@functional'] },
      async ({ page, supplierMemberListPage: list, supplierMemberFormPage: form }) => {
        await form.gotoCreate();
        await form.fill(member);
        await form.save();

        await expect(page).toHaveURL(supplierMemberUrls.list);
        await list.open({ phone: member.phone });
        const ids = await list.rowIds();
        expect(ids).toHaveLength(1);
        memberId = ids[0];
      },
    );

    test(
      'The new member is first in the list with the saved values',
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list }) => {
        await list.goto();
        const [first] = await list.readRows();

        expect(first).toMatchObject({
          ID: memberId,
          'Arabic Name': member.name,
          'English Name': member.nameEn,
          Status: 'active',
          Email: member.email,
          Phone: member.phone,
        });
        expect(await list.rowActions(memberId)).toEqual([...memberRowActions]);
      },
    );

    test(
      'Each filter finds the new member',
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list }) => {
        for (const filters of [
          { phone: member.phone },
          { nameEn: member.nameEn },
          { name: member.name },
          { email: member.email },
        ]) {
          await test.step(`Filter by ${Object.keys(filters)[0]}`, async () => {
            await list.goto();
            await list.searchBy(filters);
            expect(await list.rowIds()).toEqual([memberId]);
          });
        }
      },
    );

    test(
      'The View page shows the saved values',
      { tag: ['@functional'] },
      async ({ supplierMemberFormPage: form }) => {
        await form.gotoView(memberId);
        const values = await form.viewTexts();

        for (const value of [member.nameEn, member.name, 'active', member.email, member.phone]) {
          expect(values).toContain(value);
        }
      },
    );

    test(
      'The member can sign in with the password set',
      { tag: ['@functional'] },
      async ({ browser, pagesOn }) => {
        expect(await loginError(browser, pagesOn, member.phone, member.password)).toBeNull();
      },
    );

    // Each duplicate case starts from a fresh form: after a server error the password fields
    // come back empty, so a second save in the same form would stop at "cannot be blank".
    test(
      'A second member with the same phone is refused',
      { tag: ['@negative'] },
      async ({ page, supplierMemberFormPage: form }) => {
        await form.gotoCreate();
        await form.fill({ ...member, email: `other.${member.email}` });
        await form.save();

        await expect(page).toHaveURL(supplierMemberUrls.create);
        await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);
      },
    );

    test(
      'A second member with the same email is refused',
      { tag: ['@negative'] },
      async ({ page, supplierMemberFormPage: form }) => {
        await form.gotoCreate();
        await form.fill({ ...member, phone: duplicatePhone });
        await form.save();

        await expect(page).toHaveURL(supplierMemberUrls.create);
        await expect(form.fieldError('email')).toHaveText(text.duplicate.email(member.email));
      },
    );

    test(
      'The edit form is filled with the saved values',
      { tag: ['@functional'] },
      async ({ page, supplierMemberFormPage: form }) => {
        await form.gotoUpdate(memberId);

        await expect(page).toHaveTitle(`${text.updateTitlePrefix}${member.name}`);
        await expect(form.input('parent')).toHaveValue(member.parentId);
        await expect(form.input('name')).toHaveValue(member.name);
        await expect(form.input('nameEn')).toHaveValue(member.nameEn);
        await expect(form.input('email')).toHaveValue(member.email);
        await expect(form.selectedStatus()).toHaveText(shownOption('active'));
        // The phone input shows the number without its leading 0, spaced out.
        await expect(form.input('phone')).toHaveValue(
          new RegExp(`^${member.phone.slice(1).split('').join('\\s*')}$`),
        );
        // Password fields are never pre-filled.
        await expect(form.input('newPassword')).toBeEmpty();
      },
    );

    test(
      'Clearing a required field is refused and nothing changes',
      { tag: ['@negative'] },
      async ({ supplierMemberListPage: list, supplierMemberFormPage: form }) => {
        await form.gotoUpdate(memberId);
        await form.input('nameEn').fill('');
        await form.save();
        await expect(form.fieldError('nameEn')).toHaveText(text.required.nameEn);

        await list.open({ phone: member.phone });
        expect(await list.columnValues('English Name')).toEqual([member.nameEn]);
      },
    );

    test(
      'Editing the name and email saves them and keeps the password',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, supplierMemberListPage: list, supplierMemberFormPage: form }) => {
        await form.gotoView(memberId);
        const isDate = (v: string) => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v);
        const [createdAt, updatedAt] = (await form.viewTexts()).filter(isDate);

        await test.step('Save new English Name and email', async () => {
          await form.gotoUpdate(memberId);
          await form.input('nameEn').fill(edited.nameEn);
          await form.input('email').fill(edited.email);
          await form.save();
        });

        await test.step('The list shows the new values', async () => {
          await list.open({ phone: member.phone });
          const [row] = await list.readRows();
          expect(row).toMatchObject({
            'English Name': edited.nameEn,
            Email: edited.email,
            Phone: member.phone,
          });
        });

        await test.step('Updated At changes, Created At does not', async () => {
          await form.gotoView(memberId);
          const dates = (await form.viewTexts()).filter(isDate);
          expect(dates[0]).toBe(createdAt);
          expect(dates[1]).not.toBe(updatedAt);
        });

        await test.step('The password is unchanged', async () => {
          expect(await loginError(browser, pagesOn, member.phone, member.password)).toBeNull();
        });
      },
    );

    test(
      'Changing the phone to one already in use is refused',
      { tag: ['@negative'] },
      async ({ supplierMemberListPage: list, supplierMemberFormPage: form }) => {
        await list.goto();
        const otherPhone = (await list.readRows()).find((r) => r.ID !== memberId)!.Phone;
        await form.gotoUpdate(memberId);
        await form.input('phone').fill(otherPhone);
        await form.save();

        await expect(form.fieldError('phone')).toHaveText(text.duplicate.phone);
        await list.open({ phone: member.phone });
        expect(await list.rowIds()).toEqual([memberId]);
      },
    );

    test(
      'An inactive member is listed as inactive and cannot sign in',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, supplierMemberListPage: list, supplierMemberFormPage: form }) => {
        await form.gotoUpdate(memberId);
        await form.selectStatus('inactive');
        await form.save();

        await list.open({ phone: member.phone });
        expect(await list.columnValues('Status')).toEqual(['inactive']);
        expect(await loginError(browser, pagesOn, member.phone, member.password)).toContain(
          text.inactiveLogin,
        );
      },
    );

    test(
      'An inactive member can be made active again',
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list, supplierMemberFormPage: form }) => {
        await form.gotoUpdate(memberId);
        await form.selectStatus('active');
        await form.save();

        await list.open({ phone: member.phone });
        expect(await list.columnValues('Status')).toEqual(['active']);
      },
    );

    test(
      'A new password replaces the old one',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, supplierMemberFormPage: form }) => {
        await form.gotoUpdate(memberId);
        await form.input('newPassword').fill(edited.password);
        await form.input('passwordConfirm').fill(edited.password);
        await form.save();

        expect(await loginError(browser, pagesOn, member.phone, edited.password)).toBeNull();
        expect(await loginError(browser, pagesOn, member.phone, member.password)).not.toBeNull();
      },
    );

    test(
      'A permission is saved when ticked and removed when unticked',
      { tag: ['@functional'] },
      async ({ page, supplierMemberFormPage: form }) => {
        await form.gotoPermissions(memberId);
        // The section names are lowercase in the page and capitalised by CSS.
        for (const section of permissionSections) {
          await expect(form.content).toContainText(section, { useInnerText: true });
        }
        const original = await form.permissionStates();
        const index = original.indexOf(false);

        await test.step('Tick: saved at once and kept after a reload', async () => {
          expect(await form.togglePermission(index)).toBe(200);
          await page.reload();
          await expect(form.permissionCheckboxes.nth(index)).toBeChecked();
        });

        await test.step('Untick: back to the original permissions', async () => {
          expect(await form.togglePermission(index)).toBe(200);
          await page.reload();
          expect(await form.permissionStates()).toEqual(original);
        });
      },
    );

    test(
      'Delete asks for confirmation; Cancel keeps the member',
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list }) => {
        await list.open({ phone: member.phone });
        await list.clickDelete(memberId);
        await expect(list.confirmDialog.message).toHaveText(text.deleteConfirmation);

        await list.confirmDialog.cancel();
        await expect(list.confirmDialog.dialog).toBeHidden();
        await list.open({ phone: member.phone });
        expect(await list.rowIds()).toEqual([memberId]);
      },
    );

    test(
      'Delete removes the member and it can no longer sign in',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, supplierMemberListPage: list }) => {
        await list.open({ phone: member.phone });
        await list.deleteMember(memberId);

        await expect(list.successAlert).toContainText(text.deletedMessage);
        await expect(list.row(memberId)).toHaveCount(0);
        await list.open({ phone: member.phone });
        await expect(list.rows).toHaveCount(0);
        expect(await loginError(browser, pagesOn, member.phone, edited.password)).not.toBeNull();
      },
    );
  },
);
