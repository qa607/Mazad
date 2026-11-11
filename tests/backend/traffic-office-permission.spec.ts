import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  permissionReplies,
  trafficOfficeColumns,
  trafficOfficeFilters,
  trafficOfficePermissions,
  trafficOfficeText,
  trafficOfficeUrls,
} from '@test-data/traffic-office.data';

/**
 * Mazad Backend > Traffic Office permissions: the Traffic Office routes granted to the
 * superAdmin role reach a Super Admin user.
 *
 * Dev Root (this test's tab) takes the role's Traffic Office permissions away and grants them
 * again, checking the server's reply to each change and, after a reload, the five Traffic-Office
 * checkboxes. The Ajax "index" box is judged by the reply only: after a reload it does not
 * always show the role's current state (accepted by the team as intended behaviour). The
 * keepRolePermissionsGranted fixture grants all six after the test, passed or failed, so
 * superAdmin always ends
 * with full Traffic Office access and the tests can run again. The Super Admin
 * (SUPER_ADMIN_* in .env) then signs in in a fresh, signed-out browser and opens the list, the
 * create form, a record and its update form. Nothing is saved as the Super Admin.
 */

// Dev Root tab signed in from the saved session, with no trace or video (see devRootSession).
// The Super Admin tab gets a masked screenshot on failure from its fixture.
test.use(devRootSession);

const { role, routes, displayedRoutes } = trafficOfficePermissions;

test.describe('Traffic Office - permissions', { tag: '@regression' }, () => {
  test(
    'Traffic Office permissions granted to superAdmin give a Super Admin full access',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      keepRolePermissionsGranted,
      rolePermissionsPage: permissions,
      signInAsSuperAdmin,
      pagesOn,
    }) => {
      keepRolePermissionsGranted(role, routes);
      await permissions.gotoPermissions(role);

      await test.step(`Dev Root takes the Traffic Office permissions away from ${role}`, async () => {
        for (const route of routes) {
          expect(await permissions.setPermission(route, false), route).toBe(
            permissionReplies.removed,
          );
        }
        await page.reload();
        for (const route of displayedRoutes) {
          await expect(permissions.permission(route), route).not.toBeChecked();
        }
      });

      await test.step(`Dev Root grants them again, saved after a reload`, async () => {
        for (const route of routes) {
          expect(await permissions.setPermission(route, true), route).toBe(permissionReplies.added);
        }
        await page.reload();
        for (const route of displayedRoutes) {
          await expect(permissions.permission(route), route).toBeChecked();
        }
      });

      const signIn = await test.step('the Super Admin signs in in a fresh browser', async () => {
        const result = await signInAsSuperAdmin();
        expect(result.error, 'sign-in error').toBeNull();
        return result;
      });

      const tab = signIn.tab;
      const { trafficOfficeListPage: list } = pagesOn(tab);

      await test.step('Global Settings > Traffic Office is in the sidebar and opens the list', async () => {
        await list.openFromSidebar(trafficOfficeText.sidebarParent, trafficOfficeText.sidebarLabel);
        await expect(tab).toHaveURL(trafficOfficeUrls.list);
        await expect(list.sidebarLink).toBeVisible();
      });

      const { id, nameEn } =
        await test.step('the list shows its search form and offices', async () => {
          await expect(list.pageHeading).toHaveText(trafficOfficeText.listTitle);
          await expect(list.filterLabels).toHaveText([...trafficOfficeFilters]);
          await expect(list.columnHeaders).toHaveText([...trafficOfficeColumns]);
          await expect(list.createButton).toBeVisible();
          const first = list.rows.first();
          await expect(first).toBeVisible();
          return {
            id: await list.rowId(first),
            nameEn: (await list.officeNameEnCell(first).innerText()).trim(),
          };
        });

      await test.step('Create Traffic Office opens the create form', async () => {
        const { trafficOfficeFormPage: form } = pagesOn(tab);
        await list.openCreateForm();
        await expect(tab).toHaveURL(trafficOfficeUrls.create);
        await expect(form.pageHeading).toHaveText(trafficOfficeText.createTitle);
        await expect(form.officeNameInput).toBeEditable();
        await expect(form.officeNameEnInput).toBeEditable();
        await expect(form.saveButton).toBeEnabled();
        await list.goto();
      });

      await test.step('View opens the office', async () => {
        const viewTab = await list.openInNewTab(list.viewLink(id));
        const { trafficOfficeViewPage: view } = pagesOn(viewTab);
        await expect(viewTab).toHaveURL(trafficOfficeUrls.view(id));
        await expect(view.pageHeading).toHaveText(nameEn);
        await expect(view.value('ID')).toHaveText(id);
        await viewTab.close();
      });

      await test.step('Update opens the office in the edit form', async () => {
        const updateTab = await list.openInNewTab(list.updateLink(id));
        const { trafficOfficeFormPage: form } = pagesOn(updateTab);
        await expect(updateTab).toHaveURL(trafficOfficeUrls.update(id));
        await expect(form.pageHeading).toHaveText(trafficOfficeText.updateTitle(nameEn));
        await expect(form.officeNameEnInput).toHaveValue(nameEn);
        await expect(form.saveButton).toBeEnabled();
        await updateTab.close();
      });
    },
  );
});
