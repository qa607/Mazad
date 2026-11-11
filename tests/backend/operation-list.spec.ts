import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { OperationRow } from '@pages/backend/operations/operation-list.page';
import { parseCsv } from '@utils/csv';
import {
  type OperationSortableColumn,
  allOnOnePage,
  defaultPageSize,
  isTestOperation,
  noMatchName,
  operationColumns,
  operationExportFormats,
  operationExportHeader,
  operationFilterLabels,
  operationRoles,
  operationRowActions,
  operationSortableColumns,
  operationStatuses,
  operationText as text,
  operationUrls,
  unknownOperationId,
  unusualFilterValues,
} from '@test-data/operation.data';

/**
 * Mazad Backend > Users > Operations: page, grid, sorting, paging, filters and export, signed in
 * as Dev Root. Read-only. Expected results come from the live list, and QA-AUTO test operations
 * are left out of comparisons because the CRUD and access specs add and delete them in parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const ALL = { 'per-page': String(allOnOnePage) };
const realRows = (rows: OperationRow[]) => rows.filter((row) => !isTestOperation(row));
const realIds = (rows: OperationRow[]) => realRows(rows).map((row) => row.ID);
const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());
const notSet = (value: string) => (value === '(not set)' ? '' : value);
const compare = (column: OperationSortableColumn) => (a: string, b: string) =>
  column === 'ID' ? Number(a) - Number(b) : a.localeCompare(b, 'en', { numeric: true });

test.describe('Operation - page and grid', { tag: ['@regression'] }, () => {
  test(
    'Operations in the sidebar opens the list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, operationListPage: list }) => {
      // On the Supplier List page the Users menu is already open.
      await supplierListPage.goto();
      await list.openFromSidebarLink();

      await expect(page).toHaveURL(operationUrls.list);
      await expect(page).toHaveTitle(text.listTitle);
      await expect(list.pageHeading).toHaveText(text.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(text.listTitle);
    },
  );

  test(
    'Shows the filters, buttons and grid columns',
    { tag: ['@smoke', '@ui'] },
    async ({ operationListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...operationFilterLabels]);
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      await expect(list.statusOptions).toHaveText([text.statusPlaceholder, ...operationStatuses]);
      for (const control of [
        list.createButton,
        list.searchButton,
        list.resetButton,
        list.exportColumnsToggle,
        list.exportMenuToggle,
      ]) {
        await expect(control).toBeVisible();
      }
      expect(await list.headerTexts()).toEqual([...operationColumns, 'Actions']);
      for (const column of Object.keys(operationSortableColumns) as OperationSortableColumn[]) {
        await expect(list.sortLink(column), `${column} is sortable`).toBeVisible();
      }
    },
  );

  test(
    'Lists operations newest first, numbered, 20 to a page, with a matching summary',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      await list.goto();
      const rows = await list.readRows();
      const { from, to, total } = await list.summaryCounts();

      expect(rows).toHaveLength(Math.min(defaultPageSize, total));
      expect({ from, to }).toEqual({ from: 1, to: rows.length });
      expect(rows.map((row) => row['#'])).toEqual(rows.map((_, i) => String(i + 1)));
      const created = rows.map((row) => row['Created At']);
      expect(created).toEqual([...created].sort().reverse());
    },
  );

  test(
    'Every row has valid values, a unique ID and phone, and View and Update only',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      await list.open({}, ALL);
      const rows = await list.readRows();

      for (const row of rows) {
        expect(row.ID, 'ID').toMatch(/^\d+$/);
        expect(row['Arabic Name'], `Arabic name of ${row.ID}`).not.toBe('');
        expect(row['English Name'], `English name of ${row.ID}`).not.toBe('');
        expect(operationStatuses, `status of ${row.ID}`).toContain(row.Status);
        expect(row.Phone, `phone of ${row.ID}`).toMatch(/^05\d{8}$/);
        expect(row.Email, `email of ${row.ID}`).toMatch(/^(\(not set\)|\S+@\S+)$/);
        expect(['(not set)', ...operationRoles], `job title of ${row.ID}`).toContain(
          row['Job Title'],
        );
        expect(row['Created At'], `created at of ${row.ID}`).toMatch(
          /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
        );
        expect(await list.rowActions(row.ID), `actions of ${row.ID}`).toEqual([
          ...operationRowActions,
        ]);
      }
      await expect(list.deleteLinks).toHaveCount(0);
      expect(new Set(rows.map((row) => row.ID)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.Phone)).size).toBe(rows.length);
    },
  );

  test(
    'View opens in a new tab with the values shown in the grid',
    { tag: ['@functional'] },
    async ({ operationListPage: list, pagesOn }) => {
      await list.open({}, ALL);
      const row = realRows(await list.readRows()).find((r) => r.Email !== '(not set)')!;
      const tab = await list.openInNewTab(list.actionLink(row.ID, 'view'));
      const { operationFormPage: view } = pagesOn(tab);

      await expect(tab).toHaveURL(new RegExp(`/users/operation/view\\?id=${row.ID}$`));
      await expect(view.pageHeading).toHaveText(row['English Name']);
      expect(await view.viewFields()).toMatchObject({
        'English Name': row['English Name'],
        'Arabic Name': row['Arabic Name'],
        'Operation Role': notSet(row['Job Title']),
        Status: row.Status,
        Email: notSet(row.Email),
        Phone: row.Phone,
        'Created At': row['Created At'],
      });
      await expect(view.viewUpdateButton).toBeVisible();
      await expect(view.viewDeleteButton).toHaveCount(0);
      await tab.close();
    },
  );

  test(
    'Update opens in a new tab with the form filled',
    { tag: ['@functional'] },
    async ({ operationListPage: list, pagesOn }) => {
      await list.goto();
      const [row] = realRows(await list.readRows());
      const tab = await list.openInNewTab(list.actionLink(row.ID, 'update'));
      const { operationFormPage: form } = pagesOn(tab);

      await expect(tab).toHaveTitle(`${text.updateTitlePrefix}${row['Arabic Name']}`);
      await expect(form.input('name')).toHaveValue(row['Arabic Name']);
      await expect(form.input('nameEn')).toHaveValue(row['English Name']);
      await expect(form.input('role')).toHaveValue(notSet(row['Job Title']));
      await expect(form.input('newPassword')).toBeEmpty();
      await tab.close();
    },
  );

  test(
    'View and Update of an unknown operation answer 404',
    { tag: ['@negative'] },
    async ({ operationListPage: list }) => {
      await list.goto();
      expect(await list.operationPageStatus('view', unknownOperationId)).toBe(404);
      expect(await list.operationPageStatus('update', unknownOperationId)).toBe(404);
    },
  );

  test(
    'List page runs without script errors',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      const scriptErrors = list.trackScriptErrors();
      await list.goto();
      await list.rows.first().waitFor();
      expect(scriptErrors()).toEqual([]);
    },
  );
});

test.describe('Operation - sorting and paging', { tag: ['@regression'] }, () => {
  for (const column of Object.keys(operationSortableColumns) as OperationSortableColumn[]) {
    test(
      `Sorts by ${column} ascending, then descending`,
      { tag: ['@functional'] },
      async ({ operationListPage: list }) => {
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
    'Next and Previous page through every operation once',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      const query = { sort: 'id' };
      await list.open({}, { ...query, ...ALL });
      const all = await list.readRows();
      test.skip(all.length <= defaultPageSize, 'The list fits on one page.');

      await list.open({}, query);
      await expect(list.activePage).toHaveText('1');
      const seen = await list.readRows();
      while ((await list.nextPage.locator('a').count()) > 0) {
        await list.goToNextPage();
        seen.push(...(await list.readRows()));
      }
      expect(realIds(seen)).toEqual(realIds(all));
      expect(seen.map((row) => row['#'])).toEqual(seen.map((_, i) => String(i + 1)));

      await list.goToPreviousPage();
      await expect(list.activePage).toHaveText(
        String(Math.ceil(seen.length / defaultPageSize) - 1),
      );
    },
  );

  test(
    'Out-of-range and invalid page numbers do not break the list',
    { tag: ['@negative'] },
    async ({ operationListPage: list }) => {
      // Page 99 shows the last page; counts are read from that page, since other specs add and
      // delete test operations in parallel.
      expect(await list.open({}, { page: '99' })).toBe(200);
      const { to, total } = await list.summaryCounts();
      expect(to).toBe(total);
      await expect(list.activePage).toHaveText(String(Math.ceil(total / defaultPageSize)));
      for (const pageNumber of ['-1', 'abc']) {
        expect(await list.open({}, { page: pageNumber })).toBe(200);
        expect((await list.summaryCounts()).from).toBe(1);
      }
    },
  );
});

test.describe('Operation - filters', { tag: ['@regression'] }, () => {
  let all: OperationRow[] = [];

  test.beforeEach(async ({ operationListPage: list }) => {
    await list.open({}, ALL);
    all = realRows(await list.readRows());
  });

  test(
    'Each text filter finds an operation by its full value',
    { tag: ['@smoke', '@functional'] },
    async ({ operationListPage: list }) => {
      const operation = all.find((row) => row.Email !== '(not set)')!;
      for (const filters of [
        { phone: operation.Phone },
        { name: operation['Arabic Name'] },
        { nameEn: operation['English Name'] },
        { email: operation.Email },
      ]) {
        await test.step(`Filter by ${Object.keys(filters)[0]}`, async () => {
          await list.goto();
          await list.searchBy(filters);
          expect(realIds(await list.readRows())).toContain(operation.ID);
        });
      }
    },
  );

  test(
    'Name and email filters match part of the value in any letter case',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      const operation = all.find((row) => row.Email !== '(not set)')!;
      const nameTerm = operation['English Name'].slice(1, 4);
      const emailTerm = operation.Email.split('@')[1];
      const expectIds = (column: 'English Name' | 'Email', term: string) =>
        all.filter((row) => includes(row[column], term)).map((row) => row.ID);

      for (const value of [nameTerm.toLowerCase(), nameTerm.toUpperCase()]) {
        await list.open({ nameEn: value }, ALL);
        expect(realIds(await list.readRows()), `English Name "${value}"`).toEqual(
          expectIds('English Name', value),
        );
      }
      await list.open({ email: emailTerm.toUpperCase() }, ALL);
      expect(realIds(await list.readRows())).toEqual(expectIds('Email', emailTerm));
    },
  );

  test(
    'Phone filter matches the whole number only',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      const [operation] = all;
      await list.open({ phone: operation.Phone.slice(-4) });
      expect(realIds(await list.readRows())).toEqual([]);
      await list.open({ phone: operation.Phone });
      expect(realIds(await list.readRows())).toEqual([operation.ID]);
    },
  );

  for (const status of operationStatuses) {
    test(
      `Status "${status}" shows only ${status} operations`,
      { tag: ['@functional'] },
      async ({ operationListPage: list }) => {
        await list.goto();
        await list.searchBy({ status });

        await expect(list.selectedStatus()).toContainText(status);
        await list.open({ status }, ALL);
        expect(realIds(await list.readRows())).toEqual(
          all.filter((row) => row.Status === status).map((row) => row.ID),
        );
      },
    );
  }

  test(
    'Combined filters show only operations matching all of them',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      const [operation] = all;
      const other = operationStatuses.find((status) => status !== operation.Status)!;

      await list.open({ nameEn: operation['English Name'], status: operation.Status });
      expect(realIds(await list.readRows())).toEqual([operation.ID]);

      await list.open({ nameEn: operation['English Name'], status: other });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  test(
    'A name nobody has shows the empty state',
    { tag: ['@negative'] },
    async ({ operationListPage: list }) => {
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
    async ({ operationListPage: list }) => {
      for (const filters of [{ status: 'xyz' }, { phone: 'abc' }]) {
        expect(await list.open(filters), JSON.stringify(filters)).toBe(200);
        await expect(list.emptyMessage).toHaveText(text.emptyState);
      }
    },
  );

  test(
    'Enter in a text filter runs the search',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      const [operation] = all;
      await list.goto();
      await list.phoneFilter.fill(operation.Phone);
      await list.searchWithEnter(list.phoneFilter);

      expect(realIds(await list.readRows())).toEqual([operation.ID]);
    },
  );

  test(
    'Reset clears every filter and shows all operations',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      await list.goto();
      await list.searchBy({ name: 'ا', nameEn: 'a', email: 'a', phone: '05', status: 'active' });

      await list.reset();

      for (const filter of [
        list.nameFilter,
        list.nameEnFilter,
        list.phoneFilter,
        list.emailFilter,
      ]) {
        await expect(filter).toHaveValue('');
      }
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      expect(await list.totalCount()).toBeGreaterThanOrEqual(all.length);
    },
  );

  test(
    'Filters and results survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, operationListPage: list }) => {
      await list.goto();
      await list.searchBy({ status: 'inactive' });
      const before = await list.rowIds();

      await page.reload();

      await expect(list.selectedStatus()).toContainText('inactive');
      expect(await list.rowIds()).toEqual(before);
    },
  );

  for (const { name, value } of unusualFilterValues) {
    test(
      `English Name with ${name} loads without errors`,
      { tag: ['@negative'] },
      async ({ operationListPage: list }) => {
        const dialogs = list.countDialogs();
        expect(await list.open({ nameEn: value }, ALL)).toBe(200);

        expect(realIds(await list.readRows())).toEqual(
          all.filter((row) => includes(row['English Name'], value)).map((row) => row.ID),
        );
        expect(dialogs(), 'no script ran').toBe(0);
      },
    );
  }
});

test.describe('Operation - export', { tag: ['@regression'] }, () => {
  test(
    'Export All offers CSV, Excel 95 + and Excel 2007+, and lists the export columns',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      await list.goto();
      await list.exportColumnsToggle.click();
      await expect(list.exportColumnLabels).toHaveText([
        'Select Columns',
        ...operationExportHeader,
      ]);
      await list.exportColumnsToggle.click();
      await list.exportMenuToggle.click();
      await expect(list.exportFormatLinks).toHaveText([...operationExportFormats]);
    },
  );

  test(
    'CSV export holds every operation with the grid values',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      await list.open({}, ALL);
      const grid = realRows(await list.readRows());
      await list.goto();
      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

      expect(download.suggestedFilename()).toMatch(/^Operations .*\.csv$/);
      expect(header).toEqual([...operationExportHeader]);
      const column = (name: string) => header.indexOf(name);
      const rows = data.filter(
        (row) => !isTestOperation({ 'English Name': row[column('English Name')] }),
      );
      expect(rows.map((row) => row[column('ID')])).toEqual(grid.map((row) => row.ID));
      for (const row of grid) {
        const exported = rows.find((r) => r[column('ID')] === row.ID)!;
        for (const name of ['Arabic Name', 'Status', 'Created At'] as const) {
          expect(exported[column(name)].replace(/\s+/g, ' ').trim(), `${name} of ${row.ID}`).toBe(
            row[name],
          );
        }
        expect(exported[column('English Name')].replace(/\s+/g, ' ').trim()).toBe(
          row['English Name'],
        );
        expect(exported[column('Email')]).toBe(notSet(row.Email));
        expect(exported[column('Job Title')]).toBe(notSet(row['Job Title']));
        // The file writes the phone as 9665xxxxxxxx where the grid shows 05xxxxxxxx.
        expect(exported[column('Phone')].slice(-9)).toBe(row.Phone.slice(-9));
      }
    },
  );

  test(
    'CSV export holds only the filtered operations',
    { tag: ['@functional'] },
    async ({ operationListPage: list }) => {
      await list.open({ status: 'inactive' }, ALL);
      const grid = realIds(await list.readRows());
      await list.open({ status: 'inactive' });
      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

      const ids = data
        .filter((row) => !isTestOperation({ 'English Name': row[header.indexOf('English Name')] }))
        .map((row) => row[header.indexOf('ID')]);
      expect(ids).toEqual(grid);
      for (const row of data) expect(row[header.indexOf('Status')]).toBe('inactive');
    },
  );
});
