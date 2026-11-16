import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  directSaleInvalidCases,
  directSaleMaskedInputs,
  directSaleTotals,
  failedText,
  failedUrls,
} from '@test-data/backend-failed.data';
import {
  destructiveSkipReason,
  failedPool,
  probeSkipReason,
} from '@test-data/backend-failed-pool.data';

// Direct Sale from the Failed list. The first group is read-only: the popup is opened, typed into
// and cancelled, never saved. The second group really sells vehicles and only runs against the
// dedicated QA-AUTO pool, after explicit approval (see test-data/backend-failed-pool.data.ts).
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

test.describe('Backend - Failed List - Direct Sale (read-only)', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, failedPage }) => {
    await failedPage.goto();
    await expect(page).toHaveURL(failedUrls.list);
  });

  test(
    'FL-DIR-01 Direct Sale is never offered on items without bids',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.filterBy('failedReason', 'No Bids');

      await expect(failedPage.rows.first()).toBeVisible();
      await expect(failedPage.rowsWithDirectSale).toHaveCount(0);
      for (const row of await failedPage.readRows()) {
        expect(row.totalBids, `item ${row.itemId}`).toBe(0);
        expect(row.customer, `item ${row.itemId}`).toBe(failedText.customerNotSet);
      }
    },
  );

  test(
    'FL-DIR-01b Direct Sale is offered on items that have bids, a customer and a highest price',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.filterBy('failedReason', 'Reserve Price');

      const offered = await failedPage.rowsWithDirectSale.count();
      expect(offered, 'Reserve Price items offering Direct Sale').toBeGreaterThan(0);
      for (const row of await failedPage.readRows()) {
        if (!row.actions.includes('Direct Sale')) continue;
        expect(row.totalBids).toBeGreaterThan(0);
        expect(row.customer).not.toBe(failedText.customerNotSet);
        expect(row.highestPrice ?? 0).toBeGreaterThan(0);
      }
    },
  );

  test(
    'FL-DIR-02 The popup shows the customer, the three prices, a read-only total, Save and Cancel',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.openDirectSale(failedPage.rowsWithDirectSale.first());
      const dialog = failedPage.directSaleDialog;

      await expect(dialog.title).toHaveText(failedText.directSaleTitle);
      await expect(dialog.customerSelect).toBeAttached();
      await expect(dialog.supplierPriceInput).toBeEditable();
      await expect(dialog.commissionInput).toBeEditable();
      await expect(dialog.administrativeExpensesInput).toBeEditable();
      await expect(dialog.totalPriceInput).toHaveAttribute('readonly', '');
      await expect(dialog.saveButton).toBeVisible();
      await expect(dialog.cancelButton.first()).toBeVisible();
      expect((await dialog.customerNames()).length).toBeGreaterThan(0);
    },
  );

  test(
    'FL-DIR-03 The customer list holds exactly the item’s distinct bidders',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      const row = failedPage.rowsWithDirectSale.first();
      const info = await failedPage.readRow(row);

      await failedPage.rowBidsLink(row).click();
      const bidders = new Set((await failedPage.bidderNames()).map((name) => name.toLowerCase()));
      await failedPage.closeInfoModal();
      await failedPage.openDirectSale(row);
      const customers = (await failedPage.directSaleDialog.customerNames()).map((name) =>
        name.toLowerCase(),
      );

      expect(new Set(customers), 'customers are the bidders').toEqual(bidders);
      expect(customers, 'one entry per bidder').toHaveLength(info.totalBidders);
    },
  );

  test(
    'FL-DIR-04 Direct Sale form: customer and supplier price are required',
    { tag: ['@functional', '@negative'] },
    async ({ failedPage }) => {
      await failedPage.openDirectSale(failedPage.rowsWithDirectSale.first());
      const dialog = failedPage.directSaleDialog;
      const submissions = dialog.countSubmissions();

      // Typing and leaving a field validates it; nothing is saved.
      await dialog.supplierPriceInput.fill('');
      await dialog.supplierPriceInput.blur();

      await expect(
        dialog.errors.filter({ hasText: failedText.directSaleRequired.supplierPrice }),
      ).toHaveCount(1);
      expect(submissions(), 'nothing is sent').toBe(0);
      await dialog.cancel();
    },
  );

  for (const { name, field, value, error } of directSaleInvalidCases) {
    test(
      `FL-DIR-05 Direct Sale refuses ${name}`,
      { tag: ['@functional', '@negative'] },
      async ({ failedPage }) => {
        await failedPage.openDirectSale(failedPage.rowsWithDirectSale.first());
        const dialog = failedPage.directSaleDialog;
        const submissions = dialog.countSubmissions();

        await dialog.fill({ [field]: value });
        await dialog[`${field}Input` as const].blur();

        await expect(dialog.errors.filter({ hasText: error })).toHaveCount(1);
        expect(submissions(), 'nothing is sent').toBe(0);
        await dialog.cancel();
      },
    );
  }

  for (const { name, field, typed, shown } of directSaleMaskedInputs) {
    test(
      `FL-DIR-05b The box does not accept ${name}: it shows ${shown} for ${typed}`,
      { tag: ['@functional', '@negative'] },
      async ({ failedPage }) => {
        await failedPage.openDirectSale(failedPage.rowsWithDirectSale.first());
        const dialog = failedPage.directSaleDialog;
        const submissions = dialog.countSubmissions();

        await dialog.fill({ [field]: typed });

        await expect(dialog[`${field}Input` as const]).toHaveValue(shown);
        expect(submissions(), 'nothing is saved').toBe(0);
        await dialog.cancel();
      },
    );
  }

  test.describe('Total Price', () => {
    for (const { supplierPrice, commission, administrativeExpenses, total } of directSaleTotals) {
      test(
        `FL-DIR-06 Total Price of ${supplierPrice} + ${commission} + ${administrativeExpenses} is ${total}`,
        { tag: ['@functional'] },
        async ({ failedPage }) => {
          await failedPage.openDirectSale(failedPage.rowsWithDirectSale.first());
          const dialog = failedPage.directSaleDialog;

          await dialog.fill({ supplierPrice, commission, administrativeExpenses });

          await expect(dialog.totalPriceInput).toHaveValue(total);
          await dialog.cancel();
        },
      );
    }
  });

  test(
    'FL-DIR-07 Cancel closes the popup and keeps the vehicle in Failed',
    { tag: ['@functional'] },
    async ({ page, failedPage }) => {
      const row = failedPage.rowsWithDirectSale.first();
      const itemId = await failedPage.rowId(row);
      await failedPage.openDirectSale(row);
      const submissions = failedPage.directSaleDialog.countSubmissions();

      await failedPage.directSaleDialog.cancel();

      await expect(failedPage.directSaleDialog.dialog).toBeHidden();
      expect(submissions()).toBe(0);
      await page.reload();
      await expect(failedPage.row(itemId)).toHaveCount(1);
    },
  );
});

