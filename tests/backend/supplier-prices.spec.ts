import type { Page } from '@playwright/test';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
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

test.use({ ...devRootSession, signedInAs: 'supplier' });

const lists = Object.keys(supplierColumns) as SupplierList[];
type CombinedList = keyof typeof combinedPriceLists;

/** The list page object of an auction list, for the given tab. */
const listPage = (pages: BackendPages, list: SupplierList | CombinedList) =>
  ({
    readyForPricing: pages.readyForPricingPage,
    pricingDone: pages.pricingDonePage,
    upcoming: pages.upcomingPage,
    awaiting: pages.awaitingPage,
    live: pages.livePage,
    waitingApproval: pages.waitingApprovalPage,
  })[list];

/** Opens a list page object and returns the server's status for it. */
async function openList(pagesOn: (tab: Page) => BackendPages, tab: Page, list: SupplierList) {
  const response = tab.waitForResponse((r) => r.url().endsWith(supplierColumns[list].path));
  await listPage(pagesOn(tab), list).goto();
  return (await response).status();
}

test.describe('Backend - Supplier price columns', { tag: '@regression' }, () => {
  test.describe('column headers', () => {
    for (const list of lists) {
      const { label, headers } = supplierColumns[list];

      test(
        `${label}: the supplier sees exactly its own columns`,
        { tag: '@functional' },
        async ({ page, pagesOn }) => {
          expect(await openList(pagesOn, page, list), `${label} HTTP status`).toBe(200);

          expect(await listPage(pagesOn(page), list).headerLabels()).toEqual([...headers]);
        },
      );
    }

    for (const list of lists) {
      const { label } = supplierColumns[list];

      test(
        `${label}: no Reserve Price or Commission column`,
        { tag: '@negative' },
        async ({ page, pagesOn }) => {
          expect(await openList(pagesOn, page, list), `${label} HTTP status`).toBe(200);
          const headers = await listPage(pagesOn(page), list).headerLabels();

          for (const column of staffOnlyPriceColumns) {
            expect(headers, `${label} shows "${column}"`).not.toContain(column);
          }
        },
      );
    }

    test(
      'Staff see Reserve Price and Commission where the supplier sees Supplier Price',
      { tag: '@functional' },
      async ({ browser, baseURL, pagesOn, pricingDonePage }) => {
        await pricingDonePage.goto();
        const supplierHeaders = await pricingDonePage.headerLabels();

        const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
        try {
          const staffList = pagesOn(await staff.newPage()).pricingDonePage;
          await staffList.goto();
          const staffHeaders = await staffList.headerLabels();

          expect(supplierHeaders).toContain(supplierOnlyPriceColumn);
          expect(staffHeaders).not.toContain(supplierOnlyPriceColumn);
          for (const column of staffOnlyPriceColumns) expect(staffHeaders).toContain(column);
        } finally {
          await staff.close();
        }
      },
    );
  });

  test.describe('price values', () => {
    for (const list of ['pricingDone', 'upcoming'] as const) {
      const { label, vinFilter } = supplierColumns[list];

      test(
        `${label}: prices the supplier shares with staff match Dev Root's`,
        { tag: '@functional' },
        async ({ browser, baseURL, page, pagesOn }) => {
          expect(await openList(pagesOn, page, list), `${label} HTTP status`).toBe(200);
          const own = await listPage(pagesOn(page), list).rowValues();
          test.skip(!own, `The supplier has no vehicle in ${label} right now.`);

          const staff = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
          try {
            const staffList = listPage(pagesOn(await staff.newPage()), list);
            // Find the same vehicle in Dev Root's list: search its VIN, then match the row key.
            const vin = (own!.VIN ?? own!['Vin Number'] ?? '').split(/\s+/)[0];
            await staffList.gotoWithQuery({ [vinFilter]: vin });
            const staffRow = await staffList.rowValues(own!.key);
            expect(staffRow, `Dev Root does not list vehicle ${own!.key}.`).not.toBeNull();

            for (const column of sharedPriceColumns) {
              expect(own![column], `${label} "${column}" for the supplier`).toBe(staffRow![column]);
            }
            expect(own![supplierOnlyPriceColumn], 'Supplier Price is shown').toBeDefined();
          } finally {
            await staff.close();
          }
        },
      );
    }

    for (const list of Object.keys(combinedPriceLists) as CombinedList[]) {
      const { label, path } = combinedPriceLists[list];

      test(
        `${label}: the Prices cell shows no reserve price, commission or fees`,
        { tag: '@negative' },
        async ({ page, pagesOn }) => {
          const response = await page.goto(path);
          expect(response?.status(), `${label} HTTP status`).toBe(200);
          const rows = listPage(pagesOn(page), list).rows;
          const rowCount = await rows.count();
          test.skip(rowCount === 0, `The supplier has no vehicle in ${label} right now.`);

          for (const row of await rows.all()) {
            await expect(row).not.toContainText(staffOnlyPriceText);
          }
        },
      );
    }
  });

  test.describe('access', () => {
    for (const { label, path } of supplierForbiddenLists) {
      test(`The supplier cannot open ${label} (403)`, { tag: '@negative' }, async ({ page }) => {
        const response = await page.goto(path);

        expect(response?.status(), `${label} HTTP status`).toBe(403);
      });
    }

    test(
      'The supplier’s Auctions menu lists only its six lists',
      { tag: '@functional' },
      async ({ mazadDashboardPage }) => {
        await mazadDashboardPage.goto();

        await expect(mazadDashboardPage.sidebarLinksUnder('/backend/auction/')).toHaveText([
          ...supplierAuctionMenu,
        ]);
      },
    );
  });
});
