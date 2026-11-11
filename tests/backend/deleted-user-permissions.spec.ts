import type { Browser, Page } from '@playwright/test';
import { type FreshSignIn, signInFresh } from '@fixtures/backend-sign-in';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  type TestCustomer,
  asDevRoot,
  createTestCustomer,
  deleteTestCustomers,
} from '@fixtures/test-customers';
import {
  type CustomerSection,
  customerSections,
  deletedUserText as text,
  permissionRoles,
} from '@test-data/deleted-user.data';
import { type OperationData, newTestOperation } from '@test-data/operation.data';

/**
 * Who may delete Individuals and Dealers. User A is a QA-AUTO operation with the Auction
 * Supervisor role (has both Delete permissions); User B one with Data Analysis (can open the
 * lists, no Delete, no Deleted Users). The last tests untick Auction Supervisor's two Delete
 * permissions, check User A loses Delete, and tick them back; afterAll restores the role's
 * exact original permission set if a step failed (approved on 2026-11-10: the role has real
 * staff, who lose Delete for about a minute).
 */

// Dev Root runs the Roles page and the setup; Users A and B sign in to fresh browsers.
test.use(devRootSession);

type PagesOn = (tab: Page) => BackendPages;
const kinds = Object.keys(customerSections) as CustomerSection[];
const deleteRoutes: string[] = kinds.map((kind) => customerSections[kind].deleteRoute);
const listOf = (pages: BackendPages, kind: CustomerSection) =>
  kind === 'dealer' ? pages.dealerListPage : pages.individualListPage;

