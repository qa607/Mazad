import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { arabicLetters } from '@test-data/backend-failed.data';
import { trackingData, trackingText } from '@test-data/backend-delivery.data';

// Delivery Companies → Tracking ("Tracking Companies Section"): page, columns and rows, read-only,
// as Dev Root. The grid has no counts fixed in this file: totals are read from the page.
test.use(devRootSession);

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

test.describe('Backend - Delivery Tracking - page and rows', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ deliveryTrackingPage }) => {
    await deliveryTrackingPage.goto();
  });

  test(
    'TRK-LIST-01 Page shows the title, heading, breadcrumb and sidebar link',
    { tag: ['@smoke', '@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      await expect(page).toHaveTitle(trackingText.pageTitle);
      await expect(deliveryTrackingPage.pageHeading).toHaveText(trackingText.pageTitle);
      await expect(deliveryTrackingPage.breadcrumbCurrent).toHaveText(trackingText.pageTitle);
      await expect(deliveryTrackingPage.sidebarLink).toHaveCount(1);
    },
  );

  test(
    'TRK-LIST-02 Page shows the seven columns, all seven filters and a full first page',
    { tag: ['@smoke', '@functional'] },
    async ({ deliveryTrackingPage }) => {
      await expect(deliveryTrackingPage.columnHeaders).toHaveText([...trackingText.columnHeaders]);

      for (const filter of ['vin', 'plate', 'trackingLink'] as const) {
        await expect(deliveryTrackingPage.textFilter(filter), `${filter} filter`).toBeEditable();
      }
      for (const filter of ['deliveryCompany', 'supplier', 'location'] as const) {
        await expect(deliveryTrackingPage.selectFilter(filter), `${filter} filter`).toBeAttached();
      }
      await expect(deliveryTrackingPage.dateRangeInput).toBeVisible();
      await expect(deliveryTrackingPage.searchButton).toBeEnabled();
      await expect(deliveryTrackingPage.resetButton).toBeVisible();

      const { total } = await deliveryTrackingPage.summaryCounts();
      await expect(deliveryTrackingPage.summary).toHaveText(
        new RegExp(`^Showing 1-${Math.min(total, trackingData.pageSize)} of ${total} items?[.]$`),
      );
      await expect(deliveryTrackingPage.rows).toHaveCount(Math.min(total, trackingData.pageSize));
    },
  );

  test(
    'TRK-LIST-03 Every row has a VIN, plate, Edit Link, a known delivery company, supplier, city and date',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      const rows = await deliveryTrackingPage.readRows();
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        expect(row.vin, `row ${row.key} VIN`).not.toBe('');
        expect(row.plate, `row ${row.key} plate`).not.toBe('');
        expect(row.trackingLink, `row ${row.key} link cell`).toBe(trackingText.editLink);
        expect(
          trackingData.deliveryCompanies as readonly string[],
          `row ${row.key} company`,
        ).toContain(row.deliveryCompany);
        expect(row.from, `row ${row.key} supplier`).not.toBe('');
        expect(row.to, `row ${row.key} city`).not.toBe('');
        expect(row.deliveryDate, `row ${row.key} date`).toMatch(
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        );
      }
    },
  );

  test(
    'TRK-LIST-04 Arabic supplier names show in the From column',
    { tag: ['@functional', '@ui'] },
    async ({ deliveryTrackingPage }) => {
      const suppliers = (await deliveryTrackingPage.readRows()).map((row) => row.from);

      expect(suppliers.some((name) => arabicLetters.test(name))).toBe(true);
    },
  );

  test(
    'TRK-LIST-05 The delivery company link opens that company’s page in a new tab',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      const row = deliveryTrackingPage.rows.first();
      const [info] = await deliveryTrackingPage.readRows();

      const tab = await deliveryTrackingPage.openInNewTab(deliveryTrackingPage.companyLink(row));

      await expect(tab).toHaveURL(/\/delivery-company\/view\?id=\d+$/);
      await expect(tab).toHaveTitle(info.deliveryCompany);
      await tab.close();
    },
  );

  test(
    'TRK-LIST-06 A search with no match shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.searchBy('vin', trackingData.unknownVin);

      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);
      await expect(deliveryTrackingPage.rows).toHaveCount(0);
      await expect(deliveryTrackingPage.summary).toHaveCount(0);
    },
  );

  test(
    'TRK-LIST-07 The same rows show after a refresh',
    { tag: ['@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      const before = await deliveryTrackingPage.rowIds();

      await page.reload();

      expect(await deliveryTrackingPage.rowIds()).toEqual(before);
    },
  );
});
