import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { CompanyRow } from '@pages/backend/suppliers/supplier-company-list.page';
import { parseCsv } from '@utils/csv';
import {
  companyExportFormats,
  companyExportHeader,
  isTestCompany,
  noMatchName,
  supplierCompanyText as text,
  unknownSupplierId,
  unusualFilterValues,
} from '@test-data/supplier-company.data';

/**
 * Mazad Backend > Companies: the Supplier, Company Name Ar and Company Name En filters, and
 * Export All. Read-only: exports only download files. Expected results come from the live list,
 * and QA-AUTO test companies are left out of comparisons because supplier-company-crud.spec.ts
 * adds and deletes them in parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const realRows = (rows: CompanyRow[]) => rows.filter((row) => !isTestCompany(row));
const realIds = (rows: CompanyRow[]) =>
  realRows(rows)
    .map((row) => row.id)
    .sort();
const supplierName = (label: string) => label.replace(/ - Supplier$/, '').trim();
const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());

/** A real company whose supplier name is unique among the Supplier options. */
function companyWithUniqueSupplier(all: CompanyRow[], options: { id: string; label: string }[]) {
  for (const row of all) {
    const matches = options.filter((option) => supplierName(option.label) === row.supplier);
    if (matches.length === 1) return { row, supplier: matches[0] };
  }
  throw new Error('No company has a supplier with a unique name.');
}

