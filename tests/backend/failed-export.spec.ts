import fs from 'node:fs';
import type { TestInfo } from '@playwright/test';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  type FailedExportFormat,
  type FailedRow,
  FailedPage,
} from '@pages/backend/auctions/failed.page';
import {
  arabicLetters,
  failedData,
  failedExportColumns,
  failedExportFileName,
  failedText,
  failedUrls,
} from '@test-data/backend-failed.data';
import { parseCsv } from '@utils/csv';
import { fileSignature, readSpreadsheet, signature } from '@utils/spreadsheet';

// Read-only: exports the Failed list (a download, nothing is changed) and checks the real file
// contents, not just that a download started. Every export is filtered to a handful of rows, so
// the files stay small and each exported record can be compared with the grid.
test.use(devRootSession);

const formats: FailedExportFormat[] = ['Csv', 'Xls', 'Xlsx'];
const header = [...failedExportColumns];

const whole = (text: string | undefined) => Number((text ?? '').replace(/[^\d]/g, '') || 0);

/** Exports in a format, saves the file and returns its rows (header first). */
async function exportTable(
  failedPage: FailedPage,
  format: FailedExportFormat,
  testInfo: TestInfo,
): Promise<string[][]> {
  const download = await failedPage.exportAs(format);
  expect(download.suggestedFilename()).toMatch(failedExportFileName[format]);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  expect(fs.statSync(file).size, 'file is not empty').toBeGreaterThan(0);

  if (format === 'Csv') return parseCsv(fs.readFileSync(file, 'utf8'));
  expect(fileSignature(file), `${format} file type`).toBe(
    format === 'Xlsx' ? signature.xlsx : signature.xls,
  );
  const { rows } = readSpreadsheet(file);
  // The legacy XLS declares one empty column after the last header (observed 2026-11-11); the
  // XLSX and CSV have none. Record it, then compare the real content.
  if (format === 'Xls' && rows[0]?.[rows[0].length - 1] === '') {
    testInfo.annotations.push({
      type: 'observation',
      description: 'The XLS export has an empty trailing column that the CSV and XLSX do not have.',
    });
    return rows.map((row) => row.slice(0, -1));
  }
  return rows;
}

/** Exported records keyed by column name, from a table with its header row first. */
function records(table: string[][]): Record<string, string>[] {
  const [head, ...body] = table;
  return body.map((row) => Object.fromEntries(head.map((name, index) => [name, row[index] ?? ''])));
}

/** Checks every grid row has an exported record with the same values. */
function expectMatchesGrid(exported: Record<string, string>[], rows: FailedRow[]) {
  expect(exported, 'exported records equal displayed rows').toHaveLength(rows.length);
  for (const row of rows) {
    const record = exported.find((r) => r['Auction ID'] === row.itemId);
    expect(record, `item ${row.itemId} is in the export`).toBeDefined();
    if (!record) continue;
    expect(record['Vin Number'], `item ${row.itemId} VIN`).toBe(row.vin);
    expect(record['Vehicle Title View'], `item ${row.itemId} vehicle`).toBe(row.vehicleTitle);
    expect(record['Supplier Name'], `item ${row.itemId} supplier`).toBe(row.supplier);
    expect(record['Failed Reason'], `item ${row.itemId} reason`).toBe(row.failedReason);
    expect(record['Auction Type'], `item ${row.itemId} auction type`).toBe(row.auctionType);
    expect(record['Bidding Type'], `item ${row.itemId} bidding type`).toBe(row.biddingType);
    expect(whole(record['Total Bids']), `item ${row.itemId} bids`).toBe(row.totalBids);
    expect(whole(record['Total Bidders']), `item ${row.itemId} bidders`).toBe(row.totalBidders);
    expect(whole(record['Starting Price']), `item ${row.itemId} starting`).toBe(
      row.startingPrice ?? 0,
    );
    expect(whole(record['Supplier Price']), `item ${row.itemId} supplier price`).toBe(
      row.supplierPrice ?? 0,
    );
    expect(whole(record['Reserve Price']), `item ${row.itemId} reserve`).toBe(
      row.reservePrice ?? 0,
    );
    expect(whole(record['Highest Price']), `item ${row.itemId} highest`).toBe(
      row.highestPrice ?? 0,
    );
    expect(whole(record.Commission), `item ${row.itemId} commission`).toBe(row.commission ?? 0);
    expect(whole(record['Administrative Expenses']), `item ${row.itemId} admin`).toBe(
      row.administrativeExpenses ?? 0,
    );
    expect(record['Start Date'], `item ${row.itemId} start`).toBe(row.startDate);
    expect(record['End Date'], `item ${row.itemId} end`).toBe(row.endDate);
    expect(record['Customer Name'], `item ${row.itemId} customer`).toBe(
      row.customer === failedText.customerNotSet ? '' : row.customer,
    );
  }
}

