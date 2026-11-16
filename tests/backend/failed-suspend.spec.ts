import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { SuspendedVehiclesPage } from '@pages/backend/auctions/suspended-vehicles.page';
import { failedText, failedUrls } from '@test-data/backend-failed.data';
import {
  destructiveSkipReason,
  failedPool,
  probeSkipReason,
} from '@test-data/backend-failed-pool.data';

// Suspend from the Failed list. The first group is read-only: the popup is opened, filled and
// closed, never submitted. The second group really suspends QA-AUTO pool vehicles (and activates
// them again), only after explicit approval (see test-data/backend-failed-pool.data.ts).
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

test.describe('Backend - Failed List - Suspend (read-only)', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, failedPage }) => {
    await failedPage.goto();
    await expect(page).toHaveURL(failedUrls.list);
  });

  test(
    'FL-SUS-01 The popup lists the four reasons, each selectable',
    { tag: ['@functional'] },
    async ({ failedPage }) => {
      await failedPage.openSuspend(failedPage.rows.first());
      const dialog = failedPage.suspendDialog;

      await expect(dialog.title).toHaveText(failedText.suspendModalTitle);
      // The third reason is matched by its start: its spelling is defect candidate DC-04.
      await expect(dialog.reasonLabels).toHaveText([
        /^The car is pending to be sold$/,
        /^Incorrect Inspection$/,
        /^Requested by Supplie/,
        /^Other Reasons$/,
      ]);
      for (const [index, label] of (await dialog.reasonLabels.all()).entries()) {
        await label.click();
        await expect(dialog.reasonRadios.nth(index)).toBeChecked();
      }
      await dialog.close();
    },
  );

  test(
    'FL-SUS-02 Suspending without a reason is refused, and nothing is sent',
    { tag: ['@functional', '@negative'] },
    async ({ page, failedPage }) => {
      const itemId = await failedPage.rowId(failedPage.rows.first());
      await failedPage.openSuspend(failedPage.row(itemId));
      const submissions = failedPage.suspendDialog.countSubmissions();

      await failedPage.suspendDialog.submit();

      await expect(failedPage.suspendDialog.reasonError).toHaveText(failedText.reasonRequired);
      await expect(failedPage.suspendDialog.dialog).toBeVisible();
      expect(submissions()).toBe(0);
      await failedPage.suspendDialog.close();
      await page.reload();
      await expect(failedPage.row(itemId)).toHaveCount(1);
    },
  );

  test(
    'FL-SUS-03 Close leaves the vehicle in Failed',
    { tag: ['@functional'] },
    async ({ page, failedPage }) => {
      const itemId = await failedPage.rowId(failedPage.rows.first());
      await failedPage.openSuspend(failedPage.row(itemId));
      await failedPage.suspendDialog.chooseReason('Incorrect Inspection');
      const submissions = failedPage.suspendDialog.countSubmissions();

      await failedPage.suspendDialog.close();

      await expect(failedPage.suspendDialog.dialog).toBeHidden();
      expect(submissions()).toBe(0);
      await page.reload();
      await expect(failedPage.row(itemId)).toHaveCount(1);
    },
  );

  test(
    'FL-SUS-04 Choosing "Other Reasons" shows the "Reason Other" box',
    { tag: ['@functional', '@known-bug'] },
    async ({ failedPage }) => {
      // Known defect DC-05 (found 2026-11-11, same on Failed, Upcoming and Pricing Done): the
      // popup's own script holds `suspend_other_reason_id = false`, so the box never appears and
      // "Other Reasons" cannot be given an explanation. Remove test.fail() once it appears.
      test.fail(true, 'Known defect DC-05: "Reason Other" never appears for "Other Reasons".');

      await failedPage.openSuspend(failedPage.rows.first());
      await failedPage.suspendDialog.chooseReason('Other Reasons');

      await expect(failedPage.suspendDialog.otherInput).toBeVisible();
    },
  );

  test(
    'FL-SUS-08 The third reason is spelled "Requested by Supplier"',
    { tag: ['@ui', '@known-bug'] },
    async ({ failedPage }) => {
      // Known defect DC-04 (found 2026-11-08, still there 2026-11-11): the popup says
      // "Requested by Supplie". Remove test.fail() once the label is corrected.
      test.fail(
        true,
        'Known defect DC-04: the suspend reason "Requested by Supplier" is misspelled.',
      );

      await failedPage.openSuspend(failedPage.rows.first());

      await expect(failedPage.suspendDialog.reasonLabels.nth(2)).toHaveText(
        failedText.suspendReasonThirdCorrect,
      );
    },
  );
});