test.describe('Supplier Company - filters', { tag: ['@regression'] }, () => {
  let all: CompanyRow[] = [];

  test.beforeEach(async ({ supplierCompanyListPage: list }) => {
    all = realRows(await list.readAllRows());
  });

  test(
    'Supplier filter lists suppliers as "<name> - Supplier"',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const options = await list.supplierOptions();

      expect(options.length).toBeGreaterThan(0);
      for (const option of options) expect(option.label).toMatch(/ - Supplier$/);
    },
  );

  test(
    'Each supplier shows only its own companies',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const options = await list.supplierOptions();
      const labels = options.map((option) => supplierName(option.label));

      for (const option of options) {
        const name = supplierName(option.label);
        // Several suppliers share some names, so the exact set is compared only for unique names.
        if (labels.filter((label) => label === name).length === 1) {
          expect(
            realIds(await list.readAllRows({ supplierId: option.id })),
            `companies of supplier ${option.id}`,
          ).toEqual(
            all
              .filter((row) => row.supplier === name)
              .map((row) => row.id)
              .sort(),
          );
        } else {
          await list.open({ supplierId: option.id });
          for (const row of await list.readRows()) {
            expect(row.supplier, `supplier ${option.id}`).toBe(name);
          }
        }
      }
    },
  );

  test(
    'Supplier picked in the dropdown filters the list and stays selected',
    { tag: ['@smoke', '@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const { row, supplier } = companyWithUniqueSupplier(all, await list.supplierOptions());

      await list.chooseSupplier(supplier.label);
      await list.search();

      await expect(list.selectedSupplier()).toContainText(supplier.label);
      const rows = await list.readRows();
      expect(rows.map((r) => r.id)).toContain(row.id);
      for (const r of rows) expect(r.supplier).toBe(row.supplier);
    },
  );

  test(
    'Company Name Ar matches part of the Arabic name',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const term = 'شركة';
      const expected = all.filter((row) => row.name.includes(term));
      test.skip(expected.length === 0, `No company name contains "${term}".`);

      expect(realIds(await list.readAllRows({ name: term }))).toEqual(
        expected.map((row) => row.id).sort(),
      );
    },
  );

  test(
    'Company Name En matches part of the English name in any letter case',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const word = all
        .flatMap((row) => row.nameEn.split(/\s+/))
        .find((part) => /^[A-Za-z]{6,}$/.test(part));
      test.skip(!word, 'No English name has a long enough word.');
      const term = word!.slice(1, -1);
      const expected = all
        .filter((row) => includes(row.nameEn, term))
        .map((row) => row.id)
        .sort();

      for (const value of [term.toLowerCase(), term.toUpperCase(), term]) {
        expect(realIds(await list.readAllRows({ nameEn: value })), value).toEqual(expected);
      }
    },
  );

  test(
    'Company Name Ar does not search the English name',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const term = 'Company';
      expect(realIds(await list.readAllRows({ name: term }))).toEqual(
        all
          .filter((row) => row.name.includes(term))
          .map((row) => row.id)
          .sort(),
      );
    },
  );

  test(
    'Supplier and Company Name En together show only companies matching both',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const { row, supplier } = companyWithUniqueSupplier(all, await list.supplierOptions());
      const word = row.nameEn.split(/\s+/)[0];

      await list.open({ supplierId: supplier.id, nameEn: word });
      expect(realIds(await list.readRows())).toEqual(
        all
          .filter((r) => r.supplier === row.supplier && includes(r.nameEn, word))
          .map((r) => r.id)
          .sort(),
      );
    },
  );

  test(
    'All three filters find one company',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const { row, supplier } = companyWithUniqueSupplier(all, await list.supplierOptions());

      await list.searchBy({ supplierId: supplier.id, name: row.name, nameEn: row.nameEn });
      expect((await list.readRows()).map((r) => r.id)).toContain(row.id);
      await expect(list.nameFilter).toHaveValue(row.name);
      await expect(list.nameEnFilter).toHaveValue(row.nameEn);
    },
  );

  test(
    'Filters that contradict each other show the empty state',
    { tag: ['@negative'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const options = await list.supplierOptions();
      const { row } = companyWithUniqueSupplier(all, options);
      const other = options.find(
        (option) =>
          !all.some((r) => r.supplier === supplierName(option.label) && r.nameEn === row.nameEn),
      );

      await list.open({ supplierId: other!.id, nameEn: row.nameEn });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
      await expect(list.summary).toHaveCount(0);
    },
  );

  test(
    'A name nobody has shows the empty state',
    { tag: ['@negative'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: noMatchName });

      await expect(list.emptyMessage).toHaveText(text.emptyState);
      await expect(list.rows).toHaveCount(0);
      await expect(list.exportMenuToggle).toBeVisible();
    },
  );

  test(
    'Enter in a text filter runs the search',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const [row] = all;
      await list.goto();
      await list.nameEnFilter.fill(row.nameEn);
      await list.searchWithEnter(list.nameEnFilter);

      expect((await list.readRows()).map((r) => r.id)).toContain(row.id);
      for (const r of await list.readRows()) expect(includes(r.nameEn, row.nameEn)).toBe(true);
    },
  );

  test(
    'Reset clears every filter and shows all companies',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const [option] = await list.supplierOptions();
      await list.open({ supplierId: option.id, name: 'ا', nameEn: 'a' });

      await list.reset();

      await expect(list.selectedSupplier()).toHaveText(text.supplierPlaceholder);
      await expect(list.nameFilter).toHaveValue('');
      await expect(list.nameEnFilter).toHaveValue('');
      expect(await list.totalCount()).toBeGreaterThanOrEqual(all.length);
    },
  );

  test(
    'Filters and results survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, supplierCompanyListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: 'Company' });
      const before = await list.rowIds();

      await page.reload();

      await expect(list.nameEnFilter).toHaveValue('Company');
      expect(await list.rowIds()).toEqual(before);
    },
  );

  test(
    'A filter is kept when paging through its results',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const term = 'Compan';
      const expected = all.filter((row) => includes(row.nameEn, term));
      test.skip(expected.length <= 5, 'Too few matches to need a second page.');

      // readAllRows pages through 5 rows at a time with the filter in every page URL.
      expect(realIds(await list.readAllRows({ nameEn: term }))).toEqual(
        expected.map((row) => row.id).sort(),
      );
    },
  );

  test(
    'Searching again with another value replaces the results',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const [first, second] = all.filter(
        (row, i, rows) => rows.findIndex((r) => r.nameEn === row.nameEn) === i,
      );
      await list.goto();
      await list.searchBy({ nameEn: first.nameEn });
      expect((await list.readRows()).map((r) => r.id)).toContain(first.id);

      await list.searchBy({ nameEn: second.nameEn });
      const rows = await list.readRows();
      expect(rows.map((r) => r.id)).toContain(second.id);
      for (const r of rows) expect(includes(r.nameEn, second.nameEn)).toBe(true);
    },
  );

  for (const { name, value } of unusualFilterValues) {
    test(
      `Company Name En with ${name} loads without errors`,
      { tag: ['@negative'] },
      async ({ supplierCompanyListPage: list }) => {
        const dialogs = list.countDialogs();
        expect(await list.open({ nameEn: value })).toBe(200);

        expect(realIds(await list.readRows())).toEqual(
          all
            .filter((row) => includes(row.nameEn, value))
            .map((row) => row.id)
            .sort(),
        );
        expect(dialogs(), 'no script ran').toBe(0);
      },
    );
  }

  test(
    'An unknown supplier ID shows no companies',
    { tag: ['@negative'] },
    async ({ supplierCompanyListPage: list }) => {
      expect(await list.open({ supplierId: unknownSupplierId })).toBe(200);
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );

  test(
    'Letters as the supplier ID do not break the page',
    { tag: ['@negative'] },
    async ({ supplierCompanyListPage: list }) => {
      expect(await list.open({ supplierId: 'abc' })).toBe(200);
      await expect(list.grid).toBeVisible();
    },
  );
});

