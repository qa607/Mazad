import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { DeletedUserRow } from '@pages/backend/customers/deleted-user-list.page';
import {
  type DeletedUserSortableColumn,
  customerSections,
  defaultPageSize,
  deletedUserColumns,
  deletedUserFilterLabels,
  deletedUserSortableColumns,
  deletedUserText as text,
  deletedUserUrls,
  noMatchName,
  unusualFilterValues,
} from '@test-data/deleted-user.data';

/**
 * Mazad Backend > Users > Deleted Users: page, grid, sorting, paging and filters, signed in as
 * Dev Root. Read-only. Expected results come from the live list (thousands of deleted users),
 * so new QA-AUTO rows added by the delete specs in parallel do not change the checks.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());
const userTypes = Object.values(customerSections).map((section) => section.userType);

test.describe('Deleted Users - page and grid', { tag: ['@regression'] }, () => {
  test(
    'Deleted Users in the sidebar opens the list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, deletedUserListPage: list }) => {
      // On the Supplier List page the Users menu is already open.
      await supplierListPage.goto();
      await list.openFromSidebarLink();

      await expect(page).toHaveURL(deletedUserUrls.deletedUsers);
      await expect(page).toHaveTitle(text.deletedUsersTitle);
      await expect(list.pageHeading).toHaveText(text.deletedUsersTitle);
      await expect(list.breadcrumbCurrent).toHaveText(text.deletedUsersTitle);
    },
  );

  test(
    'Shows the filters and grid columns, with no Create and no row actions',
    { tag: ['@smoke', '@ui'] },
    async ({ deletedUserListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...deletedUserFilterLabels]);
      await expect(list.selectedUserType()).toHaveText(text.userTypePlaceholder);
      await expect(list.userTypeOptions).toHaveText([
        text.userTypePlaceholder,
        ...userTypes.map((type) => type.shown),
      ]);
      expect(await list.headerTexts()).toEqual([...deletedUserColumns]);
      for (const column of Object.keys(deletedUserSortableColumns) as DeletedUserSortableColumn[]) {
        await expect(list.sortLink(column), `${column} is sortable`).toBeVisible();
      }
      await expect(list.rowLinks).toHaveCount(0);
      for (const control of [list.searchButton, list.resetButton, list.exportMenuToggle]) {
        await expect(control).toBeVisible();
      }
    },
  );

  test(
    'Lists deleted users numbered, 20 to a page, each as Individual or Dealer',
    { tag: ['@functional'] },
    async ({ deletedUserListPage: list }) => {
      await list.goto();
      const rows = await list.readRows();
      const { from, to, total } = await list.summaryCounts();

      // The default order is the most recently deleted first; deletion times are not shown,
      // so the delete specs check that a just-deleted user is listed on the first page.
      expect(rows).toHaveLength(Math.min(defaultPageSize, total));
      expect({ from, to }).toEqual({ from: 1, to: rows.length });
      expect(rows.map((row) => row['#'])).toEqual(rows.map((_, i) => String(i + 1)));
      for (const row of rows) {
        expect(
          userTypes.map((type) => type.shown),
          `type of ${row.ID}`,
        ).toContain(row['User Type']);
        expect(row.Phone, `phone of ${row.ID}`).toMatch(/^05\d{8}$/);
        expect(row['Joining Date'], `joining date of ${row.ID}`).toMatch(
          /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
        );
      }
    },
  );

  test(
    'Active Individuals and Dealers are not listed in Deleted Users',
    { tag: ['@functional'] },
    async ({ individualListPage, dealerListPage, deletedUserListPage: deleted }) => {
      // Compared by ID: a phone can belong to both an active user and an older deleted account,
      // since a deleted user's phone may be registered again.
      for (const list of [individualListPage, dealerListPage]) {
        await list.goto();
        const ids = (await list.rowIds()).slice(0, 5);
        const phones = (await list.phones()).slice(0, 5);
        expect(ids.length).toBeGreaterThan(0);
        for (const [i, id] of ids.entries()) {
          await deleted.open({ phone: phones[i] });
          expect(await deleted.rowIds(), `active user ${id}`).not.toContain(id);
        }
      }
    },
  );
});

test.describe('Deleted Users - sorting and paging', { tag: ['@regression'] }, () => {
  for (const column of Object.keys(deletedUserSortableColumns) as DeletedUserSortableColumn[]) {
    test(
      `Sorts by ${column} ascending, then descending`,
      { tag: ['@functional'] },
      async ({ deletedUserListPage: list }) => {
        await list.goto();
        const key = column === 'ID' ? (v: string) => Number(v) : (v: string) => v;
        const sorted = (values: string[]) =>
          [...values].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

        await list.sortBy(column);
        const ascending = await list.columnValues(column);
        expect(ascending).toEqual(sorted(ascending));

        await list.sortBy(column);
        const descending = await list.columnValues(column);
        expect(descending).toEqual(sorted(descending).reverse());
      },
    );
  }

  test(
    'Next, Previous and page links move through the list',
    { tag: ['@functional'] },
    async ({ deletedUserListPage: list }) => {
      await list.goto();
      const first = await list.rowIds();

      await list.goToNextPage();
      await expect(list.activePage).toHaveText('2');
      expect(await list.summaryCounts()).toMatchObject({ from: 21, to: 40 });
      const second = await list.readRows();
      expect(second[0]['#']).toBe('21');
      expect(second.map((row) => row.ID).filter((id) => first.includes(id))).toEqual([]);

      await list.goToPage(3);
      await expect(list.activePage).toHaveText('3');
      await list.goToPreviousPage();
      await expect(list.activePage).toHaveText('2');
    },
  );

  test(
    'Out-of-range and invalid page numbers do not break the list',
    { tag: ['@negative'] },
    async ({ deletedUserListPage: list }) => {
      expect(await list.open({}, { page: '99999' })).toBe(200);
      const { to, total } = await list.summaryCounts();
      expect(to).toBe(total);
      for (const pageNumber of ['-1', 'abc']) {
        expect(await list.open({}, { page: pageNumber })).toBe(200);
        expect((await list.summaryCounts()).from).toBe(1);
      }
    },
  );
});

test.describe('Deleted Users - filters', { tag: ['@regression'] }, () => {
  let sample: DeletedUserRow[] = [];

  test.beforeEach(async ({ deletedUserListPage: list }) => {
    await list.goto();
    sample = await list.readRows();
  });

  /** A deleted user of the given type from the first page, with an email when possible. */
  const pick = (shown?: string) =>
    sample.find((r) => (!shown || r['User Type'] === shown) && r.Email !== '(not set)') ??
    sample.find((r) => !shown || r['User Type'] === shown)!;

  test(
    'Each text filter finds a deleted user by its full value',
    { tag: ['@smoke', '@functional'] },
    async ({ deletedUserListPage: list }) => {
      const user = pick();
      for (const filters of [
        { phone: user.Phone },
        { name: user['Arabic Name'] },
        { nameEn: user['English Name'] },
        ...(user.Email === '(not set)' ? [] : [{ email: user.Email }]),
      ]) {
        await test.step(`Filter by ${Object.keys(filters)[0]}`, async () => {
          await list.open(filters);
          expect(await list.rowIds()).toContain(user.ID);
        });
      }
    },
  );

  test(
    'Typing a phone and pressing Enter runs the search',
    { tag: ['@functional'] },
    async ({ deletedUserListPage: list }) => {
      const user = pick();
      await list.phoneFilter.fill(user.Phone);
      await list.searchWithEnter(list.phoneFilter);

      await expect(list.phoneFilter).toHaveValue(user.Phone);
      expect(await list.columnValues('Phone')).toEqual(
        Array((await list.rowIds()).length).fill(user.Phone),
      );
      expect(await list.rowIds()).toContain(user.ID);
    },
  );

  test(
    'English Name matches part of the name in any letter case',
    { tag: ['@functional'] },
    async ({ deletedUserListPage: list }) => {
      const user = sample.find((r) => /[A-Za-z]{4}/.test(r['English Name'])) ?? pick();
      const term = user['English Name'].slice(0, 4);
      for (const value of [term.toLowerCase(), term.toUpperCase()]) {
        await list.open({ nameEn: value });
        for (const name of await list.columnValues('English Name')) {
          expect(includes(name, value), `"${name}" contains "${value}"`).toBe(true);
        }
      }
    },
  );

  test(
    'Phone filter matches the whole number only',
    { tag: ['@functional'] },
    async ({ deletedUserListPage: list }) => {
      const user = pick();
      await list.open({ phone: user.Phone.slice(-5) });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  for (const type of userTypes) {
    test(
      `User Type "${type.shown}" shows only ${type.shown} users`,
      { tag: ['@functional'] },
      async ({ deletedUserListPage: list }) => {
        await list.chooseUserType(type.shown);
        await list.search();

        await expect(list.selectedUserType()).toContainText(type.shown);
        const types = await list.columnValues('User Type');
        expect(types.length).toBeGreaterThan(0);
        expect(new Set(types)).toEqual(new Set([type.shown]));
      },
    );
  }

  test(
    'User Type with a name of the other type shows the empty state',
    { tag: ['@negative'] },
    async ({ deletedUserListPage: list }) => {
      const user = pick();
      const other = userTypes.find((type) => type.shown !== user['User Type'])!;

      await list.open({ phone: user.Phone, userType: other.value });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
      await list.open({
        phone: user.Phone,
        userType: userTypes.find((t) => t.shown === user['User Type'])!.value,
      });
      expect(await list.rowIds()).toContain(user.ID);
    },
  );

  test(
    'A name nobody has shows the empty state',
    { tag: ['@negative'] },
    async ({ deletedUserListPage: list }) => {
      await list.open({ nameEn: noMatchName });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
      await expect(list.rows).toHaveCount(0);
      await expect(list.summary).toHaveCount(0);
    },
  );

  test(
    'Reset clears the filters and shows every deleted user',
    { tag: ['@functional'] },
    async ({ deletedUserListPage: list }) => {
      const { total } = await list.summaryCounts();
      const user = pick();
      await list.open({ phone: user.Phone, nameEn: 'a' });

      await list.reset();

      await expect(list.phoneFilter).toHaveValue('');
      await expect(list.nameEnFilter).toHaveValue('');
      await expect(list.selectedUserType()).toHaveText(text.userTypePlaceholder);
      expect((await list.summaryCounts()).total).toBeGreaterThanOrEqual(total);
    },
  );

  test(
    'Filters and results survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, deletedUserListPage: list }) => {
      const user = pick();
      await list.open({ phone: user.Phone });
      const before = await list.rowIds();

      await page.reload();

      await expect(list.phoneFilter).toHaveValue(user.Phone);
      expect(await list.rowIds()).toEqual(before);
    },
  );

  for (const { name, value } of unusualFilterValues) {
    test(
      `English Name with ${name} loads without errors`,
      { tag: ['@negative'] },
      async ({ deletedUserListPage: list }) => {
        const dialogs = list.countDialogs();
        expect(await list.open({ nameEn: value })).toBe(200);
        for (const row of await list.columnValues('English Name')) {
          expect(includes(row, value)).toBe(true);
        }
        expect(dialogs(), 'no script ran').toBe(0);
      },
    );
  }
});
