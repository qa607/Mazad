import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { AwaitingPage } from '@pages/backend/auctions/awaiting.page';
import { FailedPage } from '@pages/backend/auctions/failed.page';
import { failedUrls } from '@test-data/backend-failed.data';
import { destructiveSkipReason, failedPool } from '@test-data/backend-failed-pool.data';
import { createAuctionText } from '@test-data/backend-upcoming.data';

// Create Auction for Failed vehicles: the wizard reached from the Failed list's "Create Auction"
// button (/backend/auction/failed/create), with Car Source = Failed. It is the same wizard as the
// Upcoming one, so its field rules are covered by create-auction.spec.ts; here the Failed source
// and the real transition are checked. The first group stops before the final submit. The second
// group really creates an auction on the QA-AUTO pool, only after explicit approval.
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

test.describe(
  'Backend - Failed List - Create Auction (read-only)',
  { tag: ['@regression'] },
  () => {
    test.beforeEach(async ({ page, failedPage }) => {
      await failedPage.goto();
      await expect(page).toHaveURL(failedUrls.list);
    });

    test(
      'FL-CRE-01 Car Source = Failed lists the supplier’s failed vehicles, and not its upcoming ones',
      { tag: ['@functional'] },
      async ({ page, failedPage, createAuctionPage, upcomingPage }) => {
        const info = await failedPage.readRow(failedPage.rows.first());
        const vin = FailedPage.baseVin(info.vin);
        await failedPage.openCreateAuction();
        await expect(page).toHaveURL(failedUrls.createAuction);
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: info.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();

        await createAuctionPage.chooseCarSource('Failed');

        await expect(createAuctionPage.vehicleRow(vin).first()).toBeVisible();
        const listed = await createAuctionPage.vehicleRows.count();
        await expect(createAuctionPage.totalVehicleCount).toHaveText(String(listed));

        // An upcoming vehicle is never also a failed one.
        await upcomingPage.goto();
        const upcomingVin = (await upcomingPage.rowVin(upcomingPage.rows.first()).innerText())
          .trim()
          .split(/\s+/)[0];
        await createAuctionPage.goto();
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: info.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await createAuctionPage.chooseCarSource('Failed');
        await expect(createAuctionPage.vehicleRow(upcomingVin)).toHaveCount(0);
      },
    );

    test(
      'FL-CRE-02 Create Auction with no vehicle selected is refused, and nothing is sent',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage, createAuctionPage }) => {
        const info = await failedPage.readRow(failedPage.rows.first());
        await failedPage.openCreateAuction();
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: info.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await createAuctionPage.chooseCarSource('Failed');
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
      'FL-CRE-03 Next with an empty configuration shows the required fields',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage, createAuctionPage }) => {
        await failedPage.openCreateAuction();

        await createAuctionPage.nextButton.click();

        for (const [inputId, message] of Object.entries(createAuctionText.requiredFieldErrors)) {
          await expect(createAuctionPage.fieldError(inputId)).toHaveText(message);
        }
        await expect(createAuctionPage.backToConfigurationButton).toBeHidden();
      },
    );

    test(
      'FL-CRE-04 Cancel returns to the Failed list',
      { tag: ['@functional'] },
      async ({ page, failedPage, createAuctionPage }) => {
        await failedPage.openCreateAuction();

        await createAuctionPage.cancelLink.click();

        await expect(page).toHaveURL(/\/backend\/auction\/(failed|upcoming)\/index$/);
      },
    );
  },
);

test.describe(
  'Backend - Failed List - Create Auction (real, QA-AUTO pool only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    // Creates a real auction (two months ahead, so it never goes live) and then moves the vehicle
    // out of it again: never retried, one at a time.
    test.describe.configure({ mode: 'default', retries: 0 });

    /** VIN of a pool vehicle the test put in an auction and has not yet moved back. */
    let pendingRestore: string | null = null;

    // If a step fails after creating the auction, move the vehicle back to Upcoming. It uses its
    // own browser context, so it still runs when the test's page was closed.
    test.afterEach(async ({ browser, baseURL }) => {
      if (!pendingRestore) return;
      const vin = pendingRestore;
      pendingRestore = null;
      const context = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
      try {
        const awaiting = new AwaitingPage(await context.newPage());
        await awaiting.goto();
        if ((await awaiting.rowByVin(vin).count()) > 0) await awaiting.backToUpcoming(vin);
      } finally {
        await context.close();
      }
    });

    test(
      'FL-CRE-05 Creating an auction from Failed moves the vehicle to Awaiting; Back to upcoming then returns it to Upcoming, not to Failed',
      { tag: ['@functional'] },
      async ({ failedPage, createAuctionPage, awaitingPage, upcomingPage }) => {
        const reason = destructiveSkipReason(['createAuction']);
        test.skip(!!reason, reason ?? '');
        test.slow();
        const vin = failedPool.vehicles.createAuction;
        const title = `${createAuctionText.realAuctionTitle} ${Date.now()}`;

        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        await expect(row, `QA-AUTO vehicle ${vin} is in Failed`).toBeVisible();
        const info = await failedPage.readRow(row);

        await failedPage.openCreateAuction();
        await createAuctionPage.fillConfiguration({
          title,
          supplier: info.supplier,
          monthsAhead: createAuctionText.realAuctionMonthsAhead,
          startDay: 10,
          endDay: 11,
        });
        const startDate = await createAuctionPage.startDateInput.inputValue();
        await createAuctionPage.goToSelectCars();
        await createAuctionPage.chooseCarSource('Failed');
        await createAuctionPage.selectVehicle(vin);
        await createAuctionPage.createAuctionButton.click();
        await expect(createAuctionPage.alert).toContainText(createAuctionText.created);
        pendingRestore = vin;

        // Source: gone from Failed, after a reload.
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(0);

        // Destination: in Awaiting, in the new auction, with the chosen start date.
        await awaitingPage.goto();
        const awaitingRow = awaitingPage.rowByVin(vin);
        await expect(awaitingRow).toHaveCount(1);
        await expect(awaitingRow).toContainText(title);
        await expect(awaitingRow).toContainText(startDate);

        // The vehicle is no longer offered for a new auction.
        await createAuctionPage.goto();
        await createAuctionPage.fillConfiguration({
          title: createAuctionText.probeTitle,
          supplier: info.supplier,
          startDay: 10,
          endDay: 11,
        });
        await createAuctionPage.goToSelectCars();
        await createAuctionPage.chooseCarSource('Failed');
        await expect(createAuctionPage.vehicleRow(vin)).toHaveCount(0);

        // Undo: Back to upcoming returns it to Upcoming (it does not go back to Failed).
        await awaitingPage.goto();
        await awaitingPage.backToUpcoming(vin);
        pendingRestore = null;
        await upcomingPage.goto();
        await upcomingPage.searchByVin(vin);
        await expect(upcomingPage.vinCells.filter({ hasText: vin })).toHaveCount(1);
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(0);
      },
    );
  },
);
