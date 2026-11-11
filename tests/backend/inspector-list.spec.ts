import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { InspectorRow } from '@pages/backend/inspector/inspector-list.page';
import { parseCsv } from '@utils/csv';
import {
  type InspectorSortableColumn,
  allOnOnePage,
  defaultPageSize,
  inspectorColumns,
  inspectorExportFormats,
  inspectorExportHeader,
  inspectorFilterLabels,
  inspectorRowActions,
  inspectorSortableColumns,
  inspectorStatuses,
  inspectorText as text,
  inspectorUrls,
  inspectorViewLabels,
  missingInspectorPages,
  noMatchName,
  unknownInspectorId,
  unusualFilterValues,
} from '@test-data/inspector.data';

/**
 * Mazad Backend > Users > Inspectors, signed in as Dev Root: page, grid, pagination, the View page
 * (Read), the missing Create, Update and Delete, sorting, filters and export. The page is
 * read-only, so no inspector is changed. Expected results come from the live list, so the checks
 * hold whatever inspectors staging has.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());
const notSet = (value: string) => (value === '(not set)' ? '' : value);
/**
 * Collapses runs of spaces, as the grid displays them: a stored name may hold a double space
 * (inspector 34781 on staging), which the View fields and the export keep.
 */
const squash = (value: string) => value.replace(/\s+/g, ' ').trim();
const compare = (column: InspectorSortableColumn) => (a: string, b: string) =>
  column === 'ID' ? Number(a) - Number(b) : a.localeCompare(b, 'en', { numeric: true });

test.describe('Inspectors - page and grid', { tag: ['@regression'] }, () => {
  test(
    'Inspectors in the sidebar opens the list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, inspectorListPage: list }) => {
      // On the Supplier List page the Users menu is already open.
      await supplierListPage.goto();
      await list.openFromSidebarLink();

      await expect(page).toHaveURL(inspectorUrls.list);
      await expect(page).toHaveTitle(text.listTitle);
      await expect(list.pageHeading).toHaveText(text.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(text.listTitle);
    },
  );

  test(
    'Shows the filters, buttons and grid columns',
    { tag: ['@smoke', '@ui'] },
    async ({ inspectorListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...inspectorFilterLabels]);
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      await expect(list.statusOptions).toHaveText([text.statusPlaceholder, ...inspectorStatuses]);
      for (const control of [
        list.searchButton,
        list.resetButton,
        list.exportColumnsToggle,
        list.exportMenuToggle,
      ]) {
        await expect(control).toBeVisible();
      }
      expect(await list.headerTexts()).toEqual([...inspectorColumns, 'Actions']);
      for (const column of Object.keys(inspectorSortableColumns) as InspectorSortableColumn[]) {
        await expect(list.sortLink(column), `${column} is sortable`).toBeVisible();
      }
    },
  );

  test(
    'Lists inspectors newest first, numbered, with a matching summary',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.open({}, allOnOnePage);
      const rows = await list.readRows();
      const { from, to, total } = await list.summaryCounts();

      expect(rows.length).toBeGreaterThan(0);
      expect({ from, to, total }).toEqual({ from: 1, to: rows.length, total: rows.length });
      expect(rows.map((row) => row['#'])).toEqual(rows.map((_, i) => String(i + 1)));
      const created = rows.map((row) => row['Created At']);
      expect(created).toEqual([...created].sort().reverse());
    },
  );

  test(
    'Every row has valid values, a unique ID and phone, and a View action only',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.open({}, allOnOnePage);
      const rows = await list.readRows();

      for (const row of rows) {
        expect(row.ID, 'ID').toMatch(/^\d+$/);
        expect(row['Arabic Name'], `Arabic name of ${row.ID}`).not.toBe('');
        expect(row['English Name'], `English name of ${row.ID}`).not.toBe('');
        expect(inspectorStatuses, `status of ${row.ID}`).toContain(row.Status);
        expect(row.Phone, `phone of ${row.ID}`).toMatch(/^05\d{8}$/);
        expect(row.Email, `email of ${row.ID}`).toMatch(/^(\(not set\)|\S+@\S+)$/);
        expect(row['Created At'], `created at of ${row.ID}`).toMatch(
          /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
        );
        expect(await list.rowActions(row.ID), `actions of ${row.ID}`).toEqual([
          ...inspectorRowActions,
        ]);
      }
      expect(new Set(rows.map((row) => row.ID)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.Phone)).size).toBe(rows.length);
    },
  );

  test(
    'List page runs without script errors',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      const scriptErrors = list.trackScriptErrors();
      await list.goto();
      await list.rows.first().waitFor();
      expect(scriptErrors()).toEqual([]);
    },
  );
});

