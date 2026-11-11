import type { Browser, Page } from '@playwright/test';
import {
  DEV_ROOT_SESSION_FILE,
  SUPPLIER_MISSING_REASON,
  getSupplierAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { signInFresh } from '@fixtures/backend-sign-in';
import { type BackendPages, expect, test } from '@fixtures/test.fixture';
import { isTestOperation, newTestOperation, operationUrls } from '@test-data/operation.data';

/**
 * Mazad Backend > Operations: who can reach the pages. A signed-out visitor is sent to the login
 * page, and a supplier or an operation whose role lacks the Operations permissions (Marketing)
 * gets 403. Test operations are QA-AUTO records created and deleted here through a Dev Root tab;
 * real operations are only read.
 */

type PagesOn = (tab: Page) => BackendPages;

/** A Dev Root tab in its own browser context, for creating and deleting test operations. */
async function devRootTab(browser: Browser, pagesOn: PagesOn) {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: DEV_ROOT_SESSION_FILE,
  });
  const pages = pagesOn(await context.newPage());
  return { context, list: pages.operationListPage, form: pages.operationFormPage };
}

/** Operations pages for a given operation ID. */
const operationPages = (id: string) => [
  '/backend/users/operation/index',
  '/backend/users/operation/create',
  `/backend/users/operation/view?id=${id}`,
  `/backend/users/operation/update?id=${id}`,
];

test.describe('Operation - access', { tag: ['@regression'] }, () => {
  test(
    'A signed-out visitor is sent to the login page',
    { tag: ['@negative'] },
    async ({ page, operationListPage: list }) => {
      await list.goto();
      await expect(page).toHaveURL(operationUrls.login);
    },
  );

  test(
    'A supplier account cannot open the Operations pages',
    { tag: ['@negative'] },
    async ({ browser, pagesOn }) => {
      const supplier = getSupplierAccount();
      test.skip(!supplier, SUPPLIER_MISSING_REASON);
      const signIn = await signInFresh(browser, pagesOn, supplier!.phone, supplier!.password);
      expect(signIn.error).toBeNull();
      const { operationListPage: list } = pagesOn(signIn.tab);

      // ID 1 is never opened: every request is refused before any record is read.
      for (const path of operationPages('1')) {
        const response = await signIn.tab.goto(path);
        expect(response?.status(), path).toBe(403);
      }
      await expect(list.sidebarLink).toHaveCount(0);
      await signIn.context.close();
    },
  );
});

test.describe(
  'Operation - access of an operation account',
  { tag: ['@regression', '@mutates'] },
  () => {
    test.describe.configure({ mode: 'serial', retries: 0 });
    const operation = newTestOperation();
    let operationId = '';

    test.beforeAll(async ({ browser, pagesOn }) => {
      const { context, list, form } = await devRootTab(browser, pagesOn);
      await form.gotoCreate();
      await form.fill(operation);
      await form.save();
      await list.open({ phone: operation.phone });
      [operationId] = await list.rowIds();
      await context.close();
      if (!operationId) throw new Error(`Test operation ${operation.phone} was not created.`);
    });

    test.afterAll(async ({ browser, pagesOn }) => {
      const { context, list } = await devRootTab(browser, pagesOn);
      await list.open({ phone: operation.phone });
      for (const row of await list.readRows()) {
        if (isTestOperation(row)) await list.deleteById(row.ID);
      }
      await context.close();
    });

    test(
      'An operation with the Marketing role cannot open the Operations pages',
      { tag: ['@negative'] },
      async ({ browser, pagesOn }) => {
        const signIn = await signInFresh(browser, pagesOn, operation.phone, operation.password);
        expect(signIn.error).toBeNull();
        const { operationListPage: list } = pagesOn(signIn.tab);

        for (const path of operationPages(operationId)) {
          const response = await signIn.tab.goto(path);
          expect(response?.status(), path).toBe(403);
        }
        await expect(list.sidebarLink).toHaveCount(0);
        await signIn.context.close();
      },
    );

    test(
      'Making an operation inactive ends its open session',
      { tag: ['@functional'] },
      async ({ browser, pagesOn }) => {
        const signIn = await signInFresh(browser, pagesOn, operation.phone, operation.password);
        expect(signIn.error).toBeNull();

        const { context, form } = await devRootTab(browser, pagesOn);
        await form.gotoUpdate(operationId);
        await form.selectStatus('inactive');
        await form.save();
        await context.close();

        await pagesOn(signIn.tab).mazadDashboardPage.goto();
        await expect(signIn.tab).toHaveURL(operationUrls.login);
        await signIn.context.close();
      },
    );
  },
);
