import { expect, test } from '@fixtures/test.fixture';
import { auctionLiveData, auctionLiveText } from '@test-data/backend-auction-live.data';
import { upcomingUrls } from '@test-data/backend-upcoming.data';

// Full auction lifecycle on staging, with a REAL auction that goes live:
//   Pricing Done -> Move to upcoming -> Create Auction (starts in a few minutes)
//   -> Awaiting -> Live (Price Offering: no Auto Extend, so it ends on time) -> ends with no
//   bids -> Failed.
// Each run permanently uses up one priced Pricing Done vehicle: it ends in Failed with a
// failure mark (#F) on its record, and is visible to staging customers for a few minutes while
// live. It runs only when asked for by name, never as part of the normal suite:
//   RUN_LIVE_AUCTION=true npx playwright test tests/backend/auction-live.spec.ts --project=backend

test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

// Never retried: a retry would take and burn a second vehicle.
test.describe.configure({ retries: 0 });

/** Wall-clock parts of a moment in Riyadh time, the Backend's time zone. */
function riyadhTime(moment: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: auctionLiveData.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    /** "2026-11-09", as the date fields and lists show it. */
    date: `${parts.year}-${parts.month}-${parts.day}`,
    /** "14:05", as the lists show it. */
    time24: `${parts.hour}:${parts.minute}`,
    /** "02:05 PM", as the time fields show it (two-digit hour). */
    time12: `${String(hour % 12 || 12).padStart(2, '0')}:${parts.minute} ${hour < 12 ? 'AM' : 'PM'}`,
    minute,
  };
}

const minutes = (count: number) => count * 60_000;

