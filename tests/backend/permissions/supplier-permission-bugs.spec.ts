import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { uniqueDigits } from '@utils/unique';
import {
  permissionData,
  permissionUrls,
  supplierPermissions,
} from '@test-data/backend-permissions.data';

/**
 * Evidence for two Supplier List permission findings (reported 2026-11-05). Each bug test asserts
 * the expected behaviour and is marked test.fail() with a BUG-PENDING reference (replace it with
 * the ticket ID), so the run passes while the bug exists; the video shows what happens.
 *
 * PRM-02: ticking "/users/supplier/create" on a role also ticks five other permissions, and
 *         unticking Create leaves them ticked.
 * PRM-03: the "/users/supplier/delete" permission exists (root has it through
 *         "/users/supplier/*"), but no Delete action is shown anywhere for suppliers.
 */

// Video on for evidence. The account header is hidden in the recording (see beforeEach), and the
// session was saved by auth.setup.ts, so no credentials are typed while recording.
test.use({ ...devRootSession, video: 'on', launchOptions: { slowMo: 300 } });

const { create, relatedToCreate } = supplierPermissions;

test.beforeEach(async ({ mazadDashboardPage }) => {
  await mazadDashboardPage.hideAccountDetailsInRecordings();
});

test.describe(
  'PRM-02: Create permission toggles other permissions',
  { tag: ['@regression', '@mutates'] },
  () => {
    // A dedicated role with no users, created and deleted by this test, so no real role changes.
    test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 });
    const role = `${permissionData.testRolePrefix} ${uniqueDigits(6)}`;

    // Delete the role even when the test stops midway.
    test.afterEach(async ({ rolePermissionsPage }) => {
      await rolePermissionsPage.gotoList();
      await rolePermissionsPage.searchRole(role);
      if (await rolePermissionsPage.roleRow(role).count()) {
        await rolePermissionsPage.deleteRole(role);
      }
    });

    test(
      'PRM-02 Ticking Create ticks only Create, and unticking it changes nothing else',
      { tag: ['@functional', '@known-bug'] },
      async ({ page, rolePermissionsPage }) => {
        test.fail(
          true,
          'BUG-PENDING: PRM-02 ticking supplier Create also ticks five other permissions.',
        );

        await test.step('Create a dedicated test role with no permissions', async () => {
          await rolePermissionsPage.createRole(role);
          await rolePermissionsPage.searchRole(role);
          await expect(rolePermissionsPage.roleRow(role)).toBeVisible();
        });

        await test.step('Open the role from the Roles list with the permissions icon', async () => {
          await rolePermissionsPage.openPermissionsFromList(role);
          await expect(page).toHaveURL(permissionUrls.rolePermissions);
          await expect(rolePermissionsPage.permission(create)).not.toBeChecked();
          for (const route of relatedToCreate) {
            await expect(rolePermissionsPage.permission(route)).not.toBeChecked();
          }
        });

        await test.step(`Tick only ${create} and reload`, async () => {
          await rolePermissionsPage.permission(create).scrollIntoViewIfNeeded();
          await rolePermissionsPage.togglePermission(create);
          await page.reload();
          await rolePermissionsPage.permission(create).scrollIntoViewIfNeeded();
          await expect(rolePermissionsPage.permission(create)).toBeChecked();
        });

        await test.step('Expected: the five related permissions stay unticked', async () => {
          for (const route of relatedToCreate) {
            await expect
              .soft(rolePermissionsPage.permission(route), `${route} after ticking Create`)
              .not.toBeChecked();
          }
        });

        await test.step(`Untick ${create} and reload`, async () => {
          await rolePermissionsPage.togglePermission(create);
          await page.reload();
          await rolePermissionsPage.permission(create).scrollIntoViewIfNeeded();
          await expect(rolePermissionsPage.permission(create)).not.toBeChecked();
        });

        await test.step('Expected: no related permission is left ticked', async () => {
          await rolePermissionsPage.permission(relatedToCreate[0]).scrollIntoViewIfNeeded();
          for (const route of relatedToCreate) {
            await expect
              .soft(rolePermissionsPage.permission(route), `${route} after unticking Create`)
              .not.toBeChecked();
          }
        });
      },
    );
  },
);

test.describe('PRM-03: Delete permission has no Delete button', { tag: ['@regression'] }, () => {
  test(
    'PRM-03 The supplier Delete permission exists and root holds it',
    { tag: ['@functional'] },
    async ({ permissionListPage, rolePermissionsPage }) => {
      await test.step(`Permissions list contains ${supplierPermissions.delete}`, async () => {
        await permissionListPage.gotoFiltered(permissionData.deleteSearch);
        await expect(permissionListPage.row(supplierPermissions.delete)).toBeVisible();
      });

      await test.step(`Role "root" has ${supplierPermissions.all} (includes delete)`, async () => {
        await rolePermissionsPage.gotoPermissions(permissionData.rootRole);
        await rolePermissionsPage.permission(supplierPermissions.all).scrollIntoViewIfNeeded();
        await expect(rolePermissionsPage.permission(supplierPermissions.all)).toBeChecked();
      });
    },
  );

  test(
    'PRM-03 Root sees a Delete action for suppliers in the list',
    { tag: ['@functional', '@known-bug'] },
    async ({ supplierListPage }) => {
      test.fail(true, 'BUG-PENDING: PRM-03 no Delete action for suppliers despite the permission.');
      await supplierListPage.goto();
      const [first] = await supplierListPage.columnValues('ID');

      await test.step('Row actions show View and Update', async () => {
        await expect(supplierListPage.viewLink(first)).toBeVisible();
        await expect(supplierListPage.updateLink(first)).toBeVisible();
      });

      await test.step('Expected: a Delete action next to them', async () => {
        await supplierListPage.row(first).scrollIntoViewIfNeeded();
        await expect(supplierListPage.deleteLink(first)).toBeVisible();
      });
    },
  );

  test(
    'PRM-03 Root sees a Delete button on the supplier details page',
    { tag: ['@functional', '@known-bug'] },
    async ({ supplierListPage, supplierViewPage }) => {
      test.fail(true, 'BUG-PENDING: PRM-03 no Delete button on the supplier details page.');
      await supplierListPage.goto();
      const [first] = await supplierListPage.columnValues('ID');
      await supplierViewPage.goto(first);

      await test.step('Details page shows the Update button', async () => {
        await expect(supplierViewPage.updateButton).toBeVisible();
      });

      await test.step('Expected: a Delete button next to Update', async () => {
        await expect(supplierViewPage.deleteButton).toBeVisible();
      });
    },
  );
});
