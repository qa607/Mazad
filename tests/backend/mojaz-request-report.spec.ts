import fs from 'node:fs';
import { expect, test } from '@fixtures/test.fixture';
import { type MojazStatus, mojazStatuses } from '@pages/backend/reports/mojaz-request-report.page';
import {
  mojazRequestData,
  mojazRequestText,
  mojazRequestUrls,
} from '@test-data/backend-mojaz-request-report.data';

// Report > Request Mojaz (/backend/report/mojaz-request/index): customers' requests for a Mojaz
// vehicle-history report, with links to the generated PDFs. Read-only. The grid holds customer
// names and phone numbers, so test titles never include them.

test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

const statuses = Object.keys(mojazStatuses) as MojazStatus[];

test.describe('Backend - Request Mojaz report', () => {
  test.beforeEach(async ({ page, mojazRequestReportPage }) => {
    await mojazRequestReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(mojazRequestUrls.list);
  });

  test('Report shows the heading, filters and the requests grid', async ({
    page,
    mojazRequestReportPage: report,
  }) => {
    await expect(page).toHaveTitle(mojazRequestText.pageTitle);
    await expect(report.pageHeading).toHaveText(mojazRequestText.pageTitle);
    await expect(report.breadcrumbCurrent).toHaveText(mojazRequestText.pageTitle);
    await expect(report.sidebarLink).toHaveText(mojazRequestText.sidebarLabel);

    await expect(report.vinInput).toBeEditable();
    await expect(report.customerNameInput).toBeEditable();
    await expect(report.customerPhoneInput).toBeEditable();
    await expect(report.exportAllButton).toBeVisible();

    await expect(report.columnHeaders).toHaveText([...mojazRequestText.columnHeaders]);
    await expect(report.summary).toHaveText(
      new RegExp(`^Showing 1-${mojazRequestData.pageSize} of [\\d,]+ items\\.$`),
    );
  });

  test.describe('statuses', () => {
    test('Each status filter shows only that status, and together they cover all requests', async ({
      mojazRequestReportPage: report,
    }) => {
      const total = await report.totalCount();
      let sum = 0;

      for (const status of statuses) {
        await test.step(mojazStatuses[status], async () => {
          await report.gotoStatus(status);
          const shown = (await report.readRows()).map((row) => row.status);
          expect(shown.filter((label) => label !== mojazStatuses[status])).toEqual([]);
          sum += await report.totalCount();
        });
      }

      expect(sum, 'requests across all statuses').toBe(total);
    });

    test('Status filter in the form selects that status', async ({
      mojazRequestReportPage: report,
    }) => {
      await report.filterByStatus('done');

      await expect(report.statusValue).toContainText(mojazStatuses.done);
      const shown = (await report.readRows()).map((row) => row.status);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.filter((label) => label !== mojazStatuses.done)).toEqual([]);
    });

    test('Generated requests link both PDF reports', async ({ mojazRequestReportPage: report }) => {
      await report.gotoStatus('done');
      const rows = await report.readRows();

      const missing = rows.filter(
        (row) =>
          !mojazRequestUrls.reportPdf.test(row.mojazArUrl) ||
          !mojazRequestUrls.reportPdf.test(row.mojazEnUrl),
      );
      expect(missing.map((row) => row.key)).toEqual([]);
    });

    for (const status of ['pending', 'failed'] as const) {
      test(`${mojazStatuses[status]} requests link no report`, async ({
        mojazRequestReportPage: report,
      }) => {
        await report.gotoStatus(status);
        const rows = await report.readRows();
        test.skip(rows.length === 0, `No ${mojazStatuses[status]} request right now.`);

        const withLinks = rows.filter((row) => row.mojazArUrl || row.mojazEnUrl);
        expect(withLinks.map((row) => row.key)).toEqual([]);
      });
    }

    test('A generated report link opens a PDF', async ({
      browser,
      mojazRequestReportPage: report,
    }) => {
      await report.gotoStatus('done');
      const [row] = await report.readRows();

      // The PDFs sit on S3 behind unguessable names, so they open without a Backend session.
      const context = await browser.newContext();
      try {
        const answer = await context.request.fetch(row.mojazEnUrl, { method: 'HEAD' });
        expect(answer.status()).toBe(200);
        expect(answer.headers()['content-type']).toBe('application/pdf');
      } finally {
        await context.close();
      }
    });
  });

  test.describe('rows (every request on the first page)', () => {
    test('Phone numbers are Saudi mobile numbers', async ({ mojazRequestReportPage: report }) => {
      const rows = await report.readRows();

      const malformed = rows.filter((row) => !mojazRequestData.phoneFormat.test(row.customerPhone));
      expect(malformed.map((row) => row.key)).toEqual([]);
    });

    test('Updated At is never before Creation Date', async ({ mojazRequestReportPage: report }) => {
      const rows = await report.readRows();

      expect(rows.filter((row) => row.updatedAt < row.createdAt).map((row) => row.key)).toEqual([]);
    });
  });

  test.describe('filters', () => {
    test('VIN: full, part, and unknown', async ({ mojazRequestReportPage: report }) => {
      const [first] = await report.readRows();

      await test.step('full VIN', async () => {
        await report.searchByVin(first.vin);
        await expect(report.row(first.key)).toHaveCount(1);
        const vins = (await report.readRows()).map((row) => row.vin);
        expect(vins.filter((vin) => vin !== first.vin)).toEqual([]);
      });
      await test.step('part of the VIN', async () => {
        const part = first.vin.slice(0, mojazRequestData.partialVinLength);
        await report.searchByVin(part);
        const vins = (await report.readRows()).map((row) => row.vin);
        expect(vins.filter((vin) => !vin.includes(part))).toEqual([]);
      });
      await test.step('unknown VIN', async () => {
        await report.searchByVin(mojazRequestData.unknownVin);
        await expect(report.emptyMessage).toHaveText(mojazRequestText.noResults);
      });
    });

    test('Customer phone shows only that customer’s requests', async ({
      mojazRequestReportPage: report,
    }) => {
      const [first] = await report.readRows();

      await report.searchByCustomerPhone(first.customerPhone);

      await expect(report.row(first.key)).toHaveCount(1);
      const phones = (await report.readRows()).map((row) => row.customerPhone);
      expect(phones.filter((phone) => phone !== first.customerPhone)).toEqual([]);
    });

    test('Customer name shows only matching customers', async ({
      mojazRequestReportPage: report,
    }) => {
      const [first] = await report.readRows();
      const firstWord = first.customerName.split(' ')[0];

      await report.searchByCustomerName(firstWord);

      await expect(report.row(first.key)).toHaveCount(1);
      const names = (await report.readRows()).map((row) => row.customerName.toLowerCase());
      expect(names.filter((name) => !name.includes(firstWord.toLowerCase()))).toEqual([]);
    });

    test('Creation date range shows requests of that day only', async ({
      mojazRequestReportPage: report,
    }) => {
      const [first] = await report.readRows();
      const day = first.createdAt.slice(0, 10);

      await report.gotoCreatedBetween(day, day);

      await expect(report.row(first.key)).toHaveCount(1);
      const days = (await report.readRows()).map((row) => row.createdAt.slice(0, 10));
      expect(days.filter((shown) => shown !== day)).toEqual([]);
    });

    test('Reset clears the filters', async ({ page, mojazRequestReportPage: report }) => {
      const total = await report.totalCount();
      await report.searchByVin(mojazRequestData.unknownVin);
      await expect(report.emptyMessage).toBeVisible();

      await report.reset();

      await expect(page).toHaveURL(/\/backend\/report\/mojaz-request\/index$/);
      expect(await report.totalCount()).toBe(total);
    });
  });

  test.describe('sorting', () => {
    for (const column of ['Creation Date', 'Updated At'] as const) {
      test(`${column} sorts ascending, then descending`, async ({
        mojazRequestReportPage: report,
      }) => {
        const values = async () =>
          (await report.readRows()).map((row) =>
            column === 'Creation Date' ? row.createdAt : row.updatedAt,
          );

        await report.sortBy(column);
        const ascending = await values();
        expect(ascending).toEqual([...ascending].sort());

        await report.sortBy(column);
        const descending = await values();
        expect(descending).toEqual([...descending].sort().reverse());
      });
    }
  });

  test('Export CSV downloads every request', async ({ mojazRequestReportPage: report }) => {
    test.slow();
    const total = await report.totalCount();

    const download = await report.exportCsv();

    expect(download.suggestedFilename()).toMatch(mojazRequestUrls.csvFileName);
    const content = fs.readFileSync(await download.path(), 'utf8');
    // The file starts with a byte order mark (U+FEFF) for Excel; drop it before parsing.
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const lines = text.split(/\r?\n/).filter(Boolean);
    const fields = (line: string) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]);

    expect(fields(lines[0])).toEqual([...mojazRequestText.csvHeaders]);
    expect(lines.length - 1, 'requests in the CSV').toBe(total);
  });
});
