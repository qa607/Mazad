import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { MemberRow } from '@pages/backend/suppliers/supplier-member-list.page';
import {
  type MemberSortableColumn,
  allOnOnePage,
  isTestMember,
  memberColumns,
  memberFilterLabels,
  memberRowActions,
  memberSortableColumns,
  memberStatuses,
  pagingSize,
  supplierMemberText,
  supplierMemberUrls,
} from '@test-data/supplier-member.data';

/**
 * Mazad Backend > Users > Suppliers > Supplier Members: page, grid, sorting and paging.
 * Read-only. Expected results come from the live list, and QA-AUTO test members are left out of
 * comparisons because supplier-member-crud.spec.ts adds and deletes one in parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const ALL = { 'per-page': String(allOnOnePage) };
const realIds = (rows: MemberRow[]) =>
  rows.filter((row) => !isTestMember(row)).map((row) => row.ID);
const compare = (column: MemberSortableColumn) => (a: string, b: string) =>
  column === 'ID' ? Number(a) - Number(b) : a.localeCompare(b, 'en', { numeric: true });

test.describe('Supplier Members - page and grid', { tag: ['@regression'] }, () => {
  test(
    'Supplier Members in the sidebar, next to Supplier List, opens the list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, supplierMemberListPage: list }) => {
      // On the Supplier List page the Users > Suppliers menu is already open. Opening the
      // two nested levels from the dashboard was flaky: the second level was clicked while the
      // first was still opening.
      await supplierListPage.goto();
      await supplierListPage.openFromSidebar('Supplier Members');

      await expect(page).toHaveURL(supplierMemberUrls.list);
      await expect(page).toHaveTitle(supplierMemberText.listTitle);
      await expect(list.pageHeading).toHaveText(supplierMemberText.listTitle);
      await expect(list.sidebarLink).toHaveClass(/mm-active/);
    },
  );

  test(
    'Shows the filters, buttons and grid columns',
    { tag: ['@smoke', '@ui'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...memberFilterLabels]);
      await expect(list.selectedStatus()).toHaveText(supplierMemberText.statusPlaceholder);
      await expect(list.statusOptions).toHaveText([
        supplierMemberText.statusPlaceholder,
        ...memberStatuses,
      ]);
      for (const control of [
        list.createButton,
        list.searchButton,
        list.resetButton,
        list.exportColumnsToggle,
        list.exportMenuToggle,
      ]) {
        await expect(control).toBeVisible();
      }
      expect(await list.headerTexts()).toEqual([...memberColumns, 'Actions']);
    },
  );

  test(
    'Lists members newest first, numbered, with a matching summary',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, ALL);
      const rows = await list.readRows();

      expect(rows.length).toBeGreaterThan(0);
      expect(await list.summaryCounts()).toEqual({ from: 1, to: rows.length, total: rows.length });
      expect(rows.map((row) => row['#'])).toEqual(rows.map((_, i) => String(i + 1)));
      const created = rows.map((row) => row['Created At']);
      expect(created).toEqual([...created].sort().reverse());
    },
  );

  test(
    'Every row has valid values and a unique ID and phone',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, ALL);
      const rows = await list.readRows();

      for (const row of rows) {
        expect(row.ID, 'ID').toMatch(/^\d+$/);
        expect(memberStatuses, `status of ${row.ID}`).toContain(row.Status);
        expect(row.Phone, `phone of ${row.ID}`).toMatch(/^05\d{8}$/);
        expect(row['Created At'], `created at of ${row.ID}`).toMatch(
          /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
        );
        // A member without an email shows "(not set)".
        expect(row.Email, `email of ${row.ID}`).toMatch(/^(\(not set\)|\S+@\S+)$/);
      }
      expect(new Set(rows.map((row) => row.ID)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.Phone)).size).toBe(rows.length);
    },
  );

  test(
    'Active rows offer View, Update, Delete and Permission',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({ status: 'active' }, ALL);
      const ids = realIds(await list.readRows());
      test.skip(ids.length === 0, 'No active members on this environment.');

      for (const id of ids) {
        expect(await list.rowActions(id), `actions of ${id}`).toEqual([...memberRowActions]);
      }
      for (const action of ['view', 'update', 'update-permission'] as const) {
        await expect(list.actionLink(ids[0], action)).toHaveAttribute('target', '_blank');
      }
      await expect(list.actionLink(ids[0], 'delete')).toHaveAttribute('data-method', 'post');
    },
  );

  test(
    'The View page of every listed member opens',
    { tag: ['@functional'] },
    async ({ page, supplierMemberListPage: list }) => {
      await list.open({}, ALL);

      for (const id of realIds(await list.readRows())) {
        const response = await page.request.get(`/backend/users/supplier-member/view?id=${id}`);
        expect(response.status(), `view of ${id}`).toBe(200);
      }
    },
  );

  test(
    'View, update and permission pages of an unknown ID return 404',
    { tag: ['@negative'] },
    async ({ page }) => {
      for (const action of ['view', 'update', 'update-permission']) {
        const response = await page.request.get(
          `/backend/users/supplier-member/${action}?id=99999999`,
        );
        expect(response.status(), action).toBe(404);
      }
    },
  );
});

test.describe('Supplier Members - sorting', { tag: ['@regression'] }, () => {
  test(
    'Only ID, Phone and Created At are sortable',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();

      const sortable = await list.columnHeaders.locator('a[data-sort]').allInnerTexts();
      expect(sortable.map((text) => text.trim()).sort()).toEqual(
        Object.keys(memberSortableColumns).sort(),
      );
    },
  );

  for (const column of Object.keys(memberSortableColumns) as MemberSortableColumn[]) {
    test(
      `Clicking ${column} sorts ascending, clicking again sorts descending`,
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list }) => {
        await list.open({}, ALL);

        await test.step('First click: ascending', async () => {
          await list.sortBy(column);
          const ascending = await list.columnValues(column);
          expect(ascending.length).toBeGreaterThan(0);
          expect(ascending).toEqual([...ascending].sort(compare(column)));
          await expect(list.sortLink(column)).toHaveClass(/asc/);
        });

        await test.step('Second click: descending', async () => {
          await list.sortBy(column);
          const descending = await list.columnValues(column);
          expect(descending).toEqual([...descending].sort(compare(column)).reverse());
          await expect(list.sortLink(column)).toHaveClass(/desc/);
        });
      },
    );
  }

  test(
    'An unknown sort column leaves the list intact',
    { tag: ['@negative'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, ALL);
      const before = realIds(await list.readRows()).sort();

      await list.open({}, { ...ALL, sort: 'email' });

      expect(realIds(await list.readRows()).sort()).toEqual(before);
    },
  );
});

test.describe('Supplier Members - paging', { tag: ['@regression'] }, () => {
  let all: MemberRow[] = [];

  test.beforeEach(async ({ supplierMemberListPage: list }) => {
    await list.open({}, ALL);
    all = (await list.readRows()).filter((row) => !isTestMember(row));
    test.skip(all.length <= pagingSize, `Needs more than ${pagingSize} members to page through.`);
  });

  test(
    'Pages together list every member once, with continuous numbering',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const rows: MemberRow[] = [];
      // One page more than needed, in case a test member was added meanwhile.
      for (let n = 1; n <= Math.ceil((all.length + 1) / pagingSize); n++) {
        await list.openPage(n, pagingSize);
        const { total } = await list.summaryCounts();
        rows.push(...(await list.readRows()));
        if (n * pagingSize >= total) break;
      }

      expect(realIds(rows).sort()).toEqual(realIds(all).sort());
      expect(rows.map((row) => row['#'])).toEqual(rows.map((_, i) => String(i + 1)));
    },
  );

  test(
    'Next and Previous move between pages and keep the page size',
    { tag: ['@functional'] },
    async ({ page, supplierMemberListPage: list }) => {
      await list.openPage(1, pagingSize);
      await expect(list.previousPage).toHaveClass(/disabled/);

      await list.goToNextPage();
      expect(new URL(page.url()).searchParams.get('page')).toBe('2');
      const { from, to } = await list.summaryCounts();
      expect(from).toBe(pagingSize + 1);
      await expect(list.rows).toHaveCount(to - from + 1);
      expect(to - from + 1).toBeLessThanOrEqual(pagingSize);

      await list.goToPreviousPage();
      expect((await list.columnValues('#'))[0]).toBe('1');
    },
  );

  test(
    'The last page disables Next',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.openPage(1, pagingSize);
      const last = Math.ceil((await list.summaryCounts()).total / pagingSize);
      await list.openPage(last, pagingSize);

      await expect(list.nextPage).toHaveClass(/disabled/);
      const { to, total } = await list.summaryCounts();
      expect(to).toBe(total);
    },
  );

  test(
    'Sorting by ID stays in order across pages',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const ids: number[] = [];
      for (let n = 1; n <= Math.ceil(all.length / pagingSize); n++) {
        await list.openPage(n, pagingSize, { sort: 'id' });
        ids.push(...realIds(await list.readRows()).map(Number));
      }

      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size, 'no member on two pages').toBe(ids.length);
    },
  );

  test(
    'Out-of-range and invalid page numbers still load the list',
    { tag: ['@negative'] },
    async ({ supplierMemberListPage: list }) => {
      for (const value of ['99999', '-1', 'abc']) {
        await list.openPage(value, pagingSize);
        await expect(list.rows.first(), `page=${value}`).toBeVisible();
      }
    },
  );
});
