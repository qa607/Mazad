import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { expect, test } from '@fixtures/test.fixture';
import { gridHeaders, gridRowValues } from '@utils/grid';
import {
  combinedPriceLists,
  sharedPriceColumns,
  staffOnlyPriceColumns,
  staffOnlyPriceText,
  supplierAuctionMenu,
  supplierColumns,
  supplierForbiddenLists,
  supplierOnlyPriceColumn,
  type SupplierList,
} from '@test-data/backend-supplier-prices.data';

// What a supplier sees of prices in the auction lists, signed in with its own account
// (SUPPLIER_PHONE / SUPPLIER_PASSWORD in .env; skipped when not set). A supplier sees
// "Supplier Price" where staff see "Reserve Price" and "Commission", and the prices both see
// must match Dev Root's. Read-only: nothing is changed.

test.use({ signedInAs: 'supplier', trace: 'off', video: 'off', screenshot: 'off' });

const lists = Object.keys(supplierColumns) as SupplierList[];

test.describe('Backend - Supplier price columns', () => {
  test.describe('column headers', () => {
    for (const list of lists) {
      const { label, path, headers } = supplierColumns[list];

      test(`${label}: the supplier sees exactly its own columns`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status(), `${label} HTTP status`).toBe(200);

        expect(await gridHeaders(page)).toEqual([...headers]);
      });
    }

    for (const list of lists) {
      const { label, path } = supplierColumns[list];

      test(`${label}: no Reserve Price or Commission column`, async ({ page }) => {
        await page.goto(path);
        const headers = await gridHeaders(page);

        for (const column of staffOnlyPriceColumns) {
          expect(headers, `${label} shows "${column}"`).not.toContain(column);
        }
      });
    }

    test('Staff see Reserve Price and Commission where the supplier sees Supplier Price', async ({
      browser,
      baseURL,
      page,
    }) => {
      const { path } = supplierColumns.pricingDone;
      await page.goto(path);
      const supplierHeaders = await gridHeaders(page);

      const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
      try {
        const staffPage = await staff.newPage();
        await staffPage.goto(path);
        const staffHeaders = await gridHeaders(staffPage);

        expect(supplierHeaders).toContain(supplierOnlyPriceColumn);
        expect(staffHeaders).not.toContain(supplierOnlyPriceColumn);
        for (const column of staffOnlyPriceColumns) expect(staffHeaders).toContain(column);
      } finally {
        await staff.close();
      }
    });
  });

  test.describe('price values', () => {
    for (const list of ['pricingDone', 'upcoming'] as const) {
      const { label, path } = supplierColumns[list];

      test(`${label}: prices the supplier shares with staff match Dev Root's`, async ({
        browser,
        baseURL,
        page,
      }) => {
        await page.goto(path);
        const own = await gridRowValues(page);
        test.skip(!own, `The supplier has no vehicle in ${label} right now.`);

        const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
        try {
          const staffPage = await staff.newPage();
          // Find the same vehicle in Dev Root's list: search its VIN, then match the row key.
          const vin = (own!.VIN ?? own!['Vin Number'] ?? '').split(/\s+/)[0];
          const form = list === 'pricingDone' ? 'PricingDoneSearch' : 'UpcomingSearch';
          await staffPage.goto(`${path}?${form}%5Bvin_number%5D=${vin}`);
          const staffRow = await gridRowValues(staffPage, own!.key);
          expect(staffRow, `Dev Root does not list vehicle ${own!.key}.`).not.toBeNull();

          for (const column of sharedPriceColumns) {
            expect(own![column], `${label} "${column}" for the supplier`).toBe(staffRow![column]);
          }
          expect(own![supplierOnlyPriceColumn], 'Supplier Price is shown').toBeDefined();
        } finally {
          await staff.close();
        }
      });
    }

    for (const list of Object.keys(combinedPriceLists) as (keyof typeof combinedPriceLists)[]) {
      const { label, path, gridId } = combinedPriceLists[list];

      test(`${label}: the Prices cell shows no reserve price, commission or fees`, async ({
        page,
      }) => {
        const response = await page.goto(path);
        expect(response?.status(), `${label} HTTP status`).toBe(200);
        const rows = page.locator(`#${gridId} tbody tr[data-key]`);
        const rowCount = await rows.count();
        test.skip(rowCount === 0, `The supplier has no vehicle in ${label} right now.`);

        for (const row of await rows.all()) {
          await expect(row).not.toContainText(staffOnlyPriceText);
        }
      });
    }
  });

  test.describe('access', () => {
    for (const { label, path } of supplierForbiddenLists) {
      test(`The supplier cannot open ${label} (403)`, async ({ page }) => {
        const response = await page.goto(path);

        expect(response?.status(), `${label} HTTP status`).toBe(403);
      });
    }

    test('The supplier’s Auctions menu lists only its six lists', async ({ page }) => {
      await page.goto('/backend/site/index');
      const auctionLinks = page.locator('.app-sidebar a[href^="/backend/auction/"]');

      await expect(auctionLinks).toHaveText([...supplierAuctionMenu]);
    });
  });
});
