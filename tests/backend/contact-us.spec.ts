import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { ContactUsPage } from '@pages/backend/content/contact-us.page';
import { parseCsv } from '@utils/csv';
import { readTextAndDelete } from '@utils/files';
import {
  type AccessProfile,
  backendHomePath,
  expectedAccess,
  forbiddenStatus,
} from '@test-data/backend-permissions.data';
import {
  type ContactType,
  contactTypes,
  contactUsAccess,
  contactUsData,
  contactUsText,
  contactUsUrls,
} from '@test-data/backend-contact-us.data';

// Global Settings > Contact us (/backend/contactUs/contact-us/index): messages from the
// website's Contact Us and Sell On Mazad forms. Read-only: a delete is only ever opened and
// cancelled. The grid holds names, phones and emails, which stay out of test titles. Then, who
// can list, view and delete messages.

test.use(devRootSession);

const types = Object.keys(contactTypes) as ContactType[];

test.describe('Backend - Contact us', { tag: '@regression' }, () => {
  test.use({ signedInAs: 'devRoot' });

  test.beforeEach(async ({ page, contactUsPage }) => {
    await contactUsPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(contactUsUrls.list);
  });

  test(
    'Page shows the heading, filters and the messages grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, contactUsPage: list }) => {
      await expect(page).toHaveTitle(contactUsText.pageTitle);
      await expect(list.pageHeading).toHaveText(contactUsText.pageTitle);
      await expect(list.breadcrumbCurrent).toHaveText(contactUsText.pageTitle);
      await expect(list.sidebarLink).toHaveText(contactUsText.sidebarLabel);

      for (const input of [list.idInput, list.nameInput, list.phoneInput, list.emailInput]) {
        await expect(input).toBeEditable();
      }
      await expect(list.columnHeaders).toHaveText([...contactUsText.columnHeaders]);
      await expect(list.summary).toHaveText(
        new RegExp(`^Showing 1-${contactUsData.pageSize} of [\\d,]+ items\\.$`),
      );
    },
  );

  test.describe('types', () => {
    test(
      'Contact Us + Sell On Mazad cover every message',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        const total = await list.totalCount();
        let sum = 0;

        for (const type of types) {
          await test.step(contactTypes[type], async () => {
            await list.gotoType(type);
            const shown = (await list.readRows()).map((row) => row.type);
            expect(shown.filter((label) => label !== contactTypes[type])).toEqual([]);
            sum += await list.totalCount();
          });
        }

        expect(sum, 'messages across both types').toBe(total);
      },
    );

    test(
      'Type filter in the form selects that type',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        await list.filterByType('sell_on_mazad');

        await expect(list.typeSelect).toHaveValue('sell_on_mazad');
        const shown = (await list.readRows()).map((row) => row.type);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.filter((label) => label !== contactTypes.sell_on_mazad)).toEqual([]);
      },
    );

    test(
      'Sell On Mazad messages name a company; Contact Us messages do not',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        await list.gotoType('sell_on_mazad');
        const sell = await list.readRows();
        expect(sell.filter((row) => row.company === contactUsText.notSet).map((r) => r.id)).toEqual(
          [],
        );

        await list.gotoType('contact_us');
        const contact = await list.readRows();
        expect(
          contact.filter((row) => row.company !== contactUsText.notSet).map((r) => r.id),
        ).toEqual([]);
      },
    );
  });

  test.describe('rows (every message on the first page)', () => {
    test(
      'Messages are listed newest first',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        const ids = (await list.readRows()).map((row) => Number(row.id));

        expect(ids).toEqual([...ids].sort((a, b) => b - a));
      },
    );

    test(
      'Each message has an email address',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        const rows = await list.readRows();

        expect(
          rows.filter((row) => !contactUsData.emailFormat.test(row.email)).map((row) => row.id),
        ).toEqual([]);
      },
    );

    test(
      'Each message has View and Delete',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        const count = await list.rows.count();

        await expect(list.viewLink(list.rows)).toHaveCount(count);
        await expect(list.deleteLink(list.rows)).toHaveCount(count);
      },
    );
  });

  test.describe('filters', () => {
    test(
      'ID, phone and email find the message',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        const [first] = await list.readRows();

        await test.step('ID', async () => {
          await list.searchBy('idInput', first.id);
          await expect(list.rows).toHaveCount(1);
          await expect(list.row(first.id)).toHaveCount(1);
        });
        await test.step('phone', async () => {
          await list.reset();
          await list.searchBy('phoneInput', first.mobile);
          await expect(list.row(first.id)).toHaveCount(1);
          const phones = (await list.readRows()).map((row) => row.mobile);
          expect(phones.filter((phone) => !phone.includes(first.mobile))).toEqual([]);
        });
        await test.step('email', async () => {
          await list.reset();
          await list.searchBy('emailInput', first.email);
          await expect(list.row(first.id)).toHaveCount(1);
        });
        await test.step('unknown email', async () => {
          await list.reset();
          await list.searchBy('emailInput', contactUsData.unknownEmail);
          await expect(list.emptyMessage).toHaveText(contactUsText.noResults);
        });
      },
    );

    test('Name finds the message', { tag: '@functional' }, async ({ contactUsPage: list }) => {
      const [first] = await list.readRows();
      const firstWord = first.name.split(' ')[0];

      await list.searchBy('nameInput', firstWord);

      await expect(list.row(first.id)).toHaveCount(1);
    });

    test(
      'Company finds Sell On Mazad messages',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        await list.gotoType('sell_on_mazad');
        const [first] = await list.readRows();
        await list.goto();

        await list.searchBy('companyInput', first.company);

        await expect(list.row(first.id)).toHaveCount(1);
      },
    );

    test(
      'Reset clears the filters',
      { tag: '@functional' },
      async ({ page, contactUsPage: list }) => {
        const total = await list.totalCount();
        await list.searchBy('emailInput', contactUsData.unknownEmail);
        await expect(list.emptyMessage).toBeVisible();

        await list.reset();

        await expect(page).toHaveURL(/\/backend\/contactUs\/contact-us\/index$/);
        expect(await list.totalCount()).toBe(total);
      },
    );
  });

  test.describe('sorting', () => {
    test(
      'ID sorts ascending, then descending',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        await list.gotoSorted('id');
        const ascending = (await list.readRows()).map((row) => Number(row.id));
        expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

        await list.gotoSorted('-id');
        const descending = (await list.readRows()).map((row) => Number(row.id));
        expect(descending).toEqual([...descending].sort((a, b) => b - a));
      },
    );

    test(
      'Created At sorts ascending, then descending',
      { tag: '@functional' },
      async ({ contactUsPage: list }) => {
        await list.gotoSorted('created_at');
        const ascending = (await list.readRows()).map((row) => row.createdAt);
        expect(ascending).toEqual([...ascending].sort());

        await list.gotoSorted('-created_at');
        const descending = (await list.readRows()).map((row) => row.createdAt);
        expect(descending).toEqual([...descending].sort().reverse());
      },
    );
  });

  test.describe('actions', () => {
    test(
      'View opens the message in a new tab, with its text',
      { tag: '@functional' },
      async ({ page, pagesOn, contactUsPage: list }) => {
        const row = list.rows.first();
        const { id, email } = await list.readRow(row);

        const [tab] = await Promise.all([
          page.context().waitForEvent('page'),
          list.viewLink(row).click(),
        ]);
        await tab.waitForLoadState();

        await expect(tab).toHaveURL(contactUsUrls.view(id));
        const view = pagesOn(tab).contactUsPage;
        await expect(view.detailLabels).toHaveText([...contactUsText.viewLabels]);
        await expect(view.detailView).toContainText(email);
      },
    );

    test(
      'Cancelling Delete keeps the message',
      { tag: '@functional' },
      async ({ page, contactUsPage: list }) => {
        const row = list.rows.first();
        const { id } = await list.readRow(row);
        const total = await list.totalCount();
        // The delete endpoint is blocked for the whole test: even if the confirmation disappears or
        // OK is clicked by mistake, the real customer message cannot be deleted.
        const deletes = await list.blockRequests(contactUsUrls.deleteEndpoint);

        const message = await list.openAndCancelDelete(row);

        expect(message).toBe(contactUsText.deleteConfirm);
        expect(deletes(), 'delete requests attempted').toBe(0);
        await page.reload();
        await expect(list.row(id)).toHaveCount(1);
        expect(await list.totalCount()).toBe(total);
      },
    );
  });

  test(
    'Export CSV downloads every message, with its text',
    { tag: '@functional' },
    async ({ contactUsPage: list }) => {
      test.slow();
      const total = await list.totalCount();

      const download = await list.exportCsv();

      expect(download.suggestedFilename()).toMatch(contactUsUrls.csvFileName);
      // Messages hold line breaks, so the file is read as CSV records, not lines.
      // The file holds names, phones and emails: it is read, then deleted at once.
      const [headers, ...records] = parseCsv(readTextAndDelete(await download.path()));
      expect(headers).toEqual([...contactUsText.csvHeaders]);
      expect(records.length, 'messages in the CSV').toBe(total);
    },
  );
});

