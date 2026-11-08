import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/supplier.fixture';
import { RolePermissionsPage } from '@pages/backend/role-permissions.page';

/**
 * Evidence for two Supplier List permission findings (reported 2026-11-05). Each test asserts the
 * expected behaviour, so it fails while the bug exists; the video shows what happens.
 *
 * PRM-02: ticking "/users/supplier/create" on a role also ticks five other permissions, and
 *         unticking Create leaves them ticked.
 * PRM-03: the "/users/supplier/delete" permission exists (root has it through
 *         "/users/supplier/*"), but no Delete action is shown anywhere for suppliers.
 */

// Video on for evidence. The account header is hidden in the recording (see beforeEach), and
// login happens in the worker fixture's own context, so no credentials are recorded.
test.use({ trace: 'off', screenshot: 'off', video: 'on', launchOptions: { slowMo: 300 } });

const CREATE = '/users/supplier/create';
/** Permissions that should change only when they are clicked themselves. */
const RELATED = [
  '/users/supplier-ajax/save-basic-tab',
  '/users/supplier-ajax/save-auction-tab',
  '/users/supplier-ajax/save-inspection-tab',
  '/users/supplier-ajax/save-email-tab',
  '/users/ajax/add-supplier-commission',
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.app-header-right { visibility: hidden; }';
      document.head.appendChild(style);
    });
  });
});

test.describe('PRM-02: Create permission toggles other permissions', () => {
  // A dedicated role with no users, created and deleted by this test, so no real role changes.
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 });
  const role = `QA-AUTO PRM-02 ${Date.now().toString().slice(-6)}`;

  test.afterAll(async ({ browser, devRootSession }) => {
    const context = await browser.newContext({
      baseURL: envConfig.baseURL,
      storageState: devRootSession ?? undefined,
    });
    const roles = new RolePermissionsPage(await context.newPage());
    await roles.gotoList();
    await roles.searchRole(role);
    if (await roles.roleRow(role).count()) await roles.deleteRole(role);
    await context.close();
  });

  test('PRM-02 Ticking Create ticks only Create, and unticking it changes nothing else', async ({
    page,
  }) => {
    const roles = new RolePermissionsPage(page);

    await test.step('Create a dedicated test role with no permissions', async () => {
      await roles.createRole(role);
      await roles.searchRole(role);
      await expect(roles.roleRow(role)).toBeVisible();
    });

    await test.step('Open the role from the Roles list with the permissions icon', async () => {
      // The icon opens a new tab. Continue in the main tab so the video stays in one recording.
      const tab = await roles.openInNewTab(roles.permissionsIcon(role));
      await expect(tab).toHaveURL(/view-permission/);
      const url = tab.url();
      await tab.close();
      await page.goto(url);
      await expect(roles.permission(CREATE)).not.toBeChecked();
      for (const route of RELATED) await expect(roles.permission(route)).not.toBeChecked();
    });

    await test.step(`Tick only ${CREATE} and reload`, async () => {
      await roles.permission(CREATE).scrollIntoViewIfNeeded();
      await roles.togglePermission(CREATE);
      await page.reload();
      await roles.permission(CREATE).scrollIntoViewIfNeeded();
      await expect(roles.permission(CREATE)).toBeChecked();
    });

    await test.step('Expected: the five related permissions stay unticked', async () => {
      for (const route of RELATED) {
        await expect
          .soft(roles.permission(route), `${route} after ticking Create`)
          .not.toBeChecked();
      }
    });

    await test.step(`Untick ${CREATE} and reload`, async () => {
      await roles.togglePermission(CREATE);
      await page.reload();
      await roles.permission(CREATE).scrollIntoViewIfNeeded();
      await expect(roles.permission(CREATE)).not.toBeChecked();
    });

    await test.step('Expected: no related permission is left ticked', async () => {
      await roles.permission(RELATED[0]).scrollIntoViewIfNeeded();
      for (const route of RELATED) {
        await expect
          .soft(roles.permission(route), `${route} after unticking Create`)
          .not.toBeChecked();
      }
    });
  });
});

test.describe('PRM-03: Delete permission has no Delete button', () => {
  test('PRM-03 The supplier Delete permission exists and root holds it', async ({ page }) => {
    const roles = new RolePermissionsPage(page);

    await test.step('Permissions list contains /users/supplier/delete', async () => {
      await page.goto(
        '/backend/access/permission/index?AuthItemSearch%5Bname%5D=supplier%2Fdelete',
      );
      await expect(page.locator('table tbody tr[data-key="/users/supplier/delete"]')).toBeVisible();
    });

    await test.step('Role "root" has /users/supplier/* (includes delete)', async () => {
      await roles.gotoPermissions('root');
      await roles.permission('/users/supplier/*').scrollIntoViewIfNeeded();
      await expect(roles.permission('/users/supplier/*')).toBeChecked();
    });
  });

  test('PRM-03 Root sees a Delete action for suppliers in the list', async ({
    supplierListPage,
  }) => {
    await supplierListPage.goto();
    const [first] = await supplierListPage.columnValues('ID');

    await test.step('Row actions show View and Update', async () => {
      await expect(supplierListPage.viewLink(first)).toBeVisible();
      await expect(supplierListPage.updateLink(first)).toBeVisible();
    });

    await test.step('Expected: a Delete action next to them', async () => {
      await supplierListPage.rowById(first).scrollIntoViewIfNeeded();
      await expect(
        supplierListPage
          .rowById(first)
          .locator('a[title="Delete"], a[href*="/users/supplier/delete"]'),
      ).toBeVisible();
    });
  });

  test('PRM-03 Root sees a Delete button on the supplier details page', async ({
    page,
    supplierListPage,
    supplierViewPage,
  }) => {
    await supplierListPage.goto();
    const [first] = await supplierListPage.columnValues('ID');
    await supplierViewPage.goto(first);

    await test.step('Details page shows the Update button', async () => {
      await expect(supplierViewPage.updateButton).toBeVisible();
    });

    await test.step('Expected: a Delete button next to Update', async () => {
      await expect(
        page.locator('a.btn, button.btn').filter({ hasText: /^\s*Delete\s*$/ }),
      ).toBeVisible();
    });
  });
});
