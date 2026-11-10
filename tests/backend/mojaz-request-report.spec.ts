import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { parseCsv } from '@utils/csv';
import { readTextAndDelete } from '@utils/files';
import {
  type MojazStatus,
  mojazRequestData,
  mojazRequestText,
  mojazRequestUrls,
  mojazStatuses,
} from '@test-data/backend-mojaz-request-report.data';

// Report > Request Mojaz (/backend/report/mojaz-request/index): customers' requests for a Mojaz
// vehicle-history report, with links to the generated PDFs. Read-only. The grid holds customer
// names and phone numbers, so test titles never include them.

test.use(devRootSession);

const statuses = Object.keys(mojazStatuses) as MojazStatus[];

test.describe('Backend - Request Mojaz report', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, mojazRequestReportPage }) => {
    await mojazRequestReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(mojazRequestUrls.list);
  });

  test(
    'Report shows the heading, filters and the requests grid',
    { tag: ['@smoke', '@functional'] },
    async ({ page, mojazRequestReportPage: report }) => {
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
    },
  );

  test.describe('statuses', () => {
    test(
      'Each status filter shows only that status, and together they cover all requests',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
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
      },
    );

    test(
      'Status filter in the form selects that status',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        await report.filterByStatus('done');

        await expect(report.statusValue).toContainText(mojazStatuses.done);
        const shown = (await report.readRows()).map((row) => row.status);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.filter((label) => label !== mojazStatuses.done)).toEqual([]);
      },
    );

    test(
      'Generated requests link both PDF reports',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        await report.gotoStatus('done');
        const rows = await report.readRows();

        const missing = rows.filter(
          (row) =>
            !mojazRequestUrls.reportPdf.test(row.mojazArUrl) ||
            !mojazRequestUrls.reportPdf.test(row.mojazEnUrl),
        );
        expect(missing.map((row) => row.key)).toEqual([]);
      },
    );

    for (const status of ['pending', 'failed'] as const) {
      test(
        `${mojazStatuses[status]} requests link no report`,
        { tag: '@functional' },
        async ({ mojazRequestReportPage: report }) => {
          await report.gotoStatus(status);
          const rows = await report.readRows();
          test.skip(rows.length === 0, `No ${mojazStatuses[status]} request right now.`);

          const withLinks = rows.filter((row) => row.mojazArUrl || row.mojazEnUrl);
          expect(withLinks.map((row) => row.key)).toEqual([]);
        },
      );
    }

    test(
      'A generated report link opens a PDF',
      { tag: '@functional' },
      async ({ browser, mojazRequestReportPage: report }) => {
        await report.gotoStatus('done');
        const [row] = await report.readRows();
        test.skip(!row, 'No Generated request right now.');

        // The PDFs sit on S3 behind unguessable names, so they open without a Backend session.
        const context = await browser.newContext();
        try {
          const answer = await context.request.fetch(row.mojazEnUrl, { method: 'HEAD' });
          expect(answer.status()).toBe(200);
          expect(answer.headers()['content-type']).toBe('application/pdf');
        } finally {
          await context.close();
        }
      },
    );
  });

  test.describe('rows (every request on the first page)', () => {
    test(
      'Phone numbers are Saudi mobile numbers',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        const rows = await report.readRows();

        const malformed = rows.filter(
          (row) => !mojazRequestData.phoneFormat.test(row.customerPhone),
        );
        expect(malformed.map((row) => row.key)).toEqual([]);
      },
    );

    test(
      'Updated At is never before Creation Date',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        const rows = await report.readRows();

        expect(rows.filter((row) => row.updatedAt < row.createdAt).map((row) => row.key)).toEqual(
          [],
        );
      },
    );
  });

  test.describe('filters', () => {
    test(
      'VIN: full, part, and unknown',
      { tag: '@negative' },
      async ({ mojazRequestReportPage: report }) => {
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
      },
    );

    test(
      'Customer phone shows only that customer’s requests',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        const [first] = await report.readRows();

        await report.searchByCustomerPhone(first.customerPhone);

        await expect(report.row(first.key)).toHaveCount(1);
        const phones = (await report.readRows()).map((row) => row.customerPhone);
        expect(phones.filter((phone) => phone !== first.customerPhone)).toEqual([]);
      },
    );

    test(
      'Customer name shows only matching customers',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        const [first] = await report.readRows();
        const firstWord = first.customerName.split(' ')[0];

        await report.searchByCustomerName(firstWord);

        await expect(report.row(first.key)).toHaveCount(1);
        const names = (await report.readRows()).map((row) => row.customerName.toLowerCase());
        expect(names.filter((name) => !name.includes(firstWord.toLowerCase()))).toEqual([]);
      },
    );

    test(
      'Creation date range shows requests of that day only',
      { tag: '@functional' },
      async ({ mojazRequestReportPage: report }) => {
        const [first] = await report.readRows();
        const day = first.createdAt.slice(0, 10);

        await report.gotoCreatedBetween(day, day);

        await expect(report.row(first.key)).toHaveCount(1);
        const days = (await report.readRows()).map((row) => row.createdAt.slice(0, 10));
        expect(days.filter((shown) => shown !== day)).toEqual([]);
      },
    );

    test(
      'Reset clears the filters',
      { tag: '@functional' },
      async ({ page, mojazRequestReportPage: report }) => {
        const total = await report.totalCount();
        await report.searchByVin(mojazRequestData.unknownVin);
        await expect(report.emptyMessage).toBeVisible();

        await report.reset();

        await expect(page).toHaveURL(/\/backend\/report\/mojaz-request\/index$/);
        expect(await report.totalCount()).toBe(total);
      },
    );
  });

  test.describe('sorting', () => {
    for (const column of ['Creation Date', 'Updated At'] as const) {
      test(
        `${column} sorts ascending, then descending`,
        { tag: '@functional' },
        async ({ mojazRequestReportPage: report }) => {
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
        },
      );
    }
  });

  test(
    'Export CSV downloads every request',
    { tag: '@functional' },
    async ({ mojazRequestReportPage: report }) => {
      test.slow();
      const total = await report.totalCount();

      const download = await report.exportCsv();

      expect(download.suggestedFilename()).toMatch(mojazRequestUrls.csvFileName);
      // The file holds customer names and phones: it is read, then deleted at once.
      const [headers, ...records] = parseCsv(readTextAndDelete(await download.path()));

      expect(headers).toEqual([...mojazRequestText.csvHeaders]);
      expect(records.length, 'requests in the CSV').toBe(total);
    },
  );
});