const profiles = Object.keys(contactUsAccess) as AccessProfile[];

for (const profile of profiles) {
  const access = contactUsAccess[profile];

  test.describe(
    `Contact us permissions - ${expectedAccess[profile].label}`,
    { tag: '@regression' },
    () => {
      test.use({ signedInAs: profile });

      test(
        `${access.list ? 'can' : 'cannot'} open the messages list`,
        { tag: '@negative' },
        async ({ page }) => {
          const response = await page.goto(ContactUsPage.path);

          expect(response?.status()).toBe(access.list ? 200 : forbiddenStatus);
        },
      );

      test(
        `${access.view ? 'can' : 'cannot'} open a message`,
        { tag: '@negative' },
        async ({ page, browser, baseURL, pagesOn }) => {
          // The newest message's ID, read as Dev Root (this role may not see the list).
          const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
          let id: string | undefined;
          try {
            const staffList = pagesOn(await staff.newPage()).contactUsPage;
            await staffList.goto();
            [id] = await staffList.rowIds();
          } finally {
            await staff.close();
          }
          test.skip(!id, 'No message on staging.');

          const response = await page.goto(contactUsUrls.viewPath(id));

          expect(response?.status()).toBe(access.view ? 200 : forbiddenStatus);
        },
      );

      test(
        `the sidebar ${access.list ? 'links to' : 'has no link to'} Contact us`,
        { tag: '@functional' },
        async ({ page, mazadDashboardPage }) => {
          await page.goto(backendHomePath);

          await expect(mazadDashboardPage.sidebarLinkTo(ContactUsPage.path)).toHaveCount(
            access.list ? 1 : 0,
          );
        },
      );

      // Sent only where it must be refused, with a message ID that does not exist.
      if (!access.delete) {
        test(
          'server rejects deleting a message',
          { tag: '@negative' },
          async ({ page, mazadDashboardPage }) => {
            await page.goto(backendHomePath);

            const status = await mazadDashboardPage.postAction(
              contactUsUrls.deletePath(contactUsData.missingId),
            );

            expect(status, 'delete HTTP status').toBe(forbiddenStatus);
          },
        );
      }

      if (access.list && !access.delete) {
        test(
          'the list shows no Delete action',
          { tag: '@negative' },
          async ({ contactUsPage: list }) => {
            await list.goto();

            await expect(list.deleteLink(list.rows)).toHaveCount(0);
          },
        );
      }
    },
  );
}