test.describe('Supplier Company - export', { tag: ['@regression'] }, () => {
  test(
    'Export All offers CSV, Excel 95 + and Excel 2007+',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      await list.exportMenuToggle.click();
      await expect(list.exportFormatLinks).toHaveText([...companyExportFormats]);
    },
  );

  test(
    'CSV export holds every company with the grid values',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const all = realRows(await list.readAllRows());
      await list.goto();
      const download = await list.exportAs('CSV');
      const content = fs.readFileSync(await download.path(), 'utf8');
      const [header, ...data] = parseCsv(content);

      expect(download.suggestedFilename()).toMatch(/^Companies .*\.csv$/);
      expect(header).toEqual([...companyExportHeader]);
      expect(content, 'no HTML in the file').not.toMatch(/<(div|table|span)\b/i);
      const column = (name: (typeof companyExportHeader)[number]) => header.indexOf(name);
      const fileRows = data
        .map((row) => ({
          id: row[column('ID')],
          supplier: row[column('Supplier Name')].trim(),
          name: row[column('Company Name Ar')].replace(/\s+/g, ' ').trim(),
          nameEn: row[column('Company Name En')].replace(/\s+/g, ' ').trim(),
        }))
        .filter((row) => !isTestCompany(row));
      expect(fileRows.map((row) => row.id).sort()).toEqual(all.map((row) => row.id).sort());
      for (const row of all) {
        const exported = fileRows.find((r) => r.id === row.id)!;
        expect(exported, `company ${row.id}`).toEqual({
          id: row.id,
          supplier: row.supplier,
          name: row.name,
          nameEn: row.nameEn,
        });
      }
    },
  );

  test(
    'CSV export holds only the filtered companies',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const filters = { nameEn: 'Company' };
      const grid = realIds(await list.readAllRows(filters));
      await list.open(filters);
      const download = await list.exportAs('CSV');
      const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

      const ids = data
        .filter(
          (row) =>
            !isTestCompany({
              name: row[header.indexOf('Company Name Ar')],
              nameEn: row[header.indexOf('Company Name En')],
            }),
        )
        .map((row) => row[header.indexOf('ID')])
        .sort();
      expect(ids).toEqual(grid);
    },
  );
});
