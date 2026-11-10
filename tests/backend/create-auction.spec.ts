import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { expect, test } from '@fixtures/test.fixture';
import { AwaitingPage } from '@pages/backend/auctions/awaiting.page';
import {
  type BidType,
  SupplierAuctionInfoPage,
} from '@pages/backend/suppliers/supplier-auction-info.page';
import {
  createAuctionDateFormat,
  createAuctionText,
  upcomingUrls,
} from '@test-data/backend-upcoming.data';

// Create Auction wizard (/backend/auction/upcoming/create), reached from the Upcoming list.
// The wizard tests stop before the final submit, or press Create Auction with no vehicle
// selected, which the page refuses without sending anything. One round-trip test really creates
// an auction with one vehicle, then moves the vehicle back to Upcoming (see "create and undo").

// Pages open already signed in as Dev Root (logged in once per run by auth.setup.ts).
test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

// One worker, in order: the round trip briefly takes a vehicle out of Upcoming, and the wizard
// tests read that same vehicle.
test.describe.configure({ mode: 'default' });

/** "MR2BE9B36R0064815 #F1" -> "MR2BE9B36R0064815" (some grids append a file suffix). */
function baseVin(cellText: string): string {
  return cellText.trim().split(/\s+/)[0];
}

test.describe('Backend - Create Auction wizard', { tag: '@regression' }, () => {
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

  test.describe('step 1: configuration', () => {
    test.beforeEach(async ({ page, createAuctionPage }) => {
      await createAuctionPage.goto();
      // A redirect to the login page here means the saved session was rejected or has expired.
      await expect(page).toHaveURL(upcomingUrls.createAuction);
    });

    test(
      'Wizard opens at the configuration step, with Select Cars locked',
      { tag: '@functional' },
      async ({ page, createAuctionPage }) => {
        await expect(page).toHaveTitle(createAuctionText.pageTitle);
        await expect(createAuctionPage.pageHeading).toHaveText(createAuctionText.pageTitle);
        await expect(createAuctionPage.step1Tab).toHaveText(createAuctionText.stepTitles[0]);
        await expect(createAuctionPage.step2Tab).toHaveText(createAuctionText.stepTitles[1]);
        await expect(createAuctionPage.step2Tab).toHaveClass(/\bstep-locked\b/);

        await expect(createAuctionPage.titleInput).toBeEditable();
        await expect(createAuctionPage.nextButton).toBeVisible();
        await expect(createAuctionPage.cancelLink).toBeVisible();
        await expect(createAuctionPage.createAuctionButton).toBeHidden();
        await expect(createAuctionPage.backToConfigurationButton).toBeHidden();
      },
    );

    test(
      'Next with an empty configuration shows the required fields and sends nothing',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        const submissions = createAuctionPage.countCreateSubmissions();

        await createAuctionPage.nextButton.click();

        for (const [inputId, message] of Object.entries(createAuctionText.requiredFieldErrors)) {
          await expect(createAuctionPage.fieldError(inputId)).toHaveText(message);
        }
        await expect(createAuctionPage.visibleErrors).toHaveCount(
          Object.keys(createAuctionText.requiredFieldErrors).length,
        );
        await expect(createAuctionPage.nextButton).toBeVisible();
        await expect(createAuctionPage.backToConfigurationButton).toBeHidden();
        expect(submissions()).toBe(0);
      },
    );

    test(
      'Featured Auction shows the featured settings, and Normal Auction hides them',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await expect(createAuctionPage.featuredTypeSelect).toBeHidden();

        await createAuctionPage.chooseAuctionType('Featured Auction');

        await expect(createAuctionPage.featuredTypeSelect).toBeVisible();
        await expect(createAuctionPage.featuredAboutInput).toBeVisible();

        await createAuctionPage.chooseAuctionType('Normal Auction');

        await expect(createAuctionPage.featuredTypeSelect).toBeHidden();
        await expect(createAuctionPage.featuredAboutInput).toBeHidden();
      },
    );

    test(
      'Calendar fills the date fields as yyyy-mm-dd',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.pickDate(createAuctionPage.startDateInput, 1, 10);
        await createAuctionPage.pickDate(createAuctionPage.endDateInput, 1, 11);

        await expect(createAuctionPage.startDateInput).toHaveValue(createAuctionDateFormat);
        await expect(createAuctionPage.endDateInput).toHaveValue(createAuctionDateFormat);
        const start = await createAuctionPage.startDateInput.inputValue();
        const end = await createAuctionPage.endDateInput.inputValue();
        expect(end > start, 'end date after start date').toBe(true);
      },
    );

    test(
      'Next refuses an end date before the start date',
      { tag: ['@negative', '@known-bug'] },
      async ({ createAuctionPage }) => {
        // Known gap (found 2026-11-09): step 1 does not check the dates, so Next moves on with an
        // end date before the start date (also with a same-day earlier end time, or a start date
        // typed in the past). Whether the server refuses them on submit is not verified, since
        // that needs a real submit. Remove test.fail() once step 1 rejects the order.
        test.fail(
          true,
          'BUG-PENDING: Known gap: step 1 accepts an end date before the start date.',
        );

        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          startDay: 20,
          endDay: 19,
        });

        await createAuctionPage.nextButton.click();

        await expect(createAuctionPage.visibleErrors).not.toHaveCount(0);
        await expect(createAuctionPage.backToConfigurationButton).toBeHidden();
      },
    );

    test(
      'Next refuses a title longer than 45 characters',
      { tag: '@negative' },
      async ({ createAuctionPage }) => {
        const tooLong = 'Q'.repeat(createAuctionText.titleMaxLength + 1);

        await createAuctionPage.fillConfiguration({ title: tooLong, startDay: 10, endDay: 11 });
        await createAuctionPage.nextButton.click();

        await expect(createAuctionPage.fieldError('auction-title')).toHaveText(
          createAuctionText.titleTooLong,
        );
        await expect(createAuctionPage.backToConfigurationButton).toBeHidden();
      },
    );

    test(
      'Next accepts a title of exactly 45 characters',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        const longest = 'Q'.repeat(createAuctionText.titleMaxLength);

        await createAuctionPage.fillConfiguration({ title: longest, startDay: 10, endDay: 11 });
        await createAuctionPage.goToSelectCars();

        await expect(createAuctionPage.fieldError('auction-title')).toBeHidden();
      },
    );

    test(
      'Cancel returns to the Upcoming list',
      { tag: '@functional' },
      async ({ page, createAuctionPage }) => {
        await createAuctionPage.titleInput.fill(createAuctionText.probeTitle);

        await createAuctionPage.cancelLink.click();

        await expect(page).toHaveURL(upcomingUrls.list);
      },
    );
  });

  test.describe('step 2: select cars', () => {
    /** A priced Upcoming vehicle and its supplier, read from the Upcoming list. */
    let vehicle: { vin: string; supplier: string };

    test.beforeEach(async ({ upcomingPage, createAuctionPage }) => {
      // The highest-priced Upcoming vehicle: only priced vehicles are offered for an auction.
      await upcomingPage.gotoSortedByStartingPriceDesc();
      const row = upcomingPage.rows.first();
      await expect(row, 'No vehicle in the Upcoming list to build an auction from.').toBeVisible();
      vehicle = {
        vin: baseVin(await upcomingPage.rowVin(row).innerText()),
        supplier: (await upcomingPage.rowSupplier(row).innerText()).trim(),
      };
      await createAuctionPage.goto();
    });

    test(
      'Without a supplier, Select Cars asks for one',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          startDay: 10,
          endDay: 11,
        });

        await createAuctionPage.goToSelectCars();

        await expect(createAuctionPage.noSupplierMessage).toBeVisible();
        await expect(createAuctionPage.vehicleRows).toHaveCount(0);
      },
    );

    test(
      'With a supplier, Select Cars lists that supplier’s upcoming vehicles',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: vehicle.supplier,
          startDay: 10,
          endDay: 11,
        });

        await createAuctionPage.goToSelectCars();

        await expect(createAuctionPage.step2Tab).toHaveClass(/\bactive\b/);
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);
        const rowCount = await createAuctionPage.vehicleRows.count();
        await expect(createAuctionPage.totalVehicleCount).toHaveText(String(rowCount));
        await expect(createAuctionPage.vehicleCheckboxes.first()).not.toBeChecked();
      },
    );

    test(
      'VIN filter narrows the vehicles, and Reset shows them all again',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: vehicle.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);
        const allCount = await createAuctionPage.vehicleRows.count();

        await createAuctionPage.filterVehiclesByVin(vehicle.vin);

        await expect(createAuctionPage.vehicleRows).toHaveCount(1);
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);

        await createAuctionPage.filterResetButton.click();

        await expect(createAuctionPage.vinFilterInput).toHaveValue('');
        await expect(createAuctionPage.vehicleRows).toHaveCount(allCount);
      },
    );

    test(
      'Select All selects every listed vehicle',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: vehicle.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);

        await createAuctionPage.selectAllButton.click();

        for (const checkbox of await createAuctionPage.vehicleCheckboxes.all()) {
          await expect(checkbox).toBeChecked();
        }
      },
    );

    test(
      'Create Auction with no vehicle selected is refused, and nothing is sent',
      { tag: '@negative' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: vehicle.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);
        const submissions = createAuctionPage.countCreateSubmissions();

        await createAuctionPage.createAuctionButton.click();

        await expect(createAuctionPage.alertTitle).toHaveText(
          createAuctionText.selectionRequiredTitle,
        );
        await expect(createAuctionPage.alert).toContainText(
          createAuctionText.selectionRequiredMessage,
        );
        expect(submissions()).toBe(0);
      },
    );

    test(
      'Car Source switches the list between upcoming and failed vehicles',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: vehicle.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);

        await createAuctionPage.chooseCarSource('Failed');

        // An upcoming vehicle is never also a failed one.
        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(0);

        await createAuctionPage.chooseCarSource('Upcoming');

        await expect(createAuctionPage.vehicleRow(vehicle.vin)).toHaveCount(1);
      },
    );

    test(
      'Back to Configuration returns to step 1 and keeps what was entered',
      { tag: '@functional' },
      async ({ createAuctionPage }) => {
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: vehicle.supplier,
          startDay: 10,
          endDay: 11,
        });
        const startDate = await createAuctionPage.startDateInput.inputValue();
        await createAuctionPage.goToSelectCars();

        await createAuctionPage.backToConfigurationButton.click();

        await expect(createAuctionPage.nextButton).toBeVisible();
        await expect(createAuctionPage.titleInput).toHaveValue(createAuctionText.probeTitle);
        await expect(createAuctionPage.startDateInput).toHaveValue(startDate);
        await expect(createAuctionPage.supplierValue).toContainText(vehicle.supplier);
      },
    );
  });

  test.describe('create and undo', () => {
    // Really creates an auction on staging with one vehicle, starting two months ahead so it never
    // goes live, then moves the vehicle back to Upcoming so staging ends as it started (the
    // emptied auction record stays). Never retried: a retry would create a second auction.
    test.describe.configure({ retries: 0 });

    /** VIN of a vehicle the test put in an auction and has not yet moved back. */
    let pendingRestore: string | null = null;

    // If the test fails after creating the auction, move the vehicle back to Upcoming. It uses
    // its own browser context, so it still runs when the test's page was closed mid-run.
    test.afterEach(async ({ browser, baseURL }) => {
      if (!pendingRestore) return;
      const vin = pendingRestore;
      pendingRestore = null;
      const context = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
      try {
        const awaitingPage = new AwaitingPage(await context.newPage());
        await awaitingPage.goto();
        if ((await awaitingPage.rowByVin(vin).count()) === 0) return;
        await awaitingPage.backToUpcoming(vin);
      } finally {
        await context.close();
      }
    });

    test(
      'Creating an auction moves the vehicle to Awaiting, and Back to upcoming returns it',
      { tag: ['@functional', '@crud', '@mutates'] },
      async ({ page, upcomingPage, createAuctionPage, awaitingPage }) => {
        // Five pages and a two-step wizard: more than the default 30 s, especially when headed.
        test.slow();

        // The highest-priced Upcoming vehicle.
        await upcomingPage.gotoSortedByStartingPriceDesc();
        const row = upcomingPage.rows.first();
        await expect(
          row,
          'No vehicle in the Upcoming list to build an auction from.',
        ).toBeVisible();
        const itemId = await upcomingPage.rowId(row);
        const vin = baseVin(await upcomingPage.rowVin(row).innerText());
        const supplier = (await upcomingPage.rowSupplier(row).innerText()).trim();
        const startingPrice = (await upcomingPage.rowStartingPrice(row).innerText()).trim();
        const title = `${createAuctionText.realAuctionTitle} ${Date.now()}`;

        await createAuctionPage.goto();
        await createAuctionPage.fillConfiguration({
          title,
          supplier,
          monthsAhead: createAuctionText.realAuctionMonthsAhead,
          startDay: 10,
          endDay: 11,
        });
        const startDate = await createAuctionPage.startDateInput.inputValue();
        await createAuctionPage.goToSelectCars();
        await createAuctionPage.selectVehicle(vin);
        await createAuctionPage.createAuctionButton.click();

        await expect(createAuctionPage.alert).toContainText(createAuctionText.created);
        pendingRestore = vin;
        // The success alert closes by itself and the page goes back to the Upcoming list.
        await expect(page).toHaveURL(upcomingUrls.list);

        // The vehicle left Upcoming...
        await upcomingPage.goto();
        await upcomingPage.searchByVin(vin);
        await expect(upcomingPage.rows).toHaveCount(0);

        // ...and is in Awaiting, in the new auction, with the chosen start date.
        await awaitingPage.goto();
        const awaitingRow = awaitingPage.rowByVin(vin);
        await expect(awaitingRow).toHaveCount(1);
        await expect(awaitingRow).toContainText(title);
        await expect(awaitingRow).toContainText(startDate);

        // Back to upcoming returns it, unchanged.
        await awaitingPage.openBackToUpcomingConfirmation(awaitingRow);
        await awaitingPage.confirmYesButton.click();
        await expect(awaitingPage.resultAlertTitle).toHaveText(createAuctionText.movedToUpcoming);
        await awaitingPage.resultAlertOkButton.click();
        pendingRestore = null;
        await expect(awaitingRow).toHaveCount(0);

        await upcomingPage.goto();
        await upcomingPage.searchByVin(vin);
        await expect(upcomingPage.row(itemId)).toHaveCount(1);
        await expect(upcomingPage.rowStartingPrice(upcomingPage.row(itemId))).toHaveText(
          startingPrice,
        );
      },
    );
  });

  test.describe('supplier bid type', () => {
    // Sets the supplier's Bid Type to Price Offering, creates an auction with one of its
    // vehicles (two months ahead), checks the auction takes that bid type, then moves the vehicle
    // back to Upcoming and restores the supplier's Bid Type. Never retried.
    test.describe.configure({ retries: 0 });

    /** What to put back if the test stops midway. */
    let restore: { supplierId: string; bidType: BidType; vin: string | null } | null = null;

    // Runs in its own browser context, so it still works if the test's page was closed.
    test.afterEach(async ({ browser, baseURL }) => {
      if (!restore) return;
      const { supplierId, bidType, vin } = restore;
      restore = null;
      const context = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
      try {
        const page = await context.newPage();
        if (vin) {
          const awaitingPage = new AwaitingPage(page);
          await awaitingPage.goto();
          if ((await awaitingPage.rowByVin(vin).count()) > 0)
            await awaitingPage.backToUpcoming(vin);
        }
        await new SupplierAuctionInfoPage(page).setBidType(supplierId, bidType);
      } finally {
        await context.close();
      }
    });

    test(
      'A supplier set to Price Offering gets Price Offering auctions',
      { tag: ['@functional', '@mutates'] },
      async ({ page, upcomingPage, supplierAuctionInfoPage, createAuctionPage, awaitingPage }) => {
        test.slow();

        // A priced Upcoming vehicle and its supplier ("شركة تجريبية-35271" -> ID 35271).
        await upcomingPage.gotoSortedByStartingPriceDesc();
        const row = upcomingPage.rows.first();
        await expect(
          row,
          'No vehicle in the Upcoming list to build an auction from.',
        ).toBeVisible();
        const vin = baseVin(await upcomingPage.rowVin(row).innerText());
        const supplier = (await upcomingPage.rowSupplier(row).innerText()).trim();
        const supplierId = supplier.match(/-(\d+)$/)?.[1];
        expect(supplierId, `No supplier ID in "${supplier}".`).toBeTruthy();

        // 1. Supplier -> Auction Info -> Bid Type: Price Offering.
        await supplierAuctionInfoPage.goto(supplierId!);
        const originalBidType = await supplierAuctionInfoPage.bidType();
        restore = { supplierId: supplierId!, bidType: originalBidType, vin: null };
        await supplierAuctionInfoPage.chooseBidType('Price Offering');
        await supplierAuctionInfoPage.save();
        await expect(supplierAuctionInfoPage.alertTitle).toHaveText(
          createAuctionText.supplierAuctionSaved,
        );
        await supplierAuctionInfoPage.alertOkButton.click();
        await supplierAuctionInfoPage.goto(supplierId!);
        expect(await supplierAuctionInfoPage.bidType()).toBe('Price Offering');

        // 2. Create an auction with that supplier's vehicle.
        const title = `${createAuctionText.realAuctionTitle} ${Date.now()}`;
        await createAuctionPage.goto();
        await createAuctionPage.fillConfiguration({
          title,
          supplier,
          monthsAhead: createAuctionText.realAuctionMonthsAhead,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await createAuctionPage.selectVehicle(vin);
        await createAuctionPage.createAuctionButton.click();
        await expect(createAuctionPage.alert).toContainText(createAuctionText.created);
        restore.vin = vin;
        await expect(page).toHaveURL(upcomingUrls.list);

        // 3. The auction takes the supplier's bid type.
        await awaitingPage.goto();
        const awaitingRow = awaitingPage.rowByVin(vin);
        await expect(awaitingRow).toContainText(title);
        await expect(awaitingRow).toContainText(createAuctionText.priceOffering);
        await expect(awaitingRow).not.toContainText(createAuctionText.standardBid);

        // 4. Undo: the vehicle back to Upcoming, the supplier back to its bid type.
        await awaitingPage.backToUpcoming(vin);
        await expect(awaitingPage.rowByVin(vin)).toHaveCount(0);
        restore.vin = null;
        await supplierAuctionInfoPage.setBidType(supplierId!, originalBidType);
        await supplierAuctionInfoPage.goto(supplierId!);
        expect(await supplierAuctionInfoPage.bidType()).toBe(originalBidType);
        restore = null;
      },
    );
  });
});
