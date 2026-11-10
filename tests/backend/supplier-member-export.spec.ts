import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { MemberFilters, MemberRow } from '@pages/backend/suppliers/supplier-member-list.page';
import {
  allOnOnePage,
  isTestMember,
  memberColumns,
  memberExportFormats,
  noMatchName,
  pagingSize,
} from '@test-data/backend-supplier-member.data';
import { parseCsv } from '@utils/csv';

/**
 * Mazad Backend > Supplier Members: Export All (CSV, Excel 95 +, Excel 2007+) and the export
 * column picker. Read-only: exports only download files. QA-AUTO test members are left out of
 * comparisons because supplier-member-crud.spec.ts adds and deletes one in parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const ALL = { 'per-page': String(allOnOnePage) };

/** Data rows of a parsed file, leaving out QA-AUTO test members. */
function realFileRows(file: string[][]): string[][] {
  const [header, ...data] = file;
  const nameEn = header.indexOf('English Name');
  return data.filter((row) => !isTestMember({ 'English Name': row[nameEn] ?? '' }));
}

/**
 * Compares exported rows with grid rows by ID, leaving QA-AUTO test members out on both sides.
 * Phone is compared by its last nine digits: the file writes 9665xxxxxxxx where the grid shows
 * 05xxxxxxxx (accepted, 2026-11-09).
 */
function expectFileMatchesGrid(file: string[][], gridRows: MemberRow[]): void {
  const header = file[0];
  const data = realFileRows(file);
  const grid = gridRows.filter((row) => !isTestMember(row));
  const byId = new Map(data.map((row) => [row[header.indexOf('ID')], row]));
  expect(byId.size, 'no duplicate rows').toBe(data.length);
  expect([...byId.keys()].sort(), 'same members as the grid').toEqual(
    grid.map((row) => row.ID).sort(),
  );
  for (const row of grid) {
    const exported = byId.get(row.ID)!;
    for (const column of memberColumns.filter((c) => c !== '#')) {
      const value = exported[header.indexOf(column)]?.trim() ?? '';
      if (column === 'Phone') {
        expect(value.slice(-9), `${row.ID} Phone`).toBe(row.Phone.slice(-9));
      } else if (row[column] === '(not set)') {
        expect(value, `${row.ID} ${column}`).toBe('');
      } else {
        expect(value.replace(/\s+/g, ' '), `${row.ID} ${column}`).toBe(row[column]);
      }
    }
  }
}

const readCsv = (file: string) => parseCsv(fs.readFileSync(file, 'utf-8'));

test.describe('Supplier Members - export', { tag: ['@regression'] }, () => {
  test(
    'Export All offers CSV, Excel 95 + and Excel 2007+',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.exportMenuToggle.click();

      await expect(list.exportFormatLinks).toHaveText(
        memberExportFormats.map(
          ({ format }) => new RegExp(`^\\s*${format.replace('+', '\\+')}\\s*$`),
        ),
      );
    },
  );

  for (const { format, extension } of memberExportFormats) {
    test(
      `${format} export downloads a .${extension} file`,
      { tag: ['@smoke', '@functional'] },
      async ({ supplierMemberListPage: list }) => {
        await list.goto();
        const download = await list.exportAs(format);

        expect(download.suggestedFilename()).toMatch(
          new RegExp(`^Supplier members \\d{4}-\\d\\d-\\d\\d\\.${extension}$`),
        );
        expect(fs.statSync(await download.path()).size).toBeGreaterThan(0);
      },
    );
  }

  test(
    'Cancelling the confirmation downloads nothing',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.startExport('CSV');

      const downloaded = list.downloadStarts(3_000);
      await list.confirmDialog.cancel();

      await expect(list.confirmDialog.dialog).toBeHidden();
      expect(await downloaded).toBe(false);
    },
  );

  test(
    'CSV without filters holds every member with the grid values and headers',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, ALL);
      const grid = await list.readRows();
      await list.goto();
      const download = await list.exportAs('CSV');
      const text = fs.readFileSync(await download.path(), 'utf-8');
      const file = parseCsv(text);

      expect(text.charCodeAt(0), 'UTF-8 byte order mark for Arabic text').toBe(0xfeff);
      expect(text).not.toMatch(/<div|<table|<span/i);
      expect(file[0]).toEqual([...memberColumns]);
      expectFileMatchesGrid(file, grid);
    },
  );

  const filterCases: { name: string; filters: MemberFilters }[] = [
    { name: 'Status active', filters: { status: 'active' } },
    { name: 'Status inactive', filters: { status: 'inactive' } },
    { name: 'English Name "al"', filters: { nameEn: 'al' } },
    { name: 'Arabic Name "محمد"', filters: { name: 'محمد' } },
    { name: 'Email "@"', filters: { email: '@' } },
    { name: 'English Name "al" + Status active', filters: { nameEn: 'al', status: 'active' } },
  ];
  for (const { name, filters } of filterCases) {
    test(
      `CSV with filter ${name} holds exactly the filtered members`,
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list }) => {
        await list.open(filters, ALL);
        const grid = await list.readRows();
        await list.open(filters);
        const download = await list.exportAs('CSV');

        expectFileMatchesGrid(readCsv(await download.path()), grid);
      },
    );
  }

  test(
    'CSV with the phone filter holds that one member',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, ALL);
      const member = (await list.readRows()).find((row) => !isTestMember(row))!;
      await list.goto();
      await list.searchBy({ phone: member.Phone });
      const download = await list.exportAs('CSV');

      expectFileMatchesGrid(readCsv(await download.path()), [member]);
    },
  );

  test(
    'Export keeps the grid sort order',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, { ...ALL, sort: 'phone' });
      const order = (await list.readRows()).filter((r) => !isTestMember(r)).map((r) => r.ID);
      await list.open({}, { sort: 'phone' });
      const download = await list.exportAs('CSV');
      const file = readCsv(await download.path());

      expect(realFileRows(file).map((row) => row[file[0].indexOf('ID')])).toEqual(order);
    },
  );

  test(
    'Export holds all matching members, not only the current page',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({}, ALL);
      const total = (await list.readRows()).filter((row) => !isTestMember(row)).length;
      await list.openPage(2, pagingSize);
      const download = await list.exportAs('CSV');

      expect(realFileRows(readCsv(await download.path()))).toHaveLength(total);
    },
  );

  test(
    'Export with no matching members holds only the header',
    { tag: ['@negative'] },
    async ({ supplierMemberListPage: list }) => {
      await list.open({ nameEn: noMatchName });
      const download = await list.exportAs('CSV');

      expect(readCsv(await download.path())).toEqual([[...memberColumns]]);
    },
  );

  test(
    'The column picker lists every exportable column, all ticked',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.toggleExportColumns();

      await expect(list.exportColumnLabels).toHaveText(['Select Columns', ...memberColumns]);
      for (const checkbox of await list.exportColumnCheckboxes.all()) {
        await expect(checkbox).toBeChecked();
      }
    },
  );

  test(
    'Unticked columns are left out of the file',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.toggleExportColumns();
      await list.toggleExportColumn('Email');
      await list.toggleExportColumn('Phone');
      await list.toggleExportColumns(); // closes the picker

      const download = await list.exportAs('CSV');
      const [header] = readCsv(await download.path());

      expect(header).toEqual(memberColumns.filter((c) => c !== 'Email' && c !== 'Phone'));
    },
  );
});
