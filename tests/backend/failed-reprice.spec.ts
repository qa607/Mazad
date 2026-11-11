import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { failedText, failedUrls, pricingRules } from '@test-data/backend-failed.data';
import {
  destructiveSkipReason,
  failedPool,
  probeSkipReason,
} from '@test-data/backend-failed-pool.data';

// Re-pricing from the Failed list. Repricing asks for confirmation and opens the vehicle's pricing
// form; the vehicle only leaves Failed when that form is saved (confirmed 2026-11-11: Ok only
// navigates). The first group is read-only: the form is opened and typed into, never saved. The
// second group really saves, only on the QA-AUTO pool and after explicit approval.
test.use(devRootSession);

const digits = (text: string) => Number(text.replace(/[^\d]/g, '') || 0);

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

test.describe('Backend - Failed List - Re-pricing (read-only)', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, failedPage }) => {
    await failedPage.goto();
    await expect(page).toHaveURL(failedUrls.list);
  });

  test(
    'FL-RPR-01 Repricing opens the vehicle’s pricing form with the item’s current prices',
    { tag: ['@functional'] },
    async ({ page, failedPage, pricingUpdatePage }) => {
      const row = failedPage.rows.first();
      const info = await failedPage.readRow(row);

      await failedPage.startRepricing(row);
      await failedPage.confirmRepricing();

      await expect(page).toHaveURL(failedUrls.pricingUpdate(info.vehicleId));
      await expect(page).toHaveTitle(`${failedText.pricingUpdateTitlePrefix}${info.vehicleTitle}`);
      expect(digits(await pricingUpdatePage.startingPriceInput.inputValue())).toBe(
        info.startingPrice ?? 0,
      );
      expect(digits(await pricingUpdatePage.supplierPriceInput.inputValue())).toBe(
        info.supplierPrice ?? 0,
      );
      await expect(pricingUpdatePage.reservePriceInput).toHaveAttribute('readonly', '');
      await expect(pricingUpdatePage.saveButton).toBeVisible();
    },
  );

  test(
    'FL-RPR-02 The pricing form requires a starting price and refuses one over a billion',
    { tag: ['@functional', '@negative'] },
    async ({ failedPage, pricingUpdatePage }) => {
      const row = failedPage.rows.first();
      await failedPage.startRepricing(row);
      await failedPage.confirmRepricing();
      const saves = pricingUpdatePage.countSaves();

      // Leaving a field validates it; Save is never pressed.
      await pricingUpdatePage.startingPriceInput.fill('');
      await pricingUpdatePage.startingPriceInput.blur();
      await expect(
        pricingUpdatePage.errors.filter({ hasText: pricingRules.startingPriceRequired }),
      ).toHaveCount(1);

      await pricingUpdatePage.fill({ startingPrice: '1000000001' });
      await pricingUpdatePage.startingPriceInput.blur();
      await expect(
        pricingUpdatePage.errors.filter({ hasText: pricingRules.startingPriceTooBig }),
      ).toHaveCount(1);

      expect(saves(), 'nothing is saved').toBe(0);
    },
  );

  test(
    'FL-RPR-03 With "Show Buy Now?" ticked, a buy now price is required',
    { tag: ['@functional', '@negative'] },
    async ({ failedPage, pricingUpdatePage }) => {
      await failedPage.startRepricing(failedPage.rows.first());
      await failedPage.confirmRepricing();
      const saves = pricingUpdatePage.countSaves();

      await pricingUpdatePage.setShowBuyNow(true);
      await pricingUpdatePage.buyNowPriceInput.fill('');
      await pricingUpdatePage.buyNowPriceInput.blur();

      await expect(
        pricingUpdatePage.errors.filter({ hasText: pricingRules.buyNowRequired }),
      ).toHaveCount(1);
      expect(saves(), 'nothing is saved').toBe(0);
    },
  );
});

test.describe(
  'Backend - Failed List - Re-pricing (real save, QA-AUTO pool only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    // A save cannot be undone from here and a retry could save twice: never retried.
    test.describe.configure({ mode: 'default', retries: 0 });

    test(
      'FL-RPR-04 A failed save keeps the vehicle in Failed with its prices unchanged',
      { tag: ['@functional', '@negative'] },
      async ({ page, failedPage, pricingUpdatePage }) => {
        const skip = probeSkipReason('general');
        test.skip(!!skip, skip ?? '');
        test.skip(
          process.env.FAILED_DESTRUCTIVE_APPROVED !== 'true',
          'Needs FAILED_DESTRUCTIVE_APPROVED=true for this run.',
        );
        const vin = failedPool.probes.general;
        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        const info = await failedPage.readRow(row);
        // The save is stopped in the browser, so the server never receives it.
        await page.route('**/vehicle/pricing/update*', (route) =>
          route.request().method() === 'POST' ? route.abort() : route.continue(),
        );

        await failedPage.startRepricing(row);
        await failedPage.confirmRepricing();
        await pricingUpdatePage.fill({ startingPrice: String((info.startingPrice ?? 0) + 100) });
        await pricingUpdatePage.save();

        await page.unroute('**/vehicle/pricing/update*');
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(1);
        await pricingUpdatePage.goto(info.vehicleId);
        expect(digits(await pricingUpdatePage.startingPriceInput.inputValue())).toBe(
          info.startingPrice ?? 0,
        );
      },
    );

    test(
      'FL-RPR-05 Saving the pricing form moves the vehicle from Failed to Pricing Done as RePricing, with the saved prices',
      { tag: ['@functional'] },
      async ({ failedPage, pricingUpdatePage, pricingDonePage }) => {
        const reason = destructiveSkipReason(['reprice']);
        test.skip(!!reason, reason ?? '');
        const vin = failedPool.vehicles.reprice;

        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        await expect(row, `QA-AUTO vehicle ${vin} is in Failed`).toBeVisible();
        const info = await failedPage.readRow(row);
        const newStartingPrice = (info.startingPrice ?? 0) + 100;

        await failedPage.startRepricing(row);
        await failedPage.confirmRepricing();
        await pricingUpdatePage.fill({ startingPrice: String(newStartingPrice) });
        await pricingUpdatePage.save();
        await expect(pricingUpdatePage.errors).toHaveCount(0);

        // Source: gone from Failed, after a reload.
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(0);

        // Destination: in Pricing Done, status RePricing (the application's word for re-priced),
        // with the saved starting price.
        await pricingDonePage.goto();
        await pricingDonePage.searchByVin(vin);
        const done = pricingDonePage.rows.filter({ hasText: vin });
        await expect(done).toHaveCount(1);
        await expect(
          pricingDonePage.statusCells.filter({ hasText: failedText.rePricingStatus }),
        ).toHaveCount(1);
        await expect(pricingDonePage.rowStartingPrice(done)).toContainText(
          newStartingPrice.toLocaleString('en-US'),
        );
      },
    );
  },
);
