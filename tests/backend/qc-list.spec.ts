import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { QcRow } from '@pages/backend/qc/qc-list.page';
import { parseCsv } from '@utils/csv';
import {
  type QcSortableColumn,
  noMatchName,
  qcColumns,
  qcExportFormats,
  qcExportHeader,
  qcFilterLabels,
  qcRowActions,
  qcSortableColumns,
  qcStatuses,
  qcText as text,
  qcUrls,
  qcViewLabels,
  unknownQcId,
  unusualFilterValues,
} from '@test-data/qc.data';

/**
 * Mazad Backend > Users > QC: page, grid, sorting, filters, export and the View page, signed in
 * as Dev Root. Read-only (the page offers no create, update or delete). Expected results come
 * from the live list, so the checks hold whatever QC accounts staging has.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());
const notSet = (value: string) => (value === '(not set)' ? '' : value);
const compare = (column: QcSortableColumn) => (a: string, b: string) =>
  column === 'ID' ? Number(a) - Number(b) : a.localeCompare(b, 'en', { numeric: true });

test.describe('QC - page and grid', { tag: ['@regression'] }, () => {
  test(
    'QC in the sidebar opens the list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, qcListPage: list }) => {
      // On the Supplier List page the Users menu is already open.
      await supplierListPage.goto();
      await list.openFromSidebarLink();

      await expect(page).toHaveURL(qcUrls.list);
      await expect(page).toHaveTitle(text.listTitle);
      await expect(list.pageHeading).toHaveText(text.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(text.listTitle);
    },
  );

  test(
    'Shows the filters, buttons and grid columns, with no Create',
    { tag: ['@smoke', '@ui'] },
    async ({ qcListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...qcFilterLabels]);
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      await expect(list.statusOptions).toHaveText([text.statusPlaceholder, ...qcStatuses]);
      for (const control of [
        list.searchButton,
        list.resetButton,
        list.exportColumnsToggle,
        list.exportMenuToggle,
      ]) {
        await expect(control).toBeVisible();
      }
      await expect(list.createButton).toHaveCount(0);
      expect(await list.headerTexts()).toEqual([...qcColumns, 'Actions']);
      for (const column of Object.keys(qcSortableColumns) as QcSortableColumn[]) {
        await expect(list.sortLink(column), `${column} is sortable`).toBeVisible();
      }
    },
  );

  test(
    'Lists QC accounts newest first, numbered, with a matching summary',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      await list.goto();
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
    async ({ qcListPage: list }) => {
      await list.goto();
      const rows = await list.readRows();

      for (const row of rows) {
        expect(row.ID, 'ID').toMatch(/^\d+$/);
        expect(row['Arabic Name'], `Arabic name of ${row.ID}`).not.toBe('');
        expect(row['English Name'], `English name of ${row.ID}`).not.toBe('');
        expect(qcStatuses, `status of ${row.ID}`).toContain(row.Status);
        expect(row.Phone, `phone of ${row.ID}`).toMatch(/^05\d{8}$/);
        expect(row.Email, `email of ${row.ID}`).toMatch(/^(\(not set\)|\S+@\S+)$/);
        expect(row['Created At'], `created at of ${row.ID}`).toMatch(
          /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
        );
        expect(await list.rowActions(row.ID), `actions of ${row.ID}`).toEqual([...qcRowActions]);
      }
      await expect(list.editLinks).toHaveCount(0);
      expect(new Set(rows.map((row) => row.ID)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.Phone)).size).toBe(rows.length);
    },
  );

  test(
    'List page runs without script errors',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      const scriptErrors = list.trackScriptErrors();
      await list.goto();
      await list.rows.first().waitFor();
      expect(scriptErrors()).toEqual([]);
    },
  );
});

test.describe('QC - View', { tag: ['@regression'] }, () => {
  test(
    'View shows each QC account read-only, with the values from the grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, qcListPage: list, pagesOn }) => {
      await list.goto();
      const rows = await list.readRows();

      for (const row of rows) {
        await test.step(`View of ${row.ID}`, async () => {
          const tab = await list.openView(row.ID);
          const { qcViewPage: view } = pagesOn(tab);

          await expect(tab).toHaveURL(qcUrls.view(row.ID));
          await expect(tab).toHaveTitle(row['English Name']);
          await expect(view.pageHeading).toHaveText(row['English Name']);
          await expect(view.breadcrumbLinks.last()).toHaveText(text.viewBreadcrumbParent);
          await expect(view.breadcrumbCurrent).toHaveText(row['English Name']);
          await expect(view.sectionTitle).toHaveText(text.viewSection);
          await expect(view.labels).toHaveText([...qcViewLabels]);
          expect(await view.fields()).toMatchObject({
            'English Name': row['English Name'],
            'Arabic Name': row['Arabic Name'],
            Status: row.Status,
            Email: notSet(row.Email),
            Phone: row.Phone,
            'Created At': row['Created At'],
          });
          expect(await view.allFieldsDisabled(), 'every field is read-only').toBe(true);
          await expect(view.editControls).toHaveCount(0);
          if (tab !== page) await tab.close();
        });
      }
    },
  );

  test(
    'The breadcrumb on View leads back to the list',
    { tag: ['@functional'] },
    async ({ page, qcListPage: list, qcViewPage: view }) => {
      await list.goto();
      const [id] = await list.rowIds();
      await view.goto(id);

      await view.breadcrumbLinks.last().click();
      await expect(page).toHaveURL(qcUrls.list);
    },
  );

  test(
    'View of an unknown QC account answers 404',
    { tag: ['@negative'] },
    async ({ page, qcViewPage: view }) => {
      expect(await view.goto(unknownQcId)).toBe(404);
      await expect(page).toHaveTitle(text.notFound);
    },
  );
});

test.describe('QC - sorting', { tag: ['@regression'] }, () => {
  for (const column of Object.keys(qcSortableColumns) as QcSortableColumn[]) {
    test(
      `Sorts by ${column} ascending, then descending`,
      { tag: ['@functional'] },
      async ({ qcListPage: list }) => {
        await list.goto();

        await list.sortBy(column);
        const ascending = await list.columnValues(column);
        expect(ascending).toEqual([...ascending].sort(compare(column)));

        await list.sortBy(column);
        const descending = await list.columnValues(column);
        expect(descending).toEqual([...descending].sort(compare(column)).reverse());
      },
    );
  }
});

test.describe('QC - filters', { tag: ['@regression'] }, () => {
  let all: QcRow[] = [];

  test.beforeEach(async ({ qcListPage: list }) => {
    await list.goto();
    all = await list.readRows();
  });

  test(
    'Each text filter finds a QC account by its full value',
    { tag: ['@smoke', '@functional'] },
    async ({ qcListPage: list }) => {
      for (const row of all) {
        for (const filters of [
          { phone: row.Phone },
          { name: row['Arabic Name'] },
          { nameEn: row['English Name'] },
          ...(row.Email === '(not set)' ? [] : [{ email: row.Email }]),
        ]) {
          await test.step(`${row.ID} by ${Object.keys(filters)[0]}`, async () => {
            await list.open(filters);
            expect(await list.rowIds()).toContain(row.ID);
          });
        }
      }
    },
  );

  test(
    'Search button and Enter run the search from the form',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      const [row] = all;
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
    async ({ qcListPage: list }) => {
      const row = all.find((r) => /[A-Za-z]{4}/.test(r['English Name']))!;
      const term = row['English Name'].slice(0, 4);
      for (const value of [term.toLowerCase(), term.toUpperCase()]) {
        await list.open({ nameEn: value });
        const names = await list.columnValues('English Name');
        expect(names.length, value).toBeGreaterThan(0);
        for (const name of names) {
          expect(includes(name, value), `"${name}" contains "${value}"`).toBe(true);
        }
      }
    },
  );

  test(
    'Phone filter matches the whole number only',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      await list.open({ phone: all[0].Phone.slice(0, 7) });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  for (const status of qcStatuses) {
    test(
      `Status "${status}" shows only ${status} QC accounts`,
      { tag: ['@functional'] },
      async ({ qcListPage: list }) => {
        await list.searchBy({ status });

        await expect(list.selectedStatus()).toContainText(status);
        const expected = all.filter((row) => row.Status === status).map((row) => row.ID);
        expect((await list.rowIds()).sort()).toEqual(expected.sort());
        if (expected.length === 0) await expect(list.emptyMessage).toHaveText(text.emptyState);
      },
    );
  }

  test(
    'Two filters that do not match the same account show the empty state',
    { tag: ['@negative'] },
    async ({ qcListPage: list }) => {
      const [row] = all;
      const otherStatus = qcStatuses.find((status) => status !== row.Status)!;
      await list.open({ phone: row.Phone, status: otherStatus });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  test(
    'A name nobody has shows the empty state',
    { tag: ['@negative'] },
    async ({ qcListPage: list }) => {
      await list.open({ nameEn: noMatchName });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
      await expect(list.rows).toHaveCount(0);
      await expect(list.summary).toHaveCount(0);
    },
  );

  test(
    'Reset clears the filters and shows every QC account',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      await list.open({ nameEn: noMatchName, status: 'active' });

      await list.reset();

      await expect(list.nameEnFilter).toHaveValue('');
      await expect(list.selectedStatus()).toHaveText(text.statusPlaceholder);
      expect((await list.rowIds()).sort()).toEqual(all.map((row) => row.ID).sort());
    },
  );

  test(
    'Filters and results survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, qcListPage: list }) => {
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
      async ({ qcListPage: list }) => {
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

test.describe('QC - export', { tag: ['@regression'] }, () => {
  test(
    'Export All offers CSV, Excel 95 + and Excel 2007+, and lists the export columns',
    { tag: ['@ui'] },
    async ({ qcListPage: list }) => {
      await list.goto();
      await list.exportColumnsToggle.click();
      await expect(list.exportColumnLabels).toHaveText(['Select Columns', ...qcExportHeader]);
      await list.exportColumnsToggle.click();
      await list.exportMenuToggle.click();
      await expect(list.exportFormatLinks).toHaveText([...qcExportFormats]);
    },
  );

  test(
    'Cancel on the export confirmation downloads nothing',
    { tag: ['@functional'] },
    async ({ page, qcListPage: list }) => {
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
    'CSV export holds every QC account with the grid values',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      await list.goto();
      const rows = await list.readRows();

      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));
      const column = (name: string) => header.indexOf(name);

      expect(download.suggestedFilename()).toMatch(/^QC .*\.csv$/);
      expect(header).toEqual([...qcExportHeader]);
      expect(data.map((r) => r[column('ID')]).sort()).toEqual(rows.map((r) => r.ID).sort());
      for (const row of rows) {
        const exported = data.find((r) => r[column('ID')] === row.ID)!;
        for (const name of ['Arabic Name', 'English Name', 'Status', 'Created At'] as const) {
          expect(exported[column(name)].trim(), `${name} of ${row.ID}`).toBe(row[name]);
        }
        expect(exported[column('Email')]).toBe(notSet(row.Email));
        // The export writes phones in international form (9665...), ignored like on other pages.
        expect(exported[column('Phone')].slice(-9)).toBe(row.Phone.slice(-9));
      }
    },
  );

  test(
    'CSV export holds only the filtered QC accounts',
    { tag: ['@functional'] },
    async ({ qcListPage: list }) => {
      await list.goto();
      const [row] = await list.readRows();
      await list.open({ phone: row.Phone });

      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));
      expect(data.map((r) => r[header.indexOf('ID')])).toEqual([row.ID]);
    },
  );
});
