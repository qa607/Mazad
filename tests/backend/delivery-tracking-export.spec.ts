import fs from 'node:fs';
import type { TestInfo } from '@playwright/test';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type {
  DeliveryTrackingPage,
  TrackingExportFormat,
  TrackingRow,
} from '@pages/backend/delivery/delivery-tracking.page';
import { trackingData, trackingText } from '@test-data/backend-delivery.data';
import { arabicLetters } from '@test-data/backend-failed.data';
import { parseCsv } from '@utils/csv';
import { fileSignature, readSpreadsheet, signature } from '@utils/spreadsheet';

// Exports of the Delivery Tracking page (CSV, Excel 95+, Excel 2007+): the real file contents are
// compared with the grid and with the filters applied. Read-only: an export is only a download.
test.use(devRootSession);

const formats: TrackingExportFormat[] = ['Csv', 'Xls', 'Xlsx'];
const header = [...trackingData.exportColumns];

/** Exports in a format, saves the file and returns its rows (header first). */
async function exportTable(
  page: DeliveryTrackingPage,
  format: TrackingExportFormat,
  testInfo: TestInfo,
): Promise<string[][]> {
  const download = await page.exportAs(format);
  expect(download.suggestedFilename()).toMatch(trackingData.exportFileName[format]);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  expect(fs.statSync(file).size, 'file is not empty').toBeGreaterThan(0);

  if (format === 'Csv') return parseCsv(fs.readFileSync(file, 'utf8'));
  expect(fileSignature(file), `${format} file type`).toBe(
    format === 'Xlsx' ? signature.xlsx : signature.xls,
  );
  const { rows } = readSpreadsheet(file);
  // A legacy XLS can declare an empty trailing column; compare the real content.
  return rows.map((row) =>
    row[row.length - 1] === '' && row.length > header.length ? row.slice(0, header.length) : row,
  );
}

/** Exported records keyed by column heading. */
function records(table: string[][]): Record<string, string>[] {
  const [head, ...body] = table;
  return body.map((row) => Object.fromEntries(head.map((name, index) => [name, row[index] ?? ''])));
}

/** Checks each grid row has an exported record with the same values (matched on VIN, plate and date). */
function expectMatchesGrid(exported: Record<string, string>[], rows: TrackingRow[]) {
  for (const row of rows) {
    const record = exported.find(
      (r) =>
        r['Vin number'] === row.vin &&
        r['Plate number'] === row.plate &&
        r['Date of delivery'] === row.deliveryDate,
    );
    expect(record, `${row.vin} is in the export`).toBeDefined();
    if (!record) continue;
    expect(record['Delivery company'], `${row.vin} company`).toBe(row.deliveryCompany);
    expect(record.From, `${row.vin} supplier`).toBe(row.from);
    expect(record.To, `${row.vin} city`).toBe(row.to);
  }
}

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

