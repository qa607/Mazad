import type { Browser, BrowserContext } from '@playwright/test';
import {
  DEV_ROOT_MISSING_REASON,
  SUPPLIER_MISSING_REASON,
  getSupplierAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/supplier.fixture';
import { AuctionSectionPage } from '@pages/backend/auctions/auction-section.page';
import { MazadLoginPage } from '@pages/backend/auth/mazad-login.page';
import { SupplierListPage } from '@pages/backend/suppliers/supplier-list.page';
import { backendUrls } from '@test-data/backend-login.data';
import {
  auctionSections,
  refusedPageText,
  restrictedFinancialText,
} from '@test-data/auction-visibility.data';
import { fillSecret } from '@utils/secret-input';

/**
 * What a supplier sees in the auction sections. Dev Root's view of the same section, filtered
 * by that supplier, is the expected result. Read-only: nothing is priced, edited or exported.
 *
 * Known findings the business accepted (2026-11-08) are not asserted here: the supplier filter
 * is not always pre-set to the supplier, and its dropdown lists other suppliers.
 */

// Signed in with real accounts: no trace, video or screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
// One worker runs the whole file in order, so each account signs in once.
test.describe.configure({ mode: 'default' });

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

let supplierState: StorageState | undefined;
let supplierId = '';

async function newSupplierContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: envConfig.baseURL, storageState: supplierState });
}

test.beforeAll(async ({ browser, devRootSession }) => {
  const account = getSupplierAccount();
  test.skip(!devRootSession, DEV_ROOT_MISSING_REASON);
  test.skip(!account, SUPPLIER_MISSING_REASON);
  if (!devRootSession || !account) return;
  test.setTimeout(3 * 60_000);

  // The supplier's ID, found by its phone in the Supplier List (as Dev Root).
  const admin = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: devRootSession,
  });
  const list = new SupplierListPage(await admin.newPage());
  await list.goto();
  await fillSecret(list.phoneFilter, account.phone);
  await list.search();
  const rows = await list.readRows();
  await admin.close();
  if (rows.length !== 1)
    throw new Error(`Expected one supplier for SUPPLIER_PHONE, found ${rows.length}.`);
  supplierId = rows[0].ID;

  // Sign in as the supplier once and keep the session in memory only. The empty storage state
  // matters: a new context would otherwise inherit the Dev Root session from the fixture.
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const login = new MazadLoginPage(page);
  await login.goto();
  await login.loginAs(account);
  await page.waitForURL(backendUrls.dashboard);
  supplierState = await context.storageState();
  await context.close();
});

for (const section of auctionSections) {
  test.describe(`Supplier view of ${section.name}`, () => {
    /** Rows Dev Root sees for this supplier in this section. */
    let own = new Set<string>();
    /** Details link of one of the supplier's own rows. */
    let ownDetails: string | undefined;
    /** Another supplier with rows in this section: its ID, row keys and one details link. */
    let other: { id: string; rows: string[]; details: string | undefined } | undefined;

    test.beforeAll(async ({ browser, devRootSession }) => {
      test.setTimeout(5 * 60_000);
      const admin = await browser.newContext({
        baseURL: envConfig.baseURL,
        storageState: devRootSession ?? undefined,
      });
      const sectionPage = new AuctionSectionPage(await admin.newPage(), section);
      own = new Set(await sectionPage.allRowIds(supplierId));
      await sectionPage.goto({ supplierId });
      ownDetails = (await sectionPage.viewLinks())[0];
      await sectionPage.goto();
      other = undefined;
      for (const id of (await sectionPage.supplierOptions()).filter((id) => id !== supplierId)) {
        await sectionPage.goto({ supplierId: id });
        const rows = await sectionPage.rowIds();
        if (rows.length) {
          other = { id, rows, details: (await sectionPage.viewLinks())[0] };
          break;
        }
      }
      await admin.close();
    });

    test('Shows only the supplier’s own vehicles, as many as Dev Root sees for it', async ({
      browser,
    }) => {
      const context = await newSupplierContext(browser);
      const sectionPage = new AuctionSectionPage(await context.newPage(), section);
      const seen = await sectionPage.allRowIds();
      await context.close();

      expect(
        seen.filter((id) => !own.has(id)),
        'vehicles of other suppliers',
      ).toEqual([]);
      expect(seen, 'vehicles shown').toHaveLength(own.size);
    });

    test('Shows no reserve price, commission or fee column or wording', async ({ browser }) => {
      const context = await newSupplierContext(browser);
      const sectionPage = new AuctionSectionPage(await context.newPage(), section);
      await sectionPage.goto();
      const headers = await sectionPage.headerTexts();
      const content = await sectionPage.content.innerText();
      await context.close();

      expect(headers.filter((header) => restrictedFinancialText.test(header))).toEqual([]);
      expect(content).not.toMatch(restrictedFinancialText);
    });

    test('Another supplier’s ID in the address bar shows none of its vehicles', async ({
      browser,
    }) => {
      test.skip(!other, `No other supplier has vehicles in ${section.name}.`);
      const context = await newSupplierContext(browser);
      const sectionPage = new AuctionSectionPage(await context.newPage(), section);
      await sectionPage.goto({ supplierId: other?.id });
      const shown = await sectionPage.rowIds();
      await context.close();

      expect(
        shown.filter((id) => !own.has(id)),
        `vehicles of supplier ${other?.id}`,
      ).toEqual([]);
    });

    test('Another supplier’s vehicle details cannot be opened', async ({ browser }) => {
      test.skip(!other?.details, `No other supplier has vehicles in ${section.name}.`);
      const link = other?.details ?? '';
      const context = await newSupplierContext(browser);
      const sectionPage = new AuctionSectionPage(await context.newPage(), section);
      const status = await sectionPage.openDetails(link);
      const body = await sectionPage.body.innerText();
      await context.close();

      expect(status >= 400 || refusedPageText.test(body), `${link} answered ${status}`).toBe(true);
    });

    test('Own vehicle details show no reserve price, commission or fees', async ({ browser }) => {
      test.skip(!ownDetails, `The supplier has no vehicles in ${section.name}.`);
      const link = ownDetails ?? '';
      const context = await newSupplierContext(browser);
      const sectionPage = new AuctionSectionPage(await context.newPage(), section);
      const status = await sectionPage.openDetails(link);
      const content = await sectionPage.content.innerText();
      await context.close();

      expect(status, link).toBe(200);
      expect(content).not.toMatch(restrictedFinancialText);
    });
  });
}
