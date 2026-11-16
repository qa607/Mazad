import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type {
  DeliveryTrackingPage,
  TrackingRow,
} from '@pages/backend/delivery/delivery-tracking.page';
import { qaAutoMarker, trackingData, trackingText } from '@test-data/backend-delivery.data';
import { escapeRegExp } from '@utils/text';

// Delivery Tracking filters: VIN, plate, tracking link, delivery company, supplier, location and
// date range, one by one and combined. Expected values are read from the page (never fixed): a
// row's own values drive each search, and counts are only compared with each other.
test.use(devRootSession);

/** Reads the current page and checks it has rows and that every row passes. */
async function everyRowMatches(
  page: DeliveryTrackingPage,
  describe: string,
  predicate: (row: TrackingRow) => boolean,
): Promise<TrackingRow[]> {
  const rows = await page.readRows();
  expect(rows.length, `rows for ${describe}`).toBeGreaterThan(0);
  expect(
    rows.filter((row) => !predicate(row)).map((row) => `${row.key} ${row.vin}`),
    `rows that do not match ${describe}`,
  ).toEqual([]);
  return rows;
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

test.describe('Backend - Delivery Tracking - filters', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ deliveryTrackingPage }) => {
    await deliveryTrackingPage.goto();
  });

  test(
    'TRK-FLT-01 VIN: full, partial and lower case find the vehicle',
    { tag: ['@smoke', '@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      const [first] = await deliveryTrackingPage.readRows();
      const partial = first.vin.slice(0, trackingData.partialVinLength);

      await deliveryTrackingPage.searchBy('vin', first.vin);
      await expect(page).toHaveURL(
        /TrackingDeliveryCompanySearch\[vin_number\]=|TrackingDeliveryCompanySearch%5Bvin_number%5D=/,
      );
      await everyRowMatches(
        deliveryTrackingPage,
        `VIN ${first.vin}`,
        (row) => row.vin === first.vin,
      );

      await deliveryTrackingPage.searchBy('vin', partial);
      await everyRowMatches(deliveryTrackingPage, `VIN containing ${partial}`, (row) =>
        row.vin.toLowerCase().includes(partial.toLowerCase()),
      );

      await deliveryTrackingPage.searchBy('vin', first.vin.toLowerCase());
      await everyRowMatches(
        deliveryTrackingPage,
        'a lower-case VIN',
        (row) => row.vin === first.vin,
      );
    },
  );

  test(
    'TRK-FLT-02 VIN: an unknown VIN shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.searchBy('vin', trackingData.unknownVin);

      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);
    },
  );

  test(
    'TRK-FLT-03 Plate number: full and partial find the vehicle',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      const [first] = await deliveryTrackingPage.readRows();
      const partial = first.plate.slice(0, trackingData.partialPlateLength);

      await deliveryTrackingPage.searchBy('plate', first.plate);
      await everyRowMatches(
        deliveryTrackingPage,
        `plate ${first.plate}`,
        (row) => row.plate === first.plate,
      );

      await deliveryTrackingPage.searchBy('plate', partial);
      await everyRowMatches(deliveryTrackingPage, `plate containing ${partial}`, (row) =>
        row.plate.toLowerCase().includes(partial.toLowerCase()),
      );
    },
  );

  test(
    'TRK-FLT-04 Plate number: an unknown plate shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.searchBy('plate', trackingData.unknownPlate);

      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);
    },
  );

  test(
    'TRK-FLT-05 Tracking link: a text that matches no link shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }, testInfo) => {
      // No tracking link holds a value on staging (every Edit Link popup checked was empty and a
      // search for "http" finds nothing), so a matching search cannot be tested without saving a
      // link, which is not authorized. That scenario is blocked, not skipped.
      testInfo.annotations.push({
        type: 'blocked',
        description: 'Matching tracking-link search needs a saved link: pending separate approval.',
      });

      await deliveryTrackingPage.searchBy('trackingLink', trackingData.unknownTrackingLink);

      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);
    },
  );

  test(
    'TRK-FLT-06 Delivery company: each of the three companies shows only its shipments, and they add up to the total',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      test.slow();
      // QA-AUTO companies created by the automation are offered too but have no shipments.
      const options = (await deliveryTrackingPage.filterOptions('deliveryCompany')).filter(
        (name) => !name.startsWith(qaAutoMarker),
      );
      expect(options).toEqual([...trackingData.deliveryCompanies]);
      const { total: all } = await deliveryTrackingPage.summaryCounts();

      let sum = 0;
      for (const company of options) {
        await deliveryTrackingPage.goto();
        await deliveryTrackingPage.filterBy('deliveryCompany', company);
        await expect(deliveryTrackingPage.selectFilterValue('deliveryCompany')).toContainText(
          company,
        );
        await everyRowMatches(
          deliveryTrackingPage,
          `company ${company}`,
          (row) => row.deliveryCompany === company,
        );
        sum += (await deliveryTrackingPage.summaryCounts()).total;
      }

      expect(sum, 'the three companies together').toBe(all);
    },
  );

  test(
    'TRK-FLT-07 Delivery company: an ID no company has shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.gotoWithFilters({
        delivery_company: trackingData.invalidCompanyId,
      });

      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);
    },
  );

  test(
    'TRK-FLT-08 Supplier: every supplier offered shows only its own shipments',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      test.slow();
      const suppliers = await deliveryTrackingPage.filterOptions('supplier');
      expect(suppliers.length).toBeGreaterThan(0);

      for (const supplier of suppliers) {
        const name = supplier.replace(/ - Supplier$/, '');
        await deliveryTrackingPage.goto();
        await deliveryTrackingPage.filterBy(
          'supplier',
          new RegExp(`^\\s*${escapeRegExp(supplier)}\\s*$`),
        );
        await everyRowMatches(deliveryTrackingPage, `supplier ${name}`, (row) => row.from === name);
      }
    },
  );

  test(
    'TRK-FLT-09 Delivery location: representative cities show only shipments to that city',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      test.slow();
      const cities = await deliveryTrackingPage.filterOptions('location');
      expect(cities.length).toBeGreaterThan(trackingData.sampleCities.length);

      for (const city of trackingData.sampleCities) {
        await deliveryTrackingPage.goto();
        await deliveryTrackingPage.filterBy('location', city);
        await everyRowMatches(deliveryTrackingPage, `city ${city}`, (row) => row.to === city);
      }
    },
  );

  test(
    'TRK-FLT-10 Date of delivery: a custom range shows only deliveries inside it',
    { tag: ['@functional', '@known-bug'] },
    async ({ deliveryTrackingPage }) => {
      // Known defect candidate TD-01 (found 2026-11-11): the date range filter has no effect. The
      // picker fills "yyyy-mm-dd - yyyy-mm-dd" and the URL carries it, but the grid still shows all
      // 81 shipments, including for a range with no delivery in it. Remove test.fail() once the
      // filter works.
      test.fail(true, 'MAZ-8487 (TD-01): the Date of delivery filter does not filter.');

      await deliveryTrackingPage.pickDateRange(10, 12);
      const range = await deliveryTrackingPage.dateRangeValue.inputValue();
      const [from, to] = range.split(' - ');
      await deliveryTrackingPage.search();

      const rows = await deliveryTrackingPage.readRows();
      for (const row of rows) {
        const day = row.deliveryDate.slice(0, 10);
        expect(day >= from && day <= to, `delivery ${day} is inside ${range}`).toBe(true);
      }
    },
  );

  test(
    'TRK-FLT-11 Date of delivery: a range of exactly one day includes that day’s deliveries and no others (boundary)',
    { tag: ['@functional', '@known-bug'] },
    async ({ deliveryTrackingPage }) => {
      test.fail(true, 'MAZ-8487 (TD-01): the Date of delivery filter does not filter.');
      const [first] = await deliveryTrackingPage.readRows();
      const day = first.deliveryDate.slice(0, 10);

      await deliveryTrackingPage.gotoWithFilters({ date_range: `${day} - ${day}` });

      const rows = await deliveryTrackingPage.readRows();
      expect(rows.map((row) => row.key)).toContain(first.key);
      expect(rows.filter((row) => row.deliveryDate.slice(0, 10) !== day)).toEqual([]);
    },
  );

  test(
    'TRK-FLT-12 Combined filters: company and city together, and a mismatching pair finds nothing',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      const [first] = await deliveryTrackingPage.readRows();

      await deliveryTrackingPage.chooseFilter('deliveryCompany', first.deliveryCompany);
      await deliveryTrackingPage.chooseFilter('location', first.to);
      await deliveryTrackingPage.search();
      await everyRowMatches(
        deliveryTrackingPage,
        `${first.deliveryCompany} + ${first.to}`,
        (row) => row.deliveryCompany === first.deliveryCompany && row.to === first.to,
      );
      await expect(deliveryTrackingPage.rows.filter({ hasText: first.vin })).toHaveCount(1);

      await deliveryTrackingPage.gotoWithFilters({
        vin_number: first.vin,
        delivery_company: trackingData.invalidCompanyId,
      });
      await expect(deliveryTrackingPage.emptyMessage).toHaveText(trackingText.noResults);
    },
  );

  test(
    'TRK-FLT-13 Clearing one filter and searching again widens the result',
    { tag: ['@functional'] },
    async ({ deliveryTrackingPage }) => {
      const [first] = await deliveryTrackingPage.readRows();
      const { total: all } = await deliveryTrackingPage.summaryCounts();
      await deliveryTrackingPage.chooseFilter('deliveryCompany', first.deliveryCompany);
      await deliveryTrackingPage.fillFilter('vin', first.vin);
      await deliveryTrackingPage.search();
      const narrow = (await deliveryTrackingPage.summaryCounts()).total;

      await deliveryTrackingPage.fillFilter('vin', '');
      await deliveryTrackingPage.search();

      const wider = (await deliveryTrackingPage.summaryCounts()).total;
      expect(wider).toBeGreaterThan(narrow);
      expect(wider).toBeLessThanOrEqual(all);
    },
  );

  test(
    'TRK-FLT-14 Reset clears every filter and restores the full list',
    { tag: ['@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      const { total } = await deliveryTrackingPage.summaryCounts();
      await deliveryTrackingPage.chooseFilter('deliveryCompany', trackingData.deliveryCompanies[0]);
      await deliveryTrackingPage.fillFilter('vin', trackingData.unknownVin);
      await deliveryTrackingPage.search();
      await expect(deliveryTrackingPage.emptyMessage).toBeVisible();

      await deliveryTrackingPage.reset();

      await expect(page).toHaveURL(/\/delivery-company\/tracking$/);
      await expect(deliveryTrackingPage.textFilter('vin')).toHaveValue('');
      await expect(deliveryTrackingPage.selectFilterValue('deliveryCompany')).not.toContainText(
        trackingData.deliveryCompanies[0],
      );
      expect((await deliveryTrackingPage.summaryCounts()).total).toBe(total);
    },
  );

  test(
    'TRK-FLT-15 A filter stays active when moving to the next page',
    { tag: ['@functional'] },
    async ({ page, deliveryTrackingPage }) => {
      let chosen = '';
      for (const company of trackingData.deliveryCompanies) {
        await deliveryTrackingPage.goto();
        await deliveryTrackingPage.filterBy('deliveryCompany', company);
        if ((await deliveryTrackingPage.summaryCounts()).total > trackingData.pageSize) {
          chosen = company;
          break;
        }
      }
      test.skip(chosen === '', 'No delivery company has more than one page of shipments.');

      await deliveryTrackingPage.goToPage(2);

      await expect(page).toHaveURL(/[?&]page=2(&|$)/);
      await expect(page).toHaveURL(/delivery_company\]=\d+|delivery_company%5D=\d+/);
      await expect(deliveryTrackingPage.selectFilterValue('deliveryCompany')).toContainText(chosen);
      await everyRowMatches(
        deliveryTrackingPage,
        `${chosen} on page 2`,
        (row) => row.deliveryCompany === chosen,
      );
    },
  );
});