test.describe('Backend - Failed List - export', { tag: ['@regression'] }, () => {
  /** A VIN with a few failed attempts, so the export stays small. */
  let vin: string;

  test.beforeEach(async ({ page, failedPage }) => {
    await failedPage.goto();
    await expect(page).toHaveURL(failedUrls.list);
    vin = FailedPage.baseVin((await failedPage.readRow(failedPage.rows.first())).vin);
  });

  test.afterEach(async ({ page, mazadDashboardPage }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const screenshot = await page
      .screenshot({ mask: mazadDashboardPage.sensitiveAreas() })
      .catch(() => null);
    if (screenshot) {
      await testInfo.attach('screenshot (account details masked)', {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  });

  test(
    'FL-EXP-01 Export All offers CSV, Excel 95+ and Excel 2007+',
    { tag: ['@smoke', '@functional'] },
    async ({ failedPage }) => {
      await failedPage.exportMenuToggle.click();

      for (const format of formats) {
        await expect(failedPage.exportFormatLink(format)).toBeVisible();
      }
      await expect(failedPage.exportFormatLink('Csv')).toHaveText('CSV');
      await expect(failedPage.exportFormatLink('Xls')).toHaveText('Excel 95 +');
      await expect(failedPage.exportFormatLink('Xlsx')).toHaveText('Excel 2007+');
    },
  );

  test(
    'FL-EXP-02 The column picker offers every export column',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.toggleExportColumns();

      expect(await failedPage.exportColumnNames()).toEqual(
        expect.arrayContaining([...failedExportColumns]),
      );
    },
  );

  test(
    'FL-EXP-03 Cancelling the export confirmation downloads nothing',
    { tag: ['@functional', '@negative'] },
    async ({ failedPage }) => {
      await failedPage.searchBy('vin', vin);
      await failedPage.startExport('Csv');
      await expect(failedPage.confirmDialog.message).toHaveText(failedText.exportConfirmMessage);
      const downloaded = failedPage.downloadStarts(3_000);

      await failedPage.confirmDialog.cancel();

      expect(await downloaded).toBe(false);
      await expect(failedPage.confirmDialog.dialog).toBeHidden();
    },
  );

  for (const format of formats) {
    test(
      `FL-EXP-04 ${format.toUpperCase()} export has the right headers and the displayed records`,
      { tag: ['@smoke', '@functional'] },
      async ({ failedPage }, testInfo) => {
        await failedPage.searchBy('vin', vin);
        const rows = await failedPage.readRows();
        expect(rows.length).toBeGreaterThan(0);

        const table = await exportTable(failedPage, format, testInfo);

        expect(table[0], 'exported headers').toEqual(header);
        expectMatchesGrid(records(table), rows);
      },
    );
  }

  test(
    'FL-EXP-05 CSV is UTF-8 with a byte order mark and keeps Arabic text',
    { tag: ['@functional', '@ui'] },
    async ({ failedPage }, testInfo) => {
      await failedPage.searchBy('vin', vin);

      const download = await failedPage.exportAs('Csv');
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const bytes = fs.readFileSync(file);
      const [, ...body] = parseCsv(bytes.toString('utf8'));

      expect([...bytes.subarray(0, 3)], 'UTF-8 byte order mark').toEqual([0xef, 0xbb, 0xbf]);
      const supplierColumn = header.indexOf('Supplier Name');
      expect(body.length).toBeGreaterThan(0);
      for (const row of body) expect(row[supplierColumn]).toMatch(arabicLetters);
    },
  );

  for (const format of ['Xls', 'Xlsx'] as const) {
    test(
      `FL-EXP-06 ${format.toUpperCase()} export keeps Arabic text`,
      { tag: ['@functional', '@ui'] },
      async ({ failedPage }, testInfo) => {
        await failedPage.searchBy('vin', vin);

        const table = await exportTable(failedPage, format, testInfo);

        const supplierColumn = header.indexOf('Supplier Name');
        for (const row of table.slice(1)) expect(row[supplierColumn]).toMatch(arabicLetters);
      },
    );
  }

  test(
    'FL-EXP-07 The export respects the active filters',
    { tag: ['@functional'] },
    async ({ failedPage }, testInfo) => {
      const first = await failedPage.readRow(failedPage.rows.first());
      await failedPage.chooseFilter('failedReason', first.failedReason);
      await failedPage.fillFilter('vin', vin);
      await failedPage.search();
      const rows = await failedPage.readRows();

      const exported = records(await exportTable(failedPage, 'Csv', testInfo));

      expect(exported).toHaveLength(rows.length);
      for (const record of exported) {
        expect(record['Failed Reason']).toBe(first.failedReason);
        expect(record['Vin Number'].startsWith(vin)).toBe(true);
      }
    },
  );

  test(
    'FL-EXP-08 The export covers every page of a filtered list, not only the page shown',
    { tag: ['@functional'] },
    async ({ failedPage }, testInfo) => {
      let total = 0;
      for (const reason of [
        'Cancellation upon request by the supplier',
        'Cancellation upon request by the customer',
        'Canceled due to an inspection error',
        'Others',
      ]) {
        await failedPage.goto();
        await failedPage.filterBy('failedReason', reason);
        total = await failedPage.totalCount();
        if (total > failedData.pageSize && total <= 300) break;
        total = 0;
      }
      test.skip(total === 0, 'No failed reason with between 21 and 300 items.');

      const exported = records(await exportTable(failedPage, 'Csv', testInfo));

      expect(exported).toHaveLength(total);
    },
  );

  test(
    'FL-EXP-09 An empty result exports only the header row',
    { tag: ['@functional', '@negative'] },
    async ({ failedPage }, testInfo) => {
      await failedPage.searchBy('vin', failedData.unknownVin);
      await expect(failedPage.emptyMessage).toHaveText(failedText.noResults);

      for (const format of ['Csv', 'Xlsx'] as const) {
        const table = await exportTable(failedPage, format, testInfo);

        expect(table, `${format} rows`).toHaveLength(1);
        expect(table[0]).toEqual(header);
      }
    },
  );

  test(
    'FL-EXP-10 Unticking a column in the picker leaves it out of the export',
    { tag: ['@functional'] },
    async ({ failedPage }, testInfo) => {
      await failedPage.searchBy('vin', vin);
      await failedPage.toggleExportColumns();
      await failedPage.toggleExportColumn('Plate Number');

      const table = await exportTable(failedPage, 'Csv', testInfo);

      expect(table[0]).not.toContain('Plate Number');
      expect(table[0]).toContain('Vin Number');
    },
  );
});