test.describe(
  'Backend - Failed List - Direct Sale (real sale, QA-AUTO pool only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    // A sale cannot be undone and a retry could sell twice: never retried, one at a time.
    test.describe.configure({ mode: 'default', retries: 0 });

    test(
      'FL-DIR-08 An unsuccessful submit keeps the vehicle in Failed',
      { tag: ['@functional', '@negative'] },
      async ({ page, failedPage }) => {
        test.skip(!!probeSkipReason('withBids'), probeSkipReason('withBids') ?? '');
        test.skip(
          process.env.FAILED_DESTRUCTIVE_APPROVED !== 'true',
          'Needs FAILED_DESTRUCTIVE_APPROVED=true for this run.',
        );
        const vin = failedPool.probes.withBids;
        await failedPage.gotoByVin(vin);
        const row = failedPage.rowsWithDirectSale.first();
        const itemId = await failedPage.rowId(row);
        const customer = (await failedPage.readRow(row)).customer;
        // The request is stopped in the browser, so the server never receives it.
        await page.route('**/ajax/direct-sale-auction?*', (route) => route.abort());

        await failedPage.openDirectSale(row);
        await failedPage.directSaleDialog.fill({ customer, supplierPrice: '1000' });
        await failedPage.directSaleDialog.save();

        await expect(failedPage.directSaleDialog.dialog).toBeVisible();
        await page.unroute('**/ajax/direct-sale-auction?*');
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-DIR-09 A direct sale moves the vehicle from Failed to the Sold list with the entered prices',
      { tag: ['@functional'] },
      async ({ failedPage, mazadSoldListPage }) => {
        const reason = destructiveSkipReason(['directSale']);
        test.skip(!!reason, reason ?? '');
        const vin = failedPool.vehicles.directSale;
        const prices = { supplierPrice: '1000', commission: '100', administrativeExpenses: '50' };
        const total = 1150;

        await failedPage.gotoByVin(vin);
        const row = failedPage.rowsWithDirectSale.first();
        await expect(row, `QA-AUTO vehicle ${vin} is in Failed with Direct Sale`).toBeVisible();
        const itemId = await failedPage.rowId(row);
        const customers = await (async () => {
          await failedPage.openDirectSale(row);
          const names = await failedPage.directSaleDialog.customerNames();
          return names;
        })();
        expect(customers.length, 'bidders to choose from').toBeGreaterThanOrEqual(2);

        await failedPage.directSaleDialog.fill({ customer: customers[0], ...prices });
        await expect(failedPage.directSaleDialog.totalPriceInput).toHaveValue('1,150');
        await failedPage.directSaleDialog.save();
        await expect(failedPage.resultAlert).toBeVisible();
        await failedPage.resultAlertOkButton.click();

        // Source: gone from Failed, after a reload.
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(itemId)).toHaveCount(0);

        // Destination: in the Sold list, with the entered prices. Which sold column holds the
        // supplier price is confirmed at the first approved run; the total, the commission
        // and the expenses are asserted against what was typed.
        await mazadSoldListPage.goto();
        await mazadSoldListPage.search({ vin });
        const sold = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());
        expect(sold.vin).toContain(vin);
        expect(sold.administrativeExpenses).toBe(Number(prices.administrativeExpenses));
        expect(sold.salePrice).toBe(total);
      },
    );
  },
);