test.describe('Backend - Delivery Tracking - export', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ deliveryTrackingPage }) => {
    await deliveryTrackingPage.goto();
  });

  test(
    'TRK-EXP-01 Export All offers CSV, Excel 95+ and Excel 2007+, and the column picker lists the seven columns',
    { tag: ['@smoke', '@functional'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.exportMenuToggle.click();
      for (const format of formats)
        await expect(deliveryTrackingPage.exportFormatLink(format)).toBeVisible();
      await expect(deliveryTrackingPage.exportFormatLink('Csv')).toHaveText('CSV');
      await expect(deliveryTrackingPage.exportFormatLink('Xls')).toHaveText('Excel 95 +');
      await expect(deliveryTrackingPage.exportFormatLink('Xlsx')).toHaveText('Excel 2007+');
      await deliveryTrackingPage.exportMenuToggle.click();

      await deliveryTrackingPage.toggleExportColumns();

      expect(await deliveryTrackingPage.exportColumnNames()).toEqual(
        expect.arrayContaining(header),
      );
    },
  );

  test(
    'TRK-EXP-02 Cancelling the export confirmation downloads nothing',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.startExport('Csv');
      await expect(deliveryTrackingPage.confirmDialog.message).toHaveText(
        trackingData.exportConfirmMessage,
      );
      const downloaded = deliveryTrackingPage.downloadStarts(3_000);

      await deliveryTrackingPage.confirmDialog.cancel();

      expect(await downloaded).toBe(false);
      await expect(deliveryTrackingPage.confirmDialog.dialog).toBeHidden();
    },
  );

  for (const format of formats) {
    test(
      `TRK-EXP-03 ${format.toUpperCase()} export has the right headings and one record per shipment, matching the grid`,
      { tag: ['@smoke', '@functional'] },
      async ({ deliveryTrackingPage }, testInfo) => {
        const { total } = await deliveryTrackingPage.summaryCounts();
        const gridRows = await deliveryTrackingPage.readRows();

        const table = await exportTable(deliveryTrackingPage, format, testInfo);

        expect(table[0], 'exported headings').toEqual(header);
        expect(table.length - 1, 'exported records equal the total shown').toBe(total);
        expectMatchesGrid(records(table), gridRows);
      },
    );
  }

  test(
    'TRK-EXP-04 The CSV is UTF-8 with a byte order mark and keeps Arabic supplier names',
    { tag: ['@functional', '@ui'] },
    async ({ deliveryTrackingPage }, testInfo) => {
      const download = await deliveryTrackingPage.exportAs('Csv');
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const bytes = fs.readFileSync(file);
      const body = parseCsv(bytes.toString('utf8')).slice(1);

      expect([...bytes.subarray(0, 3)], 'UTF-8 byte order mark').toEqual([0xef, 0xbb, 0xbf]);
      const fromColumn = header.indexOf('From');
      expect(body.some((row) => arabicLetters.test(row[fromColumn]))).toBe(true);
    },
  );

  for (const format of ['Xls', 'Xlsx'] as const) {
    test(
      `TRK-EXP-05 ${format.toUpperCase()} export keeps Arabic supplier names`,
      { tag: ['@functional', '@ui'] },
      async ({ deliveryTrackingPage }, testInfo) => {
        const table = await exportTable(deliveryTrackingPage, format, testInfo);

        const fromColumn = header.indexOf('From');
        expect(table.slice(1).some((row) => arabicLetters.test(row[fromColumn]))).toBe(true);
      },
    );
  }

  test(
    'TRK-EXP-06 The export respects the active filters',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }, testInfo) => {
      const [first] = await deliveryTrackingPage.readRows();
      await deliveryTrackingPage.filterBy('deliveryCompany', first.deliveryCompany);
      const { total } = await deliveryTrackingPage.summaryCounts();

      const exported = records(await exportTable(deliveryTrackingPage, 'Csv', testInfo));

      expect(exported.length).toBe(total);
      for (const record of exported) expect(record['Delivery company']).toBe(first.deliveryCompany);
    },
  );

  test(
    'TRK-EXP-07 An empty result exports only the heading row',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }, testInfo) => {
      await deliveryTrackingPage.searchBy('vin', trackingData.unknownVin);
      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);

      for (const format of ['Csv', 'Xlsx'] as const) {
        const table = await exportTable(deliveryTrackingPage, format, testInfo);

        expect(table, `${format} rows`).toHaveLength(1);
        expect(table[0]).toEqual(header);
      }
    },
  );

  test(
    'TRK-EXP-08 Unticking a column in the picker leaves it out of the export',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }, testInfo) => {
      await deliveryTrackingPage.toggleExportColumns();
      await deliveryTrackingPage.toggleExportColumn('Plate number');

      const table = await exportTable(deliveryTrackingPage, 'Csv', testInfo);

      expect(table[0]).not.toContain('Plate number');
      expect(table[0]).toContain('Vin number');
    },
  );
});
