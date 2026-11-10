import { signInError, signInFresh } from '@fixtures/backend-sign-in';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  type TestCustomer,
  createTestCustomer,
  deleteTestCustomers,
} from '@fixtures/test-customers';
import {
  type CustomerSection,
  customerSections,
  deletedUserText as text,
  deletedUserUrls,
  newTestCustomer,
  testCityId,
} from '@test-data/deleted-user.data';

/**
 * Mazad Backend > Individual and Dealers: Delete, signed in as Dev Root, and how the deleted
 * user then shows in Deleted Users. Each test deletes a QA-AUTO customer it created; real
 * customers are never touched. Deleted customers stay in Deleted Users (no restore exists).
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const customerList = (pages: BackendPages, kind: CustomerSection) =>
  kind === 'dealer' ? pages.dealerListPage : pages.individualListPage;
const listUrls = { individual: deletedUserUrls.individuals, dealer: deletedUserUrls.dealers };

for (const kind of Object.keys(customerSections) as CustomerSection[]) {
  const section = customerSections[kind];

  test.describe(
    `Deleted Users - delete from ${section.label}`,
    { tag: ['@regression', '@mutates'] },
    () => {
      // Steps build on each other, and a retry would create another test customer.
      test.describe.configure({ mode: 'serial', retries: 0 });
      let customer: TestCustomer;

      test.beforeAll(async ({ browser, pagesOn }) => {
        customer = await createTestCustomer(browser, pagesOn, kind);
      });

      test.afterAll(async ({ browser, pagesOn }) => {
        await deleteTestCustomers(browser, pagesOn, [customer]);
      });

      test(
        `Delete in ${section.label} asks for confirmation; Cancel keeps the user`,
        { tag: ['@functional'] },
        async ({ pagesOn, page }) => {
          const list = customerList(pagesOn(page), kind);
          await list.open({ phone: customer.phone });
          expect(await list.rowActions(customer.id)).toContain('Delete');

          await list.clickDelete(customer.id);
          await expect(list.confirmDialog.message).toHaveText(text.deleteConfirmation);
          await list.confirmDialog.cancel();
          await expect(list.confirmDialog.dialog).toBeHidden();

          await list.open({ phone: customer.phone });
          expect(await list.rowIds()).toEqual([customer.id]);
        },
      );

      test(
        `Ok deletes the user from ${section.label} and it can no longer sign in`,
        { tag: ['@smoke', '@functional'] },
        async ({ browser, pagesOn, devRoot }) => {
          // A Dev Root session of its own: the shared saved session is used by parallel
          // workers, and any of their page loads can show (and so take) the one-time message.
          const signIn = await signInFresh(browser, pagesOn, devRoot.phone, devRoot.password);
          expect(signIn.error).toBeNull();
          const list = customerList(pagesOn(signIn.tab), kind);
          await list.open({ phone: customer.phone });
          await list.deleteUser(customer.id);

          await expect(signIn.tab).toHaveURL(listUrls[kind]);
          await expect(list.flashMessage).toContainText(section.deletedMessage);
          await expect(list.row(customer.id)).toHaveCount(0);
          await list.open({ phone: customer.phone });
          await expect(list.rows).toHaveCount(0);
          await list.open({ nameEn: customer.nameEn });
          await expect(list.rows).toHaveCount(0);
          await signIn.context.close();
          expect(
            await signInError(browser, pagesOn, customer.phone, customer.password),
          ).not.toBeNull();
        },
      );

      test(
        `The deleted ${section.userType.shown} is listed in Deleted Users with its details and type`,
        { tag: ['@smoke', '@functional'] },
        async ({ page, deletedUserListPage: deleted }) => {
          await deleted.goto();
          const rows = await deleted.readRows();
          const row = rows.find((r) => r.ID === customer.id);
          expect(row, 'listed among the newest deleted users').toBeDefined();
          expect(row).toMatchObject({
            'Arabic Name': customer.name,
            'English Name': customer.nameEn,
            Phone: customer.phone,
            Email: customer.email,
            'User Type': section.userType.shown,
          });

          await page.reload();
          expect(await deleted.rowIds()).toContain(customer.id);
          await deleted.open({ phone: customer.phone, userType: section.userType.value });
          expect(await deleted.rowIds()).toEqual([customer.id]);
        },
      );
    },
  );
}

test.describe('Deleted Users - test customer setup', { tag: ['@regression'] }, () => {
  test(
    'Convert user type turns a dealer into an Individual',
    { tag: ['@functional', '@mutates'] },
    async ({ browser, pagesOn, dealerListPage, individualListPage, dealerFormPage }) => {
      test.setTimeout(60_000);
      const customer = newTestCustomer('individual');
      const created: TestCustomer[] = [];
      try {
        await dealerFormPage.gotoCreate();
        await dealerFormPage.fill(customer, testCityId);
        await dealerFormPage.save();
        await dealerListPage.open({ phone: customer.phone });
        const [id] = await dealerListPage.rowIds();
        created.push({ ...customer, kind: 'individual', id });

        await dealerListPage.clickConvert(id);
        await expect(dealerListPage.convertModal).toContainText(
          text.convertQuestion(customer.nameEn),
        );
        await dealerListPage.convertYesButton.click();
        await expect(dealerListPage.convertResult).toContainText(text.converted);

        await dealerListPage.open({ phone: customer.phone });
        await expect(dealerListPage.rows).toHaveCount(0);
        await individualListPage.open({ phone: customer.phone });
        expect(await individualListPage.rowIds()).toEqual([id]);
      } finally {
        await deleteTestCustomers(browser, pagesOn, created);
      }
    },
  );
});