async function createOperation(browser: Browser, pagesOn: PagesOn, role: string) {
  const operation: OperationData = { ...newTestOperation(), role: role as OperationData['role'] };
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

async function rolePermissions(browser: Browser, pagesOn: PagesOn, role: string) {
  return asDevRoot(browser, pagesOn, async ({ rolePermissionsPage }) => {
    await rolePermissionsPage.gotoPermissions(role);
    return rolePermissionsPage.checkedPermissions();
  });
}

/** Ticks or unticks routes on a role so each one ends as `ticked`. */
async function setRoutes(
  browser: Browser,
  pagesOn: PagesOn,
  role: string,
  routes: string[],
  ticked: boolean,
) {
  await asDevRoot(browser, pagesOn, async ({ rolePermissionsPage: roles }) => {
    await roles.gotoPermissions(role);
    for (const route of routes) {
      if ((await roles.permission(route).isChecked()) !== ticked) {
        await roles.permission(route).scrollIntoViewIfNeeded();
        await roles.togglePermission(route);
      }
    }
  });
}

test.describe('Deleted Users - Delete permission', { tag: ['@regression', '@mutates'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.setTimeout(120_000);
  const customers: TestCustomer[] = [];
  let userA: OperationData & { id: string };
  let userB: OperationData & { id: string };
  let original: string[] = [];
  let signedInA: FreshSignIn;

  test.beforeAll(async ({ browser, pagesOn }) => {
    original = await rolePermissions(browser, pagesOn, permissionRoles.withDelete);
    userA = await createOperation(browser, pagesOn, permissionRoles.withDelete);
    userB = await createOperation(browser, pagesOn, permissionRoles.withoutDelete);
  });

  test.afterAll(async ({ browser, pagesOn }) => {
    await signedInA?.context.close();
    // Restore Auction Supervisor's Delete permissions to what they were before the run.
    const now = await rolePermissions(browser, pagesOn, permissionRoles.withDelete);
    for (const route of deleteRoutes) {
      if (original.includes(route) !== now.includes(route)) {
        await setRoutes(
          browser,
          pagesOn,
          permissionRoles.withDelete,
          [route],
          original.includes(route),
        );
      }
    }
    await deleteTestCustomers(browser, pagesOn, customers);
    await asDevRoot(browser, pagesOn, async ({ operationListPage }) => {
      for (const user of [userA, userB].filter(Boolean)) {
        await operationListPage.open({ phone: user.phone });
        for (const id of await operationListPage.rowIds()) await operationListPage.deleteById(id);
      }
    });
  });

  test(
    'The Roles page shows Delete ticked for Auction Supervisor and not for Data Analysis',
    { tag: ['@functional'] },
    async ({ browser, pagesOn }) => {
      const withoutDelete = await rolePermissions(browser, pagesOn, permissionRoles.withoutDelete);
      for (const kind of kinds) {
        const { deleteRoute } = customerSections[kind];
        expect(original, `${permissionRoles.withDelete} ${deleteRoute}`).toContain(deleteRoute);
        expect(withoutDelete, `${permissionRoles.withoutDelete} ${deleteRoute}`).not.toContain(
          deleteRoute,
        );
        expect(withoutDelete).toContain(deleteRoute.replace('/delete', '/index'));
      }
    },
  );

  test(
    'User A (with Delete) deletes an Individual and a Dealer; both appear in Deleted Users',
    { tag: ['@smoke', '@functional'] },
    async ({ browser, pagesOn }) => {
      const targets: TestCustomer[] = [];
      for (const kind of kinds) {
        const customer = await createTestCustomer(browser, pagesOn, kind);
        customers.push(customer);
        targets.push(customer);
      }
      signedInA = await signInFresh(browser, pagesOn, userA.phone, userA.password);
      expect(signedInA.error).toBeNull();
      const pages = pagesOn(signedInA.tab);

      for (const customer of targets) {
        await test.step(`Delete the ${customer.kind}`, async () => {
          const list = listOf(pages, customer.kind);
          await list.open({ phone: customer.phone });
          await expect(list.deleteLink(customer.id)).toBeVisible();
          await list.clickDelete(customer.id);
          await expect(list.confirmDialog.message).toHaveText(text.deleteConfirmation);
          await list.confirmDialog.confirmAndWaitForPageLoad();
          await expect(list.flashMessage).toContainText(
            customerSections[customer.kind].deletedMessage,
          );
          await list.open({ phone: customer.phone });
          await expect(list.rows).toHaveCount(0);
        });
        await test.step(`User A sees the ${customer.kind} in Deleted Users`, async () => {
          await pages.deletedUserListPage.open({ phone: customer.phone });
          const [row] = await pages.deletedUserListPage.readRows();
          expect(row).toMatchObject({
            ID: customer.id,
            'English Name': customer.nameEn,
            'User Type': customerSections[customer.kind].userType.shown,
          });
        });
      }
    },
  );

  test(
    'User B (without Delete) cannot delete: no Dealer Delete action and the server refuses both',
    { tag: ['@negative'] },
    async ({ browser, pagesOn }) => {
      const targets: TestCustomer[] = [];
      for (const kind of kinds) {
        const customer = await createTestCustomer(browser, pagesOn, kind);
        customers.push(customer);
        targets.push(customer);
      }
      const signIn = await signInFresh(browser, pagesOn, userB.phone, userB.password);
      expect(signIn.error).toBeNull();
      const pages = pagesOn(signIn.tab);

      await test.step('Dealers list offers no Delete', async () => {
        await pages.dealerListPage.open({ phone: targets[1].phone });
        expect(await pages.dealerListPage.rowIds()).toEqual([targets[1].id]);
        await expect(pages.dealerListPage.deleteLinks).toHaveCount(0);
      });

      for (const customer of targets) {
        await test.step(`Deleting the ${customer.kind} directly is refused`, async () => {
          const list = listOf(pages, customer.kind);
          await list.open({ phone: customer.phone });
          expect(await list.postDelete(customer.id), 'POST delete').toBe(403);
          expect(await list.getDeleteStatus(customer.id), 'GET delete').toBe(403);
          await list.open({ phone: customer.phone });
          expect(await list.rowIds()).toEqual([customer.id]);
        });
      }

      await test.step('Deleted Users is closed to User B', async () => {
        expect(await pages.deletedUserListPage.open()).toBe(403);
        await expect(pages.deletedUserListPage.pageHeading).toHaveText(text.forbidden);
      });
      await signIn.context.close();
    },
  );

  test(
    'User B sees no Delete action in the Individual list',
    {
      tag: ['@negative', '@known-bug'],
      annotation: {
        type: 'issue',
        description:
          'Found 2026-11-10 on staging: the Individual list shows the Delete icon to users ' +
          'without /users/individual/delete (the server then answers 403). The Dealers list ' +
          'hides it correctly. Open in Jira.',
      },
    },
    async ({ browser, pagesOn }) => {
      test.fail();
      const individual = customers.at(-2)!;
      const signIn = await signInFresh(browser, pagesOn, userB.phone, userB.password);
      const { individualListPage: list } = pagesOn(signIn.tab);
      await list.open({ phone: individual.phone });
      expect(await list.rowIds()).toEqual([individual.id]);
      try {
        await expect(list.deleteLinks).toHaveCount(0, { timeout: 2000 });
      } finally {
        await signIn.context.close();
      }
    },
  );

  test(
    "Unticking Delete on Auction Supervisor removes User A's Delete; ticking it back restores it",
    { tag: ['@functional'] },
    async ({ browser, pagesOn }) => {
      const [individual, dealer] = customers.slice(-2);
      const pages = pagesOn(signedInA.tab);

      await test.step('Untick both Delete permissions', async () => {
        await setRoutes(browser, pagesOn, permissionRoles.withDelete, deleteRoutes, false);
        const now = await rolePermissions(browser, pagesOn, permissionRoles.withDelete);
        expect(now).toEqual(original.filter((route) => !deleteRoutes.includes(route)));
      });

      await test.step('User A: no Dealer Delete, and the server refuses both', async () => {
        await pages.dealerListPage.open({ phone: dealer.phone });
        await expect(pages.dealerListPage.deleteLinks).toHaveCount(0);
        for (const customer of [individual, dealer]) {
          const list = listOf(pages, customer.kind);
          await list.open({ phone: customer.phone });
          expect(await list.postDelete(customer.id), `${customer.kind} POST delete`).toBe(403);
          await list.open({ phone: customer.phone });
          expect(await list.rowIds()).toEqual([customer.id]);
        }
      });

      await test.step('Tick them back: the role is exactly as before', async () => {
        await setRoutes(browser, pagesOn, permissionRoles.withDelete, deleteRoutes, true);
        expect(await rolePermissions(browser, pagesOn, permissionRoles.withDelete)).toEqual(
          original,
        );
      });

      await test.step('User A has Delete again', async () => {
        for (const customer of [individual, dealer]) {
          const list = listOf(pages, customer.kind);
          await list.open({ phone: customer.phone });
          await expect(list.deleteLink(customer.id)).toBeVisible();
        }
      });
    },
  );
});
