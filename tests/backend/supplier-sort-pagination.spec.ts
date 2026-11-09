import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  type SortableColumn,
  csvExport,
  exportColumns,
  exportFormats,
  pageSize,
  sortableColumns,
  spreadsheetExports,
  supplierUrls,
} from '@test-data/supplier.data';

// Pages open signed in as Dev Root; see devRootSession for what is recorded.
test.use(devRootSession);

const ascending = (values: string[]) =>
  [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

/** Non-empty lines of a downloaded CSV file, without the byte order mark. */
function readCsvLines(file: string): string[] {
  const text = fs.readFileSync(file, 'utf-8');
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    .split(/\r?\n/)
    .filter((line) => line.trim());
}

test.describe('Supplier List - sorting', { tag: ['@regression', '@functional'] }, () => {
  test('Only ID, Phone and Joining Date are sortable', async ({ supplierListPage }) => {
    await supplierListPage.goto();

    await expect(supplierListPage.sortableColumnLabels).toHaveText(Object.keys(sortableColumns));
  });

  for (const column of Object.keys(sortableColumns) as SortableColumn[]) {
    test(`${column} sorts ascending, then descending`, async ({ page, supplierListPage }) => {
      await supplierListPage.goto();

      await supplierListPage.sortBy(column);
      await expect(page).toHaveURL(supplierUrls.sortedBy(sortableColumns[column]));
      await expect(supplierListPage.sortLink(column)).toHaveClass(/asc/);
      const asc = await supplierListPage.columnValues(column);
      expect(asc).toEqual(ascending(asc));

      await supplierListPage.sortBy(column);
      await expect(page).toHaveURL(supplierUrls.sortedBy(`-${sortableColumns[column]}`));
      await expect(supplierListPage.sortLink(column)).toHaveClass(/desc/);
      const desc = await supplierListPage.columnValues(column);
      expect(desc).toEqual(ascending(desc).reverse());
    });
  }

  test('Sort order carries over to the next page', async ({ supplierListPage }) => {
    await supplierListPage.goto({ sort: 'id' });
    const lastOnFirstPage = Number((await supplierListPage.columnValues('ID')).at(-1));

    await supplierListPage.goToNextPage();

    const ids = (await supplierListPage.columnValues('ID')).map(Number);
    expect(ids[0]).toBeGreaterThan(lastOnFirstPage);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test('Sort order stays after a page refresh', async ({ page, supplierListPage }) => {
    await supplierListPage.goto();
    await supplierListPage.sortBy('Phone');
    const phones = await supplierListPage.columnValues('Phone');

    await page.reload();

    expect(await supplierListPage.columnValues('Phone')).toEqual(phones);
  });
});

test.describe('Supplier List - pagination', { tag: ['@regression', '@functional'] }, () => {
  test.beforeEach(async ({ supplierListPage }) => {
    await supplierListPage.goto({ sort: 'id' });
    const { total } = await supplierListPage.summaryCounts();
    // eslint-disable-next-line playwright/no-skipped-test -- depends on live data volume
    test.skip(total <= pageSize, 'Needs more than one page of suppliers.');
  });

  test('First page has Previous disabled and page 1 active', async ({ supplierListPage }) => {
    await expect(supplierListPage.previousPage).toHaveClass(/disabled/);
    await expect(supplierListPage.nextPage).not.toHaveClass(/disabled/);
    await expect(supplierListPage.activePage).toHaveText('1');
  });

  test('Next and Previous move one page and update the summary', async ({ supplierListPage }) => {
    const firstPage = await supplierListPage.columnValues('ID');

    await supplierListPage.goToNextPage();
    await expect(supplierListPage.activePage).toHaveText('2');
    const summary = await supplierListPage.summaryCounts();
    expect(summary.from).toBe(pageSize + 1);
    expect(summary.to).toBe(Math.min(2 * pageSize, summary.total));
    const secondPage = await supplierListPage.columnValues('ID');
    expect(secondPage.filter((id) => firstPage.includes(id))).toEqual([]);

    await supplierListPage.goToPreviousPage();
    await expect(supplierListPage.activePage).toHaveText('1');
    expect(await supplierListPage.columnValues('ID')).toEqual(firstPage);
  });

  test('Page numbers open that page and the last page disables Next', async ({
    supplierListPage,
  }) => {
    const { total } = await supplierListPage.summaryCounts();
    const lastPage = Math.ceil(total / pageSize);

    await supplierListPage.goToPage(lastPage);

    await expect(supplierListPage.activePage).toHaveText(String(lastPage));
    await expect(supplierListPage.nextPage).toHaveClass(/disabled/);
    const summary = await supplierListPage.summaryCounts();
    expect(summary.from).toBe((lastPage - 1) * pageSize + 1);
    expect(summary.to).toBe(total);
    await expect(supplierListPage.rows).toHaveCount(total - (lastPage - 1) * pageSize);
  });

  test('Row numbers continue across pages', async ({ supplierListPage }) => {
    await supplierListPage.goToNextPage();

    const numbers = await supplierListPage.columnValues('#');

    expect(numbers[0]).toBe(String(pageSize + 1));
  });

  test('Every supplier appears exactly once across all pages', async ({ supplierListPage }) => {
    const { total } = await supplierListPage.summaryCounts();
    const ids: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.ceil(total / pageSize); pageNumber += 1) {
      await supplierListPage.goto({ sort: 'id', page: String(pageNumber) });
      ids.push(...(await supplierListPage.columnValues('ID')));
    }

    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
  });

  test('A page number past the end shows the last page', async ({ supplierListPage }) => {
    const { total } = await supplierListPage.summaryCounts();

    await supplierListPage.goto({ sort: 'id', page: '999' });

    const summary = await supplierListPage.summaryCounts();
    expect(summary.to).toBe(total);
    await expect(supplierListPage.activePage).toHaveText(String(Math.ceil(total / pageSize)));
  });
});

test.describe('Supplier List - export', { tag: ['@regression', '@functional'] }, () => {
  test.beforeEach(async ({ supplierListPage }) => {
    await supplierListPage.goto();
  });

  test('Export All offers CSV and both Excel formats', async ({ supplierListPage }) => {
    await supplierListPage.openExportMenu();

    for (const format of exportFormats) {
      await expect(supplierListPage.exportFormat(format)).toBeVisible();
    }
  });

  test('Column picker lists every exportable column, all selected', async ({
    supplierListPage,
  }) => {
    await supplierListPage.openExportColumns();

    for (const column of exportColumns) {
      await expect(supplierListPage.exportColumnCheckbox(column)).toBeChecked();
    }
  });

  test('CSV export downloads every supplier with the selected columns', async ({
    supplierListPage,
  }) => {
    const { total } = await supplierListPage.summaryCounts();
    const firstId = (await supplierListPage.columnValues('ID'))[0];
    const download = await supplierListPage.exportAs('CSV');

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const lines = readCsvLines(await download.path());
    for (const column of csvExport.requiredColumns) {
      expect(lines[0]).toContain(column);
    }
    expect(lines.length - 1).toBe(total);
    expect(lines.some((line) => line.includes(firstId))).toBe(true);
  });

  test('CSV export leaves out a column that was unselected', async ({ supplierListPage }) => {
    await supplierListPage.openExportColumns();
    await supplierListPage.toggleExportColumn(csvExport.unselectedColumn);
    await expect(
      supplierListPage.exportColumnCheckbox(csvExport.unselectedColumn),
    ).not.toBeChecked();
    await supplierListPage.closeExportColumns();

    const download = await supplierListPage.exportAs('CSV');

    const [header] = readCsvLines(await download.path());
    expect(header).toContain(csvExport.keptColumn);
    expect(header).not.toContain(csvExport.unselectedColumn);
  });

  for (const { format, extension } of spreadsheetExports) {
    test(`${format} export downloads a .${extension} file`, async ({ supplierListPage }) => {
      const download = await supplierListPage.exportAs(format);

      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
      expect(fs.statSync(await download.path()).size).toBeGreaterThan(0);
    });
  }

  test('Export of a filtered list contains only the filtered suppliers', async ({
    supplierListPage,
  }) => {
    await supplierListPage.search({ status: 'inactive' });
    const { total } = await supplierListPage.summaryCounts();
    const download = await supplierListPage.exportAs('CSV');

    const rows = readCsvLines(await download.path()).slice(1);
    expect(rows).toHaveLength(total);
    for (const row of rows) expect(row).toContain('inactive');
  });
});
