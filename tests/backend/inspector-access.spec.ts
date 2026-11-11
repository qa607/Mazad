import type { Browser, Page } from '@playwright/test';
import { SUPPLIER_MISSING_REASON, getSupplierAccount } from '@config/credentials.config';
import { signInFresh } from '@fixtures/backend-sign-in';
import { type BackendPages, expect, test } from '@fixtures/test.fixture';
import { asDevRoot } from '@fixtures/test-customers';
import { type OperationData, newTestOperation } from '@test-data/operation.data';
import {
  inspectorPagePaths,
  inspectorText as text,
  inspectorUrls,
  rolesWithoutInspectorAccess,
} from '@test-data/inspector.data';

/**
 * Mazad Backend > Users > Inspectors: who can open the pages. A signed-out visitor is sent to the
 * login page. A supplier, and operations whose role has no /users/inspector permission, are sent
 * to the Backend Home page and see no inspector data. The View path uses a real inspector's ID,
 * read as Dev Root, to prove it is not shown. The operations are QA-AUTO records created and
 * deleted here through a Dev Root tab; no inspector and no role is changed.
 */

// Real accounts sign in here: no trace or video, and only the masked failure screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

type PagesOn = (tab: Page) => BackendPages;
/** For signed-out checks; any ID, since no record is read before the login redirect. */
const anyId = '1';

/** ID of a real inspector, read as Dev Root. */
async function realInspectorId(browser: Browser, pagesOn: PagesOn): Promise<string> {
  const [id] = await asDevRoot(browser, pagesOn, async ({ inspectorListPage }) => {
    await inspectorListPage.goto();
    return inspectorListPage.rowIds();
  });
  if (!id) throw new Error('No inspector is listed.');
  return id;
}

async function createOperation(browser: Browser, pagesOn: PagesOn, role: OperationData['role']) {
  const operation: OperationData = { ...newTestOperation(), role };
  const id = await asDevRoot(browser, pagesOn, async ({ operationFormPage, operationListPage }) => {
    await operationFormPage.gotoCreate();
    await operationFormPage.fill(operation);
    await operationFormPage.save();
    await operationListPage.open({ phone: operation.phone });
    return (await operationListPage.rowIds())[0];
  });
  if (!id) throw new Error(`Test operation ${operation.phone} was not created.`);
  return { ...operation, id };
}

/**
 * Opens each inspector page in a signed-in tab and checks the account is sent to the Home page
 * with no inspector data shown and no Inspectors link in the menu.
 */
async function expectInspectorsRefused(tab: Page, pages: BackendPages, inspectorId: string) {
  const { inspectorListPage: list, inspectorViewPage: view } = pages;
  for (const path of inspectorPagePaths(inspectorId)) {
    await tab.goto(path);
    await expect(tab, path).toHaveURL(inspectorUrls.home);
    await expect(list.pageHeading, path).toHaveText(text.homeTitle);
    await expect(list.rows, path).toHaveCount(0);
    await expect(view.values, path).toHaveCount(0);
  }
  await expect(list.sidebarLink).toHaveCount(0);
}

test.describe('Inspectors - access', { tag: ['@regression'] }, () => {
  for (const path of inspectorPagePaths(anyId)) {
    test(
      `A signed-out visitor opening ${path.split('?')[0]} is sent to the login page`,
      { tag: ['@negative'] },
      async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(inspectorUrls.login);
      },
    );
  }

  test(
    'A supplier account cannot open the Inspectors pages',
    { tag: ['@negative'] },
    async ({ browser, pagesOn }) => {
      const supplier = getSupplierAccount();
      test.skip(!supplier, SUPPLIER_MISSING_REASON);
      const signIn = await signInFresh(browser, pagesOn, supplier!.phone, supplier!.password);
      expect(signIn.error).toBeNull();

      const id = await realInspectorId(browser, pagesOn);
      await expectInspectorsRefused(signIn.tab, pagesOn(signIn.tab), id);
      await signIn.context.close();
    },
  );
});

test.describe(
  'Inspectors - access of operation accounts',
  { tag: ['@regression', '@mutates'] },
  () => {
    test.describe.configure({ mode: 'serial', retries: 0 });
    const operations: (OperationData & { id: string })[] = [];

    test.afterAll(async ({ browser, pagesOn }) => {
      await asDevRoot(browser, pagesOn, async ({ operationListPage: list }) => {
        for (const operation of operations) {
          await list.open({ phone: operation.phone });
          for (const row of await list.readRows()) {
            if (row['English Name'] === operation.nameEn) await list.deleteById(row.ID);
          }
        }
      });
    });

    for (const role of rolesWithoutInspectorAccess) {
      test(
        `An operation with the ${role} role cannot open the Inspectors pages`,
        { tag: ['@negative'] },
        async ({ browser, pagesOn }) => {
          test.setTimeout(90_000);
          const operation = await createOperation(browser, pagesOn, role);
          operations.push(operation);
          const signIn = await signInFresh(browser, pagesOn, operation.phone, operation.password);
          expect(signIn.error).toBeNull();

          const id = await realInspectorId(browser, pagesOn);
          await expectInspectorsRefused(signIn.tab, pagesOn(signIn.tab), id);
          await signIn.context.close();
        },
      );
    }
  },
);