test.describe('Inspectors - pagination', { tag: ['@regression'] }, () => {
  test(
    'Shows 20 inspectors per page; the pager moves to the next page and back',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.open({}, allOnOnePage);
      const all = await list.readRows();
      test.skip(all.length <= defaultPageSize, 'Every inspector fits on one page.');

      await list.goto();
      expect(await list.rowIds()).toEqual(all.slice(0, defaultPageSize).map((row) => row.ID));
      expect(await list.summaryCounts()).toEqual({
        from: 1,
        to: defaultPageSize,
        total: all.length,
      });
      await expect(list.activePage).toHaveText('1');

      await list.goToNextPage();
      const secondPage = all.slice(defaultPageSize, defaultPageSize * 2);
      await expect(list.activePage).toHaveText('2');
      expect(await list.rowIds()).toEqual(secondPage.map((row) => row.ID));
      expect(await list.columnValues('#')).toEqual(
        secondPage.map((_, i) => String(defaultPageSize + i + 1)),
      );
      expect(await list.summaryCounts()).toEqual({
        from: defaultPageSize + 1,
        to: defaultPageSize + secondPage.length,
        total: all.length,
      });

      await list.goToPreviousPage();
      await expect(list.activePage).toHaveText('1');
      expect(await list.rowIds()).toEqual(all.slice(0, defaultPageSize).map((row) => row.ID));
    },
  );
});

test.describe('Inspectors - Read (View)', { tag: ['@regression'] }, () => {
  test(
    'View shows each inspector read-only, with the values from the grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, inspectorListPage: list, pagesOn }) => {
      test.setTimeout(180_000);
      await list.open({}, allOnOnePage);
      const rows = await list.readRows();

      for (const row of rows) {
        await test.step(`View of ${row.ID}`, async () => {
          const tab = await list.openView(row.ID);
          const { inspectorViewPage: view } = pagesOn(tab);

          await expect(tab).toHaveURL(inspectorUrls.view(row.ID));
          await expect(tab).toHaveTitle(row['English Name']);
          await expect(view.pageHeading).toHaveText(row['English Name']);
          await expect(view.breadcrumbLinks.last()).toHaveText(text.viewBreadcrumbParent);
          await expect(view.breadcrumbCurrent).toHaveText(row['English Name']);
          await expect(view.sectionTitle).toHaveText(text.viewSection);
          await expect(view.labels).toHaveText([...inspectorViewLabels]);
          const fields = Object.fromEntries(
            Object.entries(await view.fields()).map(([label, value]) => [label, squash(value)]),
          );
          expect(fields).toMatchObject({
            'English Name': row['English Name'],
            'Arabic Name': row['Arabic Name'],
            Status: row.Status,
            Email: notSet(row.Email),
            Phone: row.Phone,
            'Created At': row['Created At'],
          });
          expect(await view.allFieldsDisabled(), 'every field is read-only').toBe(true);
          if (tab !== page) await tab.close();
        });
      }
    },
  );

  test(
    'View shows the same values after a page refresh',
    { tag: ['@functional'] },
    async ({ page, inspectorListPage: list, inspectorViewPage: view }) => {
      await list.goto();
      const [id] = await list.rowIds();
      await view.goto(id);
      const before = await view.fields();

      await page.reload();

      expect(await view.fields()).toEqual(before);
    },
  );

  test(
    'The breadcrumb on View leads back to the list',
    { tag: ['@functional'] },
    async ({ page, inspectorListPage: list, inspectorViewPage: view }) => {
      await list.goto();
      const [id] = await list.rowIds();
      await view.goto(id);

      await view.breadcrumbLinks.last().click();
      await expect(page).toHaveURL(inspectorUrls.list);
    },
  );

  test(
    'View of an unknown inspector answers 404',
    { tag: ['@negative'] },
    async ({ page, inspectorViewPage: view }) => {
      expect(await view.goto(unknownInspectorId)).toBe(404);
      await expect(page).toHaveTitle(text.notFound);
    },
  );
});

test.describe('Inspectors - Create, Update and Delete', { tag: ['@regression'] }, () => {
  test(
    'Create is not offered: no Create button on the list',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.goto();
      await expect(list.rows.first()).toBeVisible();
      await expect(list.createButton).toHaveCount(0);
    },
  );

  test(
    'Update and Delete are not offered: no row action and no View page control',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list, inspectorViewPage: view }) => {
      await list.open({}, allOnOnePage);
      await expect(list.rows.first()).toBeVisible();
      await expect(list.editLinks).toHaveCount(0);

      const [id] = await list.rowIds();
      await view.goto(id);
      await expect(view.labels.first()).toBeVisible();
      await expect(view.editControls).toHaveCount(0);
    },
  );

  test(
    'The Create and Update pages do not exist, even for a real inspector',
    { tag: ['@negative'] },
    async ({ inspectorListPage: list }) => {
      await list.goto();
      const [id] = await list.rowIds();
      for (const { name, path } of missingInspectorPages(id)) {
        expect(await list.routeStatus(path), `${name} page`).toBe(404);
      }
    },
  );
});