test.describe('Backend - Auction lifecycle (real live auction)', () => {
  test.skip(
    process.env.RUN_LIVE_AUCTION !== 'true',
    'Creates a real live auction and burns a vehicle: run with RUN_LIVE_AUCTION=true.',
  );

  /** Where the test's vehicle is, so a failure can put it back where possible. */
  let vehicle: { vin: string; stage: 'upcoming' | 'awaiting' | 'live' | 'done' } | null = null;

  // On failure before the auction goes live, return the vehicle to Pricing Done. Once live it
  // cannot be taken back: it ends on its own and goes to Failed.
  test.afterEach(async ({ awaitingPage, upcomingPage }) => {
    if (!vehicle || vehicle.stage === 'live' || vehicle.stage === 'done') return;
    const { vin } = vehicle;
    if (vehicle.stage === 'awaiting') {
      await awaitingPage.goto();
      if ((await awaitingPage.rowByVin(vin).count()) > 0) await awaitingPage.backToUpcoming(vin);
    }
    await upcomingPage.goto();
    await upcomingPage.searchByVin(vin);
    const row = upcomingPage.rows.first();
    if ((await row.count()) === 0) return;
    await upcomingPage.openBackToPricingDoneConfirmation(await upcomingPage.rowId(row));
    await upcomingPage.confirmYesButton.click();
    await upcomingPage.resultAlertOkButton.click();
    vehicle = null;
  });

  test('A new auction waits in Awaiting, goes Live, and ends in Failed with no bids', async ({
    page,
    pricingDonePage,
    createAuctionPage,
    awaitingPage,
    livePage,
    failedPage,
  }) => {
    const { startInMinutes, durationMinutes, schedulerGraceMinutes, pollEverySeconds } =
      auctionLiveData;
    test.setTimeout(minutes(startInMinutes + durationMinutes + 2 * schedulerGraceMinutes + 5));
    const poll = { intervals: [pollEverySeconds * 1000] };

    // 1. A priced Pricing Done vehicle whose supplier the wizard offers ("...-<id>").
    await pricingDonePage.gotoSortedByStartingPriceDesc();
    const candidates = await pricingDonePage.rows.all();
    let picked: { id: string; vin: string; supplier: string } | null = null;
    for (const row of candidates) {
      const supplier = (await row.locator('td[data-col-seq="14"]').innerText()).trim();
      if (!/-\d+$/.test(supplier)) continue;
      picked = {
        id: await pricingDonePage.rowId(row),
        vin: (await pricingDonePage.rowVin(row).innerText()).trim().split(/\s+/)[0],
        supplier,
      };
      break;
    }
    expect(picked, 'No priced Pricing Done vehicle with a known supplier.').not.toBeNull();
    const { id, vin, supplier } = picked!;

    // 2. Move it to Upcoming.
    await pricingDonePage.openMoveToUpcomingConfirmation(id);
    await pricingDonePage.confirmYesButton.click();
    await expect(pricingDonePage.resultAlertTitle).toHaveText(auctionLiveText.movedToUpcoming);
    await pricingDonePage.resultAlertOkButton.click();
    vehicle = { vin, stage: 'upcoming' };

    // 3. Create an auction with only this vehicle, starting in a few minutes.
    const now = riyadhTime(new Date());
    const startMoment = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + minutes(startInMinutes));
    const start = riyadhTime(startMoment);
    const end = riyadhTime(new Date(startMoment.getTime() + minutes(durationMinutes)));
    const monthsAhead = (when: typeof start) =>
      when.year * 12 + when.month - (now.year * 12 + now.month);
    const title = `${auctionLiveData.titlePrefix} ${Date.now()}`;

    await createAuctionPage.goto();
    await createAuctionPage.chooseAuctionType('Normal Auction');
    await createAuctionPage.chooseSupplier(supplier);
    await createAuctionPage.titleInput.fill(title);
    await createAuctionPage.pickDate(
      createAuctionPage.startDateInput,
      monthsAhead(start),
      start.day,
    );
    await createAuctionPage.setTime(createAuctionPage.startTimeInput, start.time12);
    await createAuctionPage.pickDate(createAuctionPage.endDateInput, monthsAhead(end), end.day);
    await createAuctionPage.setTime(createAuctionPage.endTimeInput, end.time12);
    await expect(createAuctionPage.startDateInput).toHaveValue(start.date);
    await expect(createAuctionPage.startTimeInput).toHaveValue(start.time12);
    await createAuctionPage.goToSelectCars();
    await createAuctionPage.selectVehicle(vin);
    await createAuctionPage.createAuctionButton.click();

    await expect(createAuctionPage.alert).toContainText(auctionLiveText.created);
    vehicle.stage = 'awaiting';
    await expect(page).toHaveURL(upcomingUrls.list);

    // 4. It waits in Awaiting, with the chosen start.
    await awaitingPage.goto();
    const awaitingRow = awaitingPage.rowByVin(vin);
    await expect(awaitingRow).toHaveCount(1);
    await expect(awaitingRow).toContainText(title);
    await expect(awaitingRow).toContainText(`${start.date} ${start.time24}`);
    await expect(awaitingRow).toContainText(`${end.date} ${end.time24}`);

    // 5. At the start time, the scheduler moves it to Live.
    await expect
      .poll(
        async () => {
          await livePage.gotoByVin(vin);
          return livePage.rowByVin(vin).count();
        },
        {
          ...poll,
          message: 'vehicle in Live',
          timeout: startMoment.getTime() - Date.now() + minutes(schedulerGraceMinutes),
        },
      )
      .toBe(1);
    vehicle.stage = 'live';
    await awaitingPage.goto();
    await expect(awaitingPage.rowByVin(vin)).toHaveCount(0);

    // 6. Live shows the auction with its schedule. The wizard creates an Instant Auction with
    // Price Offering bidding, which has no Auto Extend switch (seen 2026-11-09), so it cannot
    // be extended and ends exactly at its end time, checked in step 7.
    await livePage.gotoByVin(vin);
    const liveRow = livePage.rowByVin(vin);
    await expect(liveRow).toContainText(title);
    await expect(liveRow).toContainText(auctionLiveText.priceOffering);
    // Live shows "2026-11-09 / 01:07:00 PM" (with seconds).
    await expect(liveRow).toContainText(`${end.date} / ${end.time12.replace(' ', ':00 ')}`);
    await expect(livePage.autoExtendCheckbox(liveRow)).toHaveCount(0);

    // 7. With no bids, it leaves Live at the end time and lands in Failed.
    const endMoment = startMoment.getTime() + minutes(durationMinutes);
    await expect
      .poll(
        async () => {
          await livePage.gotoByVin(vin);
          return livePage.rowByVin(vin).count();
        },
        {
          ...poll,
          message: 'vehicle out of Live',
          timeout: endMoment - Date.now() + minutes(schedulerGraceMinutes),
        },
      )
      .toBe(0);
    vehicle.stage = 'done';

    await expect
      .poll(
        async () => {
          await failedPage.gotoByVin(vin);
          return failedPage.rowByVin(vin).filter({ hasText: title }).count();
        },
        { ...poll, message: 'vehicle in Failed, from this auction', timeout: minutes(2) },
      )
      .toBe(1);
    // Each failed auction adds a mark to the VIN ("#F1", "#F2", ...).
    await expect(failedPage.rowByVin(vin).filter({ hasText: title })).toContainText(
      new RegExp(`${vin} #F\\d+`),
    );
  });
});
