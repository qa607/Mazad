import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { AdminRow } from '@pages/backend/admins/super-admin-list.page';
import { parseCsv } from '@utils/csv';
import {
  type AdminSortableColumn,
  adminColumns,
  adminExportFormats,
  adminFilterLabels,
  adminRowActions,
  adminSortableColumns,
  adminStatuses,
  allOnOnePage,
  isTestAdmin,
  noMatchName,
  pagingSize,
  superAdminText as text,
  superAdminUrls,
  unknownAdminId,
  unusualFilterValues,
} from '@test-data/super-admin.data';

/**
 * Mazad Backend > Users > Super Admins: page, grid, sorting, paging, filters and export, signed
 * in as Dev Root. Read-only. Expected results come from the live list, and QA-AUTO test admins
 * are left out of comparisons because the CRUD and access specs add and delete them in parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const ALL = { 'per-page': String(allOnOnePage) };
const realRows = (rows: AdminRow[]) => rows.filter((row) => !isTestAdmin(row));
const realIds = (rows: AdminRow[]) => realRows(rows).map((row) => row.ID);
const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());
const compare = (column: AdminSortableColumn) => (a: string, b: string) =>
  column === 'ID' ? Number(a) - Number(b) : a.localeCompare(b, 'en', { numeric: true });

test.describe('Super Admin - page and grid', { tag: ['@regression'] }, () => {
  test(
    'Super Admins in the sidebar opens the Admins list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, superAdminListPage: list }) => {
      // On the Supplier List page the Users menu is already open.
      await supplierListPage.goto();
      await expect(list.sidebarLink).toHaveText(text.sidebarLabel);
      await list.openFromSidebarLink();

      await expect(page).toHaveURL(superAdminUrls.list);
      await expect(page).toHaveTitle(text.listTitle);
      await expect(list.pageHeading).toHaveText(text.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(text.listTitle);
    },
  );

  test(
    'Shows the filters, buttons and grid columns',
    { tag: ['@smoke', '@ui'] },
    async ({ superAdminListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...adminFilterLabels]);
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      await expect(list.statusOptions).toHaveText([text.statusPlaceholder, ...adminStatuses]);
      for (const control of [
        list.createButton,
        list.searchButton,
        list.resetButton,
        list.exportColumnsToggle,
        list.exportMenuToggle,
      ]) {
        await expect(control).toBeVisible();
      }
      expect(await list.headerTexts()).toEqual([...adminColumns, 'Actions']);
      for (const column of Object.keys(adminSortableColumns) as AdminSortableColumn[]) {
        await expect(list.sortLink(column), `${column} is sortable`).toBeVisible();
      }
    },
  );

  test(
    'Lists admins newest first by Created At, numbered, with a matching summary',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      await list.goto();
      const rows = await list.readRows();

      expect(rows.length).toBeGreaterThan(0);
      expect(await list.summaryCounts()).toEqual({ from: 1, to: rows.length, total: rows.length });
      expect(rows.map((row) => row['#'])).toEqual(rows.map((_, i) => String(i + 1)));
      // Newest first by Created At (not by ID: admin 5 was created after admin 854).
      const created = rows.map((row) => row['Created At']);
      expect(created).toEqual([...created].sort().reverse());
    },
  );

  test(
    'Every row has valid values, a unique ID, phone and email, and its actions',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      await list.open({}, ALL);
      const rows = await list.readRows();

      for (const row of rows) {
        expect(row.ID, 'ID').toMatch(/^\d+$/);
        expect(row['Arabic Name'], `Arabic name of ${row.ID}`).not.toBe('');
        expect(row['English Name'], `English name of ${row.ID}`).not.toBe('');
        expect(adminStatuses, `status of ${row.ID}`).toContain(row.Status);
        expect(row.Phone, `phone of ${row.ID}`).toMatch(/^05\d{8}$/);
        // An admin without an email shows "(not set)".
        expect(row.Email, `email of ${row.ID}`).toMatch(/^(\(not set\)|\S+@\S+)$/);
        expect(row['Created At'], `created at of ${row.ID}`).toMatch(
          /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
        );
        expect(await list.rowActions(row.ID), `actions of ${row.ID}`).toEqual([...adminRowActions]);
      }
      expect(new Set(rows.map((row) => row.ID)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.Phone)).size).toBe(rows.length);
      const emails = rows.map((row) => row.Email).filter((email) => email !== '(not set)');
      expect(new Set(emails).size).toBe(emails.length);
    },
  );

  test(
    'View opens in a new tab with the values shown in the grid',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list, pagesOn }) => {
      await list.goto();
      const [row] = realRows(await list.readRows());
      const tab = await list.openInNewTab(list.actionLink(row.ID, 'view'));
      const { superAdminFormPage: view } = pagesOn(tab);

      await expect(tab).toHaveURL(new RegExp(`/users/admin/view\\?id=${row.ID}$`));
      await expect(view.pageHeading).toHaveText(row['English Name']);
      await expect(view.breadcrumbCurrent).toHaveText(row['English Name']);
      expect(await view.viewFields()).toMatchObject({
        'English Name': row['English Name'],
        'Arabic Name': row['Arabic Name'],
        Status: row.Status,
        Email: row.Email === '(not set)' ? '' : row.Email,
        Phone: row.Phone,
        'Created At': row['Created At'],
      });
      await expect(view.viewUpdateButton).toBeVisible();
      await expect(view.viewDeleteButton).toBeVisible();
      await tab.close();
    },
  );

  test(
    'Update opens in a new tab with the form filled',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list, pagesOn }) => {
      await list.goto();
      const [row] = realRows(await list.readRows());
      const tab = await list.openInNewTab(list.actionLink(row.ID, 'update'));
      const { superAdminFormPage: form } = pagesOn(tab);

      await expect(tab).toHaveTitle(`${text.updateTitlePrefix}${row['English Name']}`);
      await expect(form.input('name')).toHaveValue(row['Arabic Name']);
      await expect(form.input('nameEn')).toHaveValue(row['English Name']);
      await expect(form.input('newPassword')).toBeEmpty();
      await tab.close();
    },
  );

  test(
    'View and Update of an unknown admin answer 404',
    { tag: ['@negative'] },
    async ({ superAdminListPage: list }) => {
      await list.goto();
      expect(await list.adminPageStatus('view', unknownAdminId)).toBe(404);
      expect(await list.adminPageStatus('update', unknownAdminId)).toBe(404);
    },
  );
});

test.describe('Super Admin - sorting and paging', { tag: ['@regression'] }, () => {
  for (const column of Object.keys(adminSortableColumns) as AdminSortableColumn[]) {
    test(
      `Sorts by ${column} ascending, then descending`,
      { tag: ['@functional'] },
      async ({ superAdminListPage: list }) => {
        await list.goto();

        await list.sortBy(column);
        const ascending = (await list.readRows()).map((row) => row[column]);
        expect(ascending).toEqual([...ascending].sort(compare(column)));

        await list.sortBy(column);
        const descending = (await list.readRows()).map((row) => row[column]);
        expect(descending).toEqual([...descending].sort(compare(column)).reverse());
      },
    );
  }

  test(
    'Small pages hold every admin once, with Next and Previous',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      const query = { sort: 'id' };
      await list.open({}, { ...query, ...ALL });
      const all = await list.readRows();
      test.skip(all.length <= pagingSize, 'Too few admins for a second page.');

      await list.openPage(1, pagingSize, query);
      await expect(list.activePage).toHaveText('1');
      const seen = await list.readRows();
      while ((await list.nextPage.locator('a').count()) > 0) {
        await list.goToNextPage();
        seen.push(...(await list.readRows()));
      }
      expect(realIds(seen)).toEqual(realIds(all));

      await list.goToPreviousPage();
      const pages = Math.ceil(seen.length / pagingSize);
      await expect(list.activePage).toHaveText(String(pages - 1));
      expect(await list.summaryCounts()).toMatchObject({
        from: (pages - 2) * pagingSize + 1,
        to: (pages - 1) * pagingSize,
      });
    },
  );

  test(
    'Out-of-range and invalid page numbers do not break the list',
    { tag: ['@negative'] },
    async ({ superAdminListPage: list }) => {
      // Page 99 shows the last page. Counts are read from that same page, since the other specs
      // add and delete test admins in parallel.
      expect(await list.openPage(99, pagingSize)).toBe(200);
      const { to, total } = await list.summaryCounts();
      expect(to).toBe(total);
      await expect(list.activePage).toHaveText(String(Math.ceil(total / pagingSize)));
      for (const pageNumber of ['-1', 'abc']) {
        expect(await list.open({}, { page: pageNumber })).toBe(200);
        expect((await list.summaryCounts()).from).toBe(1);
      }
    },
  );
});

test.describe('Super Admin - filters', { tag: ['@regression'] }, () => {
  let all: AdminRow[] = [];

  test.beforeEach(async ({ superAdminListPage: list }) => {
    await list.open({}, ALL);
    all = realRows(await list.readRows());
  });

  test(
    'Each text filter finds an admin by its full value',
    { tag: ['@smoke', '@functional'] },
    async ({ superAdminListPage: list }) => {
      const [admin] = all;
      for (const filters of [
        { phone: admin.Phone },
        { name: admin['Arabic Name'] },
        { nameEn: admin['English Name'] },
        ...(admin.Email === '(not set)' ? [] : [{ email: admin.Email }]),
      ]) {
        await test.step(`Filter by ${Object.keys(filters)[0]}`, async () => {
          await list.goto();
          await list.searchBy(filters);
          expect(realIds(await list.readRows())).toContain(admin.ID);
        });
      }
    },
  );

  test(
    'Name and email filters match part of the value in any letter case',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      const admin = all.find((row) => row.Email !== '(not set)')!;
      const nameTerm = admin['English Name'].slice(1, 4);
      const emailTerm = admin.Email.split('@')[1];

      for (const value of [nameTerm.toLowerCase(), nameTerm.toUpperCase()]) {
        await list.open({ nameEn: value });
        expect(realIds(await list.readRows()), `English Name "${value}"`).toEqual(
          all.filter((row) => includes(row['English Name'], value)).map((row) => row.ID),
        );
      }
      await list.open({ email: emailTerm.toUpperCase() });
      expect(realIds(await list.readRows())).toEqual(
        all.filter((row) => includes(row.Email, emailTerm)).map((row) => row.ID),
      );
    },
  );

  test(
    'Phone filter matches the whole number only',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      const [admin] = all;
      await list.open({ phone: admin.Phone.slice(-4) });
      expect(realIds(await list.readRows())).toEqual([]);
      await list.open({ phone: admin.Phone });
      expect(realIds(await list.readRows())).toEqual([admin.ID]);
    },
  );

  for (const status of adminStatuses) {
    test(
      `Status "${status}" shows only ${status} admins`,
      { tag: ['@functional'] },
      async ({ superAdminListPage: list }) => {
        await list.goto();
        await list.searchBy({ status });

        await expect(list.selectedStatus()).toContainText(status);
        const rows = realRows(await list.readRows());
        expect(rows.map((row) => row.ID)).toEqual(
          all.filter((row) => row.Status === status).map((row) => row.ID),
        );
      },
    );
  }

  test(
    'Combined filters show only admins matching all of them',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      const [admin] = all;
      const other = adminStatuses.find((status) => status !== admin.Status)!;

      await list.open({ nameEn: admin['English Name'], status: admin.Status });
      expect(realIds(await list.readRows())).toEqual([admin.ID]);

      await list.open({ nameEn: admin['English Name'], status: other });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  test(
    'A name nobody has shows the empty state',
    { tag: ['@negative'] },
    async ({ superAdminListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: noMatchName });

      await expect(list.emptyMessage).toHaveText(text.emptyState);
      await expect(list.rows).toHaveCount(0);
      await expect(list.summary).toHaveCount(0);
    },
  );

  test(
    'An unknown status or a phone with letters shows the empty state',
    { tag: ['@negative'] },
    async ({ superAdminListPage: list }) => {
      for (const filters of [{ status: 'xyz' }, { phone: 'abc' }]) {
        expect(await list.open(filters), JSON.stringify(filters)).toBe(200);
        await expect(list.emptyMessage).toHaveText(text.emptyState);
      }
    },
  );

  test(
    'Enter in a text filter runs the search',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      const [admin] = all;
      await list.goto();
      await list.nameEnFilter.fill(admin['English Name']);
      await list.searchWithEnter(list.nameEnFilter);

      expect(realIds(await list.readRows())).toEqual([admin.ID]);
    },
  );

  test(
    'Reset clears every filter and shows all admins',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      await list.goto();
      await list.searchBy({ name: 'ا', nameEn: 'a', email: 'a', phone: '05', status: 'active' });

      await list.reset();

      for (const filter of [
        list.phoneFilter,
        list.nameFilter,
        list.nameEnFilter,
        list.emailFilter,
      ]) {
        await expect(filter).toHaveValue('');
      }
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      expect(realIds(await list.readRows())).toEqual(all.map((row) => row.ID));
    },
  );

  test(
    'Filters and results survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, superAdminListPage: list }) => {
      await list.goto();
      await list.searchBy({ status: 'active' });
      const before = await list.rowIds();

      await page.reload();

      await expect(list.selectedStatus()).toContainText('active');
      expect(await list.rowIds()).toEqual(before);
    },
  );

  for (const { name, value } of unusualFilterValues) {
    test(
      `English Name with ${name} loads without errors`,
      { tag: ['@negative'] },
      async ({ superAdminListPage: list }) => {
        const dialogs = list.countDialogs();
        expect(await list.open({ nameEn: value })).toBe(200);

        expect(realIds(await list.readRows())).toEqual(
          all.filter((row) => includes(row['English Name'], value)).map((row) => row.ID),
        );
        expect(dialogs(), 'no script ran').toBe(0);
      },
    );
  }
});

test.describe('Super Admin - export', { tag: ['@regression'] }, () => {
  test(
    'Export All offers CSV, Excel 95 + and Excel 2007+',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      await list.goto();
      await list.exportMenuToggle.click();
      await expect(list.exportFormatLinks).toHaveText([...adminExportFormats]);
    },
  );

  test(
    'CSV export holds every admin with the grid values',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      await list.open({}, ALL);
      const grid = realRows(await list.readRows());
      await list.goto();
      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

      expect(download.suggestedFilename()).toMatch(/^Admins .*\.csv$/);
      expect(header).toEqual([...adminColumns]);
      const column = (name: string) => header.indexOf(name);
      const rows = data.filter(
        (row) => !isTestAdmin({ 'English Name': row[column('English Name')] }),
      );
      expect(rows.map((row) => row[column('ID')])).toEqual(grid.map((row) => row.ID));
      for (const row of grid) {
        const exported = rows.find((r) => r[column('ID')] === row.ID)!;
        for (const name of ['Arabic Name', 'Status', 'Created At'] as const) {
          expect(exported[column(name)], `${name} of ${row.ID}`).toBe(row[name]);
        }
        expect(exported[column('English Name')].replace(/\s+/g, ' ')).toBe(row['English Name']);
        expect(exported[column('Email')] || '(not set)').toBe(row.Email);
        // The file writes the phone as 9665xxxxxxxx where the grid shows 05xxxxxxxx.
        expect(exported[column('Phone')].slice(-9)).toBe(row.Phone.slice(-9));
      }
    },
  );

  test(
    'CSV export holds only the filtered admins',
    { tag: ['@functional'] },
    async ({ superAdminListPage: list }) => {
      await list.open({ status: 'active' });
      const grid = realIds(await list.readRows());
      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

      const ids = data
        .filter((row) => !isTestAdmin({ 'English Name': row[header.indexOf('English Name')] }))
        .map((row) => row[header.indexOf('ID')]);
      expect(ids).toEqual(grid);
      for (const row of data) expect(row[header.indexOf('Status')]).toBe('active');
    },
  );
});