test.describe('Inspectors - sorting', { tag: ['@regression'] }, () => {
  for (const column of Object.keys(inspectorSortableColumns) as InspectorSortableColumn[]) {
    test(
      `Sorts by ${column} ascending, then descending`,
      { tag: ['@functional'] },
      async ({ inspectorListPage: list }) => {
        await list.open({}, allOnOnePage);
        const all = await list.columnValues(column);

        await list.sortBy(column);
        const ascending = await list.columnValues(column);
        expect(ascending).toEqual([...all].sort(compare(column)));

        await list.sortBy(column);
        const descending = await list.columnValues(column);
        expect(descending).toEqual([...all].sort(compare(column)).reverse());
      },
    );
  }
});

test.describe('Inspectors - filters', { tag: ['@regression'] }, () => {
  let all: InspectorRow[] = [];

  test.beforeEach(async ({ inspectorListPage: list }) => {
    await list.open({}, allOnOnePage);
    all = await list.readRows();
  });

  test(
    'Each text filter finds every inspector by its full stored value',
    { tag: ['@smoke', '@functional'] },
    async ({ inspectorListPage: list }) => {
      test.setTimeout(240_000);
      // Names as stored, with any double space kept (the filter matches the stored text).
      const arabicNames = await list.rawColumnValues('Arabic Name');
      const englishNames = await list.rawColumnValues('English Name');
      for (const [i, row] of all.entries()) {
        for (const filters of [
          { phone: row.Phone },
          { name: arabicNames[i] },
          { nameEn: englishNames[i] },
          ...(row.Email === '(not set)' ? [] : [{ email: row.Email }]),
        ]) {
          await test.step(`${row.ID} by ${Object.keys(filters)[0]}`, async () => {
            await list.open(filters, allOnOnePage);
            expect(await list.rowIds()).toContain(row.ID);
          });
        }
      }
    },
  );

  test(
    'Search button and Enter run the search from the form',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      const [row] = all;
      await list.goto();
      await list.searchBy({ phone: row.Phone });
      await expect(list.phoneFilter).toHaveValue(row.Phone);
      expect(await list.rowIds()).toEqual([row.ID]);

      await list.goto();
      await list.nameEnFilter.fill(row['English Name']);
      await list.searchWithEnter(list.nameEnFilter);
      await expect(list.nameEnFilter).toHaveValue(row['English Name']);
      expect(await list.rowIds()).toContain(row.ID);
    },
  );

  test(
    'English Name matches part of the name in any letter case',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      const row = all.find((r) => /[A-Za-z]{4}/.test(r['English Name']))!;
      const term = row['English Name'].match(/[A-Za-z]{4}/)![0];
      const expected = all.filter((r) => includes(r['English Name'], term)).map((r) => r.ID);
      for (const value of [term.toLowerCase(), term.toUpperCase()]) {
        await list.open({ nameEn: value }, allOnOnePage);
        expect((await list.rowIds()).sort(), value).toEqual([...expected].sort());
      }
    },
  );

  test(
    'Arabic Name matches part of the name',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      const row = all.find((r) => /[\u0600-\u06FF]{3}/.test(r['Arabic Name']))!;
      const term = row['Arabic Name'].match(/[\u0600-\u06FF]{3}/)![0];
      const expected = all.filter((r) => r['Arabic Name'].includes(term)).map((r) => r.ID);

      await list.open({ name: term }, allOnOnePage);
      expect((await list.rowIds()).sort()).toEqual([...expected].sort());
    },
  );

  test(
    'Phone filter matches the whole number only',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      for (const part of [all[0].Phone.slice(0, 7), all[0].Phone.slice(1)]) {
        await list.open({ phone: part });
        await expect(list.emptyMessage, part).toHaveText(text.emptyState);
      }
    },
  );

  for (const status of inspectorStatuses) {
    test(
      `Status "${status}" shows only ${status} inspectors`,
      { tag: ['@functional'] },
      async ({ inspectorListPage: list }) => {
        const expected = all.filter((row) => row.Status === status).map((row) => row.ID);
        test.skip(expected.length === 0, `No ${status} inspector on this environment.`);
        await list.goto();
        await list.searchBy({ status });

        await expect(list.selectedStatus()).toContainText(status);
        expect((await list.summaryCounts()).total).toBe(expected.length);
        await list.open({ status }, allOnOnePage);
        expect((await list.rowIds()).sort()).toEqual(expected.sort());
      },
    );
  }

  test(
    'Two filters that do not match the same inspector show the empty state',
    { tag: ['@negative'] },
    async ({ inspectorListPage: list }) => {
      const [row] = all;
      const otherStatus = inspectorStatuses.find((status) => status !== row.Status)!;
      await list.open({ phone: row.Phone, status: otherStatus });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  test(
    'A name or email nobody has shows the empty state',
    { tag: ['@negative'] },
    async ({ inspectorListPage: list }) => {
      for (const filters of [{ nameEn: noMatchName }, { name: noMatchName }, { email: 'x' }]) {
        await list.open(filters);
        await expect(list.emptyMessage).toHaveText(text.emptyState);
        await expect(list.rows).toHaveCount(0);
        await expect(list.summary).toHaveCount(0);
      }
    },
  );

  test(
    'Reset clears the filters and shows every inspector',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.open({ nameEn: noMatchName, status: 'active' });

      await list.reset();

      await expect(list.nameEnFilter).toHaveValue('');
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      expect((await list.summaryCounts()).total).toBe(all.length);
    },
  );

  test(
    'Filters and results survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, inspectorListPage: list }) => {
      const [row] = all;
      await list.open({ phone: row.Phone });

      await page.reload();

      await expect(list.phoneFilter).toHaveValue(row.Phone);
      expect(await list.rowIds()).toEqual([row.ID]);
    },
  );

  for (const { name, value } of unusualFilterValues) {
    test(
      `English Name with ${name} loads without errors`,
      { tag: ['@negative'] },
      async ({ inspectorListPage: list }) => {
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

test.describe('Inspectors - export', { tag: ['@regression'] }, () => {
  test(
    'Export All offers CSV, Excel 95 + and Excel 2007+, and lists the export columns',
    { tag: ['@ui'] },
    async ({ inspectorListPage: list }) => {
      await list.goto();
      await list.exportColumnsToggle.click();
      await expect(list.exportColumnLabels).toHaveText([
        'Select Columns',
        ...inspectorExportHeader,
      ]);
      await list.exportColumnsToggle.click();
      await list.exportMenuToggle.click();
      await expect(list.exportFormatLinks).toHaveText([...inspectorExportFormats]);
    },
  );

  test(
    'Cancel on the export confirmation downloads nothing',
    { tag: ['@functional'] },
    async ({ page, inspectorListPage: list }) => {
      await list.goto();
      let downloads = 0;
      page.on('download', () => (downloads += 1));

      await list.startExport('CSV');
      await expect(list.confirmDialog.message).toContainText(text.exportConfirmation);
      await list.confirmDialog.cancel();
      await expect(list.confirmDialog.dialog).toBeHidden();
      expect(downloads).toBe(0);
    },
  );

  test(
    'CSV export holds every inspector (all pages) with the grid values',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.open({}, allOnOnePage);
      const rows = await list.readRows();
      // Export from the default list, which shows one page only.
      await list.goto();

      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));
      const column = (name: string) => header.indexOf(name);

      expect(download.suggestedFilename()).toMatch(/^Inspector .*\.csv$/);
      expect(header).toEqual([...inspectorExportHeader]);
      expect(data.map((r) => r[column('ID')]).sort()).toEqual(rows.map((r) => r.ID).sort());
      for (const row of rows) {
        const exported = data.find((r) => r[column('ID')] === row.ID)!;
        for (const name of ['Arabic Name', 'English Name', 'Status', 'Created At'] as const) {
          expect(squash(exported[column(name)]), `${name} of ${row.ID}`).toBe(row[name]);
        }
        expect(exported[column('Email')]).toBe(notSet(row.Email));
        // The export writes phones in international form (9665...), ignored like on other pages.
        expect(exported[column('Phone')].slice(-9)).toBe(row.Phone.slice(-9));
      }
    },
  );

  test(
    'CSV export holds only the filtered inspectors',
    { tag: ['@functional'] },
    async ({ inspectorListPage: list }) => {
      await list.goto();
      const [row] = await list.readRows();
      await list.open({ status: row.Status });
      const expected = (await list.summaryCounts()).total;

      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));
      expect(data).toHaveLength(expected);
      expect(data.every((r) => r[header.indexOf('Status')] === row.Status)).toBe(true);
    },
  );
});