test.describe(
  'Backend - Failed List - Suspend (real, QA-AUTO pool only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    // One vehicle goes through Suspend and Activate: never retried, one at a time.
    test.describe.configure({ mode: 'default', retries: 0 });

    /** Vehicle ID of a pool vehicle the test suspended and has not yet activated. */
    let pendingActivation: string | null = null;

    // If a step fails after suspending, activate it again. It uses its own browser context, so
    // it still runs when the test's page is closed.
    test.afterEach(async ({ browser, baseURL }) => {
      if (!pendingActivation) return;
      const vehicleId = pendingActivation;
      pendingActivation = null;
      const context = await browser.newContext({ baseURL, storageState: DEV_ROOT_SESSION_FILE });
      try {
        const suspended = new SuspendedVehiclesPage(await context.newPage());
        await suspended.goto();
        if ((await suspended.row(vehicleId).count()) > 0) await suspended.activate(vehicleId);
      } finally {
        await context.close();
      }
    });

    test(
      'FL-SUS-05 Suspending moves the vehicle to the Suspended list with its reason, and Activate sends it to Ready For Pricing',
      { tag: ['@functional'] },
      async ({ failedPage, suspendedVehiclesPage, readyForPricingPage }) => {
        const skip = destructiveSkipReason(['suspend']);
        test.skip(!!skip, skip ?? '');
        test.slow();
        const vin = failedPool.vehicles.suspend;
        const reason = 'Incorrect Inspection';

        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        await expect(row, `QA-AUTO vehicle ${vin} is in Failed`).toBeVisible();
        const info = await failedPage.readRow(row);

        await failedPage.openSuspend(row);
        await failedPage.suspendDialog.chooseReason(reason);
        await failedPage.suspendDialog.submit();
        await expect(failedPage.resultAlert).toBeVisible();
        pendingActivation = info.vehicleId;
        await failedPage.resultAlertOkButton.click();

        // Source: gone from Failed, after a reload.
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(0);

        // Destination: in Suspended Vehicles, with the chosen reason and the same vehicle.
        await suspendedVehiclesPage.goto();
        await suspendedVehiclesPage.searchByVin(vin);
        const suspended = suspendedVehiclesPage.row(info.vehicleId);
        await expect(suspended).toHaveCount(1);
        await expect(suspendedVehiclesPage.rowVin(suspended)).toContainText(vin);
        await expect(suspended).toContainText(reason);

        // Undo: Activate returns it to Ready For Pricing (not to Failed).
        await suspendedVehiclesPage.activate(info.vehicleId);
        await suspendedVehiclesPage.resultAlertOkButton.click().catch(() => undefined);
        pendingActivation = null;
        await suspendedVehiclesPage.goto();
        await suspendedVehiclesPage.searchByVin(vin);
        await expect(suspendedVehiclesPage.row(info.vehicleId)).toHaveCount(0);
        await readyForPricingPage.goto();
        await readyForPricingPage.searchByVin(vin);
        await expect(readyForPricingPage.vinCells.filter({ hasText: vin })).toHaveCount(1);
      },
    );

    test(
      'FL-SUS-07 An unsuccessful suspend keeps the vehicle in Failed',
      { tag: ['@functional', '@negative'] },
      async ({ page, failedPage }) => {
        const skip = probeSkipReason('general');
        test.skip(!!skip, skip ?? '');
        test.skip(
          process.env.FAILED_DESTRUCTIVE_APPROVED !== 'true',
          'Needs FAILED_DESTRUCTIVE_APPROVED=true for this run.',
        );
        const vin = failedPool.probes.general;
        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        const itemId = await failedPage.rowId(row);
        // The request is stopped in the browser, so the server never receives it.
        await page.route('**/ajax/suspend-vehicle*', (route) => route.abort());

        await failedPage.openSuspend(row);
        await failedPage.suspendDialog.chooseReason('Incorrect Inspection');
        await failedPage.suspendDialog.submit();

        await expect(failedPage.suspendDialog.dialog).toBeVisible();
        await page.unroute('**/ajax/suspend-vehicle*');
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(itemId)).toHaveCount(1);
      },
    );
  },
);
