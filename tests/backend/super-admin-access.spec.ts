import type { Browser, Page } from '@playwright/test';
import {
  DEV_ROOT_SESSION_FILE,
  SUPPLIER_MISSING_REASON,
  getSupplierAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { signInFresh } from '@fixtures/backend-sign-in';
import { type BackendPages, expect, test } from '@fixtures/test.fixture';
import { newTestAdmin, superAdminText as text, superAdminUrls } from '@test-data/super-admin.data';

/**
 * Mazad Backend > Super Admins: who can reach the pages. Only Dev Root (role root) manages
 * admins; a Super Admin (role superAdmin) and a supplier get 403, and a signed-out visitor is
 * sent to the login page. Test admins are QA-AUTO records created and deleted here through a
 * Dev Root tab; real admins are only read.
 */

type PagesOn = (tab: Page) => BackendPages;

/** A Dev Root tab in its own browser context, for creating and deleting test admins. */
async function devRootTab(browser: Browser, pagesOn: PagesOn) {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: DEV_ROOT_SESSION_FILE,
  });
  const pages = pagesOn(await context.newPage());
  return { context, list: pages.superAdminListPage, form: pages.superAdminFormPage };
}

async function createAdmin(browser: Browser, pagesOn: PagesOn, admin = newTestAdmin()) {
  const { context, list, form } = await devRootTab(browser, pagesOn);
  await form.gotoCreate();
  await form.fill(admin);
  await form.save();
  await list.open({ phone: admin.phone });
  const [id] = await list.rowIds();
  await context.close();
  if (!id) throw new Error(`Test admin ${admin.phone} was not created.`);
  return { admin, id };
}

async function deleteAdmins(browser: Browser, pagesOn: PagesOn, phones: string[]) {
  const { context, list } = await devRootTab(browser, pagesOn);
  for (const phone of phones) {
    await list.open({ phone });
    for (const row of await list.readRows()) {
      if (row['English Name'].startsWith('QA-AUTO')) await list.deleteAdmin(row.ID);
    }
  }
  await context.close();
}

/** Super Admin pages for a given admin ID (the ID of a test admin, never a real one). */
const adminPages = (id: string) => [
  '/backend/users/admin/index',
  '/backend/users/admin/create',
  `/backend/users/admin/view?id=${id}`,
  `/backend/users/admin/update?id=${id}`,
];

test.describe('Super Admin - access', { tag: ['@regression'] }, () => {
  test(
    'A signed-out visitor is sent to the login page',
    { tag: ['@negative'] },
    async ({ page, superAdminListPage: list }) => {
      await list.goto();
      await expect(page).toHaveURL(superAdminUrls.login);
    },
  );

  test(
    'A supplier account cannot open the Super Admin pages',
    { tag: ['@negative'] },
    async ({ browser, pagesOn }) => {
      const supplier = getSupplierAccount();
      test.skip(!supplier, SUPPLIER_MISSING_REASON);
      const signIn = await signInFresh(browser, pagesOn, supplier!.phone, supplier!.password);
      expect(signIn.error).toBeNull();
      const { superAdminListPage: list } = pagesOn(signIn.tab);

      for (const path of adminPages('5')) {
        const response = await signIn.tab.goto(path);
        expect(response?.status(), path).toBe(403);
      }
      await expect(list.sidebarLink).toHaveCount(0);
      await signIn.context.close();
    },
  );
});

test.describe(
  'Super Admin - access of a Super Admin account',
  { tag: ['@regression', '@mutates'] },
  () => {
    test.describe.configure({ mode: 'serial', retries: 0 });
    let admin = newTestAdmin();
    let other = newTestAdmin();
    let otherId = '';

    test.beforeAll(async ({ browser, pagesOn }) => {
      ({ admin } = await createAdmin(browser, pagesOn, admin));
      ({ admin: other, id: otherId } = await createAdmin(browser, pagesOn, other));
    });

    test.afterAll(async ({ browser, pagesOn }) => {
      await deleteAdmins(browser, pagesOn, [admin.phone, other.phone]);
    });

    test(
      'A Super Admin cannot open or change the Super Admin pages',
      { tag: ['@negative'] },
      async ({ browser, pagesOn }) => {
        const signIn = await signInFresh(browser, pagesOn, admin.phone, admin.password);
        expect(signIn.error).toBeNull();
        const { superAdminListPage: list } = pagesOn(signIn.tab);

        for (const path of adminPages(otherId)) {
          const response = await signIn.tab.goto(path);
          expect(response?.status(), path).toBe(403);
        }
        await expect(list.pageHeading).toHaveText(text.forbidden);

        // Pages the superAdmin role does have still open, and the menu has no Super Admins link.
        await pagesOn(signIn.tab).supplierListPage.goto();
        await expect(list.sidebarLink).toHaveCount(0);
        expect(await list.postAction(`/backend/users/admin/delete?id=${otherId}`)).toBe(403);
        await signIn.context.close();

        const { context, list: rootList } = await devRootTab(browser, pagesOn);
        await rootList.open({ phone: other.phone });
        expect(await rootList.rowIds(), 'the other admin was not deleted').toEqual([otherId]);
        await context.close();
      },
    );

    test(
      'Making an admin inactive ends its open session',
      { tag: ['@functional'] },
      async ({ browser, pagesOn }) => {
        const signIn = await signInFresh(browser, pagesOn, other.phone, other.password);
        expect(signIn.error).toBeNull();

        const { context, form } = await devRootTab(browser, pagesOn);
        await form.gotoUpdate(otherId);
        await form.selectStatus('inactive');
        await form.save();
        await context.close();

        await pagesOn(signIn.tab).supplierListPage.goto();
        await expect(signIn.tab).toHaveURL(superAdminUrls.login);
        await signIn.context.close();
      },
    );
  },
);
