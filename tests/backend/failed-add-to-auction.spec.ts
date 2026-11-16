import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { FailedPage } from '@pages/backend/auctions/failed.page';
import { failedText, failedUrls } from '@test-data/backend-failed.data';
import { destructiveSkipReason, failedPool } from '@test-data/backend-failed-pool.data';
import { escapeRegExp } from '@utils/text';

// Add to Auction for Failed vehicles: the bulk button opens a picker of the LIVE and AWAITING
// auctions owned by the vehicle's supplier. The first group is read-only: the picker is opened and
// closed, never saved. The second group really adds a QA-AUTO pool vehicle to the QA-AUTO target
// auction, only after explicit approval. A vehicle is never sent to another supplier's auction.
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
  'Backend - Failed List - Add to Auction (read-only)',
  { tag: ['@regression'] },
  () => {
    test.beforeEach(async ({ page, failedPage }) => {
      await failedPage.goto();
      await expect(page).toHaveURL(failedUrls.list);
    });

    test(
      'FL-ADD-01 The picker opens with its note, auction list and the selected vehicle; Close keeps it',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        const itemId = await failedPage.rowId(failedPage.selectableRows.first());
        const info = await failedPage.readRow(failedPage.row(itemId));

        await failedPage.openAddToAuction(itemId);
        const dialog = failedPage.addToAuctionDialog;

        await expect(dialog.title).toHaveText(failedText.addToAuctionTitle);
        await expect(dialog.note).toContainText(failedText.addToAuctionNote);
        await expect(dialog.vehicleRows).toHaveCount(1);
        await expect(dialog.vehicleRows.first()).toContainText(FailedPage.baseVin(info.vin));

        await dialog.cancel();

        await expect(dialog.dialog).toBeHidden();
        await page.reload();
        await expect(failedPage.row(itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-ADD-02 Saving without choosing an auction is refused, and nothing is sent',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage }) => {
        await failedPage.openAddToAuction(
          await failedPage.rowId(failedPage.selectableRows.first()),
        );
        const dialog = failedPage.addToAuctionDialog;
        const submissions = dialog.countSubmissions();

        await dialog.save();

        await expect(dialog.dialog).toBeVisible();
        expect(submissions()).toBe(0);
        await dialog.cancel();
      },
    );

    test(
      'FL-ADD-03 The picker offers only live and awaiting auctions of the vehicle’s own supplier',
      { tag: ['@functional'] },
      async ({ failedPage }) => {
        // Opens the picker for up to 8 suppliers one after another: more than the default 30 s.
        test.slow();
        const offers = new Map<string, string[]>();
        const suppliers = (await failedPage.filterOptions('supplier')).slice(0, 8);

        for (const supplier of suppliers) {
          await failedPage.goto();
          await failedPage.filterBy('supplier', new RegExp(`^\\s*${escapeRegExp(supplier)}\\s*$`));
          if ((await failedPage.selectableRows.count()) === 0) continue;
          await failedPage.openAddToAuction(
            await failedPage.rowId(failedPage.selectableRows.first()),
          );
          const options = await failedPage.addToAuctionDialog.auctionOptions();
          // A supplier with no live or awaiting auction gets a message instead of a picker.
          if (options.length === 0) {
            await expect(failedPage.addToAuctionDialog.noAuctionsMessage).toBeVisible();
          }
          offers.set(supplier, options);
          await failedPage.addToAuctionDialog.cancel();
        }

        expect(offers.size, 'suppliers with a selectable item').toBeGreaterThan(0);
        const seen = new Map<string, string>();
        for (const [supplier, options] of offers) {
          for (const option of options) {
            expect(option, `${supplier}: ${option}`).toMatch(/\((LIVE|AWAITING)\)$/);
            // No auction is offered to two suppliers' vehicles.
            expect(
              seen.get(option),
              `${option} offered to ${seen.get(option)} and ${supplier}`,
            ).toBeUndefined();
            seen.set(option, supplier);
          }
        }
      },
    );
  },
);

test.describe(
  'Backend - Failed List - Add to Auction (real, QA-AUTO pool only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    // Adding cannot be undone from here and a retry could add twice: never retried.
    test.describe.configure({ mode: 'default', retries: 0 });

    test(
      'FL-ADD-04 Adding moves the vehicle from Failed into the chosen auction, once',
      { tag: ['@functional'] },
      async ({ failedPage, awaitingPage }) => {
        const reason = destructiveSkipReason(['addToAuction']);
        test.skip(!!reason, reason ?? '');
        const vin = failedPool.vehicles.addToAuction;
        const target = failedPool.addTargetAuctionTitle;

        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        await expect(row, `QA-AUTO vehicle ${vin} is in Failed`).toBeVisible();
        const info = await failedPage.readRow(row);

        await failedPage.openAddToAuction(info.itemId);
        const options = await failedPage.addToAuctionDialog.auctionOptions();
        expect(
          options.some((option) => option.includes(target)),
          `the picker offers "${target}" (offered: ${options.join('; ')})`,
        ).toBe(true);
        await failedPage.addToAuctionDialog.chooseAuction(target);
        await failedPage.addToAuctionDialog.save();
        // No fixed popup is expected: what the page showed is recorded, and success is judged
        // from the lists below (gone from Failed, exactly once in the target auction).
        await failedPage.settleAfterAddToAuction();

        // Source: gone from Failed, after a reload.
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(0);

        // Destination: in the target auction, exactly once.
        await awaitingPage.goto();
        const added = awaitingPage.rowByVin(vin);
        await expect(added).toHaveCount(1);
        await expect(added).toContainText(target);
        await expect(added).toContainText(info.vehicleTitle);
      },
    );
  },
);
