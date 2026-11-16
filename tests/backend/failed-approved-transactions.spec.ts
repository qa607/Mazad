import type { Locator, Page, TestInfo } from '@playwright/test';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { FailedPage, type FailedRow } from '@pages/backend/auctions/failed.page';
import {
  type ApprovedItem,
  approvedRunEnabled,
  approvedTransactions as approved,
  supplierLabel,
} from '@test-data/backend-failed-approved.data';
import { failedUrls } from '@test-data/backend-failed.data';
import { createAuctionText } from '@test-data/backend-upcoming.data';
import { validInvoice } from '@utils/test-files';
import { uniqueDigits } from '@utils/unique';

// REAL transactions on the Failed list, on exactly the records the QA owner approved on
// 2026-11-11 (see test-data/backend-failed-approved.data.ts). Staging only. They run through the
// UI, once each, never retried, in order, and stop at the first unexpected problem. Nothing is
// reversed. They run only with FAILED_DESTRUCTIVE_APPROVED=true.
test.use(devRootSession);
test.describe.configure({ mode: 'serial', retries: 0 });

/** Attaches a screenshot with the account details masked, as evidence. */
async function evidence(page: Page, testInfo: TestInfo, name: string, mask: Locator[]) {
  const body = await page.screenshot({ mask }).catch(() => null);
  if (body) await testInfo.attach(name, { body, contentType: 'image/png' });
}

/** Records a value as evidence in the report (no personal data or secrets). */
function note(testInfo: TestInfo, type: string, description: string) {
  testInfo.annotations.push({ type, description });
}

/**
 * Finds the approved item in the Failed list and checks every identifier. A mismatch throws, so
 * the transaction does not run.
 */
async function verifyApprovedItem(failedPage: FailedPage, item: ApprovedItem): Promise<FailedRow> {
  await failedPage.gotoByVin(item.vin);
  const row = failedPage.row(item.itemId);
  await expect(row, `item ${item.itemId} (${item.vin}) is in the Failed list`).toHaveCount(1);
  const info = await failedPage.readRow(row);
  expect(info.itemId, 'item ID').toBe(item.itemId);
  expect(info.vehicleId, 'vehicle ID').toBe(item.vehicleId);
  expect(info.supplier, 'supplier').toBe(supplierLabel(item.supplierId));
  expect(info.vin, 'VIN and attempt mark').toBe(`${item.vin} ${item.mark}`);
  return info;
}

test.describe('Backend - Failed List - approved real transactions', { tag: ['@mutates'] }, () => {
  test.beforeEach(() => {
    test.skip(!approvedRunEnabled, 'Needs FAILED_DESTRUCTIVE_APPROVED=true for this run.');
  });

  test('T1 Direct Sale of item 6638 to customer 1520 for 35,350', async ({
    page,
    failedPage,
    mazadSoldListPage,
    mazadDashboardPage,
  }, testInfo) => {
    const { item, customerId, supplierPrice, commission, administrativeExpenses, expectedTotal } =
      approved.directSale;
    const info = await verifyApprovedItem(failedPage, item);
    const row = failedPage.row(item.itemId);
    expect(info.actions, 'Direct Sale is offered').toContain('Direct Sale');
    await expect(failedPage.rowCustomerLink(row)).toHaveAttribute(
      'href',
      new RegExp(`id=${customerId}$`),
    );
    note(
      testInfo,
      'before',
      `Failed, ${info.totalBids} bids from ${info.totalBidders} bidders, highest ${info.highestPrice}`,
    );

    await failedPage.openDirectSale(row);
    const names = await failedPage.directSaleDialog.customerNames();
    const customer = names.find((name) => name.toLowerCase() === info.customer.toLowerCase());
    expect(customer, 'customer 1520 is among the bidders offered').toBeDefined();
    await failedPage.directSaleDialog.fill({
      customer,
      supplierPrice,
      commission,
      administrativeExpenses,
    });
    await expect(failedPage.directSaleDialog.totalPriceInput).toHaveValue(expectedTotal);
    await evidence(page, testInfo, 'T1 form before save', mazadDashboardPage.sensitiveAreas());

    await failedPage.directSaleDialog.save();
    await expect(failedPage.resultAlert).toBeVisible();
    note(
      testInfo,
      'result message',
      (await failedPage.resultAlert.innerText()).replace(/\s+/g, ' ').trim(),
    );
    await evidence(page, testInfo, 'T1 result', mazadDashboardPage.sensitiveAreas());
    await failedPage.resultAlertOkButton.click();

    // Source: gone from Failed after a reload.
    await failedPage.gotoByVin(item.vin);
    await expect(failedPage.row(item.itemId)).toHaveCount(0);

    // Destination: the Sold list, with the submitted prices.
    await mazadSoldListPage.goto();
    await mazadSoldListPage.search({ vin: item.vin });
    const sold = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());
    note(
      testInfo,
      'after (Sold list row)',
      JSON.stringify({ ...sold, customerId: sold.customerId, vehicleId: sold.vehicleId }),
    );
    await evidence(page, testInfo, 'T1 Sold list', mazadDashboardPage.sensitiveAreas());
    expect(sold.vin).toContain(item.vin);
    expect(sold.vehicleId).toBe(Number(item.vehicleId));
    expect(sold.customerId).toBe(Number(customerId));
    expect(sold.salePrice).toBe(
      Number(supplierPrice) + Number(commission) + Number(administrativeExpenses),
    );
    expect(sold.administrativeExpenses ?? 0).toBe(Number(administrativeExpenses));
  });

  test('T2 Upload a valid PDF invoice for item 15137', async ({
    page,
    failedPage,
    failedInvoicePage,
    mazadDashboardPage,
  }, testInfo) => {
    const { item } = approved.uploadInvoice;
    const info = await verifyApprovedItem(failedPage, item);
    const row = failedPage.row(item.itemId);

    await failedPage.openUploadInvoice(row);
    await failedPage.uploadInvoiceDialog.chooseFile(validInvoice('pdf', uniqueDigits(6)));
    await expect(failedPage.uploadInvoiceDialog.extensionError).toBeHidden();
    await evidence(page, testInfo, 'T2 form before submit', mazadDashboardPage.sensitiveAreas());

    await failedPage.uploadInvoiceDialog.submit();
    await expect(failedPage.resultAlert).toBeVisible();
    note(
      testInfo,
      'result message',
      (await failedPage.resultAlert.innerText()).replace(/\s+/g, ' ').trim(),
    );
    await evidence(page, testInfo, 'T2 result', mazadDashboardPage.sensitiveAreas());
    await failedPage.resultAlertOkButton.click();

    await failedPage.gotoByVin(item.vin);
    await expect(failedPage.row(item.itemId)).toHaveCount(0);

    await failedInvoicePage.gotoByVin(item.vin);
    await expect(failedInvoicePage.rows).toHaveCount(1);
    const [record] = await failedInvoicePage.readRows();
    note(testInfo, 'Failed Invoice row (type/category observed)', JSON.stringify(record));
    await evidence(page, testInfo, 'T2 Failed Invoice list', mazadDashboardPage.sensitiveAreas());
    expect(record['Vin Number']).toContain(item.vin);
    expect(record['Item Title']).toBe(info.vehicleTitle);
    expect(record['Supplier Name']).toBe(info.supplier);
    await expect(failedInvoicePage.viewInvoiceLinks.first()).toBeVisible();
  });

  test('T3 Repricing of item 19535: starting price 83,000 to 83,100', async ({
    page,
    failedPage,
    pricingUpdatePage,
    pricingDonePage,
    mazadDashboardPage,
  }, testInfo) => {
    const { item, currentStartingPrice, newStartingPrice, unchanged } = approved.repricing;
    const info = await verifyApprovedItem(failedPage, item);
    expect(info.failedReason, 'still a failed item with no bids').toBe('No Bids');

    await failedPage.startRepricing(failedPage.row(item.itemId));
    await failedPage.confirmRepricing();

    // Every approved "before" value must still match, or nothing is saved.
    await expect(page).toHaveURL(failedUrls.pricingUpdate(item.vehicleId));
    await expect(pricingUpdatePage.startingPriceInput).toHaveValue(currentStartingPrice);
    await expect(pricingUpdatePage.minIncrementInput).toHaveValue(unchanged.minIncrement);
    await expect(pricingUpdatePage.startingBidInput).toHaveValue(unchanged.startingBid);
    await expect(pricingUpdatePage.supplierPriceInput).toHaveValue(unchanged.supplierPrice);
    await expect(pricingUpdatePage.commissionInput).toHaveValue(unchanged.commission);
    await expect(pricingUpdatePage.administrativeExpensesInput).toHaveValue(
      unchanged.administrativeExpenses,
    );
    await expect(pricingUpdatePage.reservePriceInput).toHaveValue(unchanged.reservePrice);
    await expect(pricingUpdatePage.showBuyNowCheckbox).not.toBeChecked();
    await expect(pricingUpdatePage.buyNowPriceInput).toHaveValue('');
    note(
      testInfo,
      'before',
      `starting ${currentStartingPrice}, increment ${unchanged.minIncrement}, status Failed`,
    );

    await pricingUpdatePage.fill({ startingPrice: newStartingPrice });
    await evidence(page, testInfo, 'T3 form before save', mazadDashboardPage.sensitiveAreas());

    // Saved once. Whatever the server answers is recorded before anything is asserted.
    await pricingUpdatePage.save();
    await page.waitForLoadState('load');
    await page.waitForTimeout(2_000);
    // The page answers with a green success alert; validation errors would be field messages
    // or a red alert. Both are recorded before anything is asserted.
    const clean = (texts: string[]) =>
      texts.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const success = clean(await page.locator('.alert-success').allInnerTexts());
    const problems = clean(
      await page.locator('.invalid-feedback, .alert-danger, .alert-warning').allInnerTexts(),
    );
    note(
      testInfo,
      'server response',
      `url ${new URL(page.url()).pathname}; success: ${success.join(' | ') || 'none'}; problems: ${problems.join(' | ') || 'none'}`,
    );
    await evidence(page, testInfo, 'T3 after save', mazadDashboardPage.sensitiveAreas());
    expect(problems, 'validation or error messages after Save').toEqual([]);
    expect(success.join(' ')).toMatch(/saved successfully/i);

    // Source: gone from Failed after a reload.
    await failedPage.gotoByVin(item.vin);
    await expect(failedPage.row(item.itemId)).toHaveCount(0);

    // Destination: Pricing Done, status RePricing, with the saved starting price.
    await pricingDonePage.goto();
    await pricingDonePage.searchByVin(item.vin);
    const done = pricingDonePage.rows.filter({ hasText: item.vin });
    await expect(done).toHaveCount(1);
    note(
      testInfo,
      'after (Pricing Done row)',
      (await done.innerText()).replace(/\s+/g, ' ').trim(),
    );
    await evidence(page, testInfo, 'T3 Pricing Done', mazadDashboardPage.sensitiveAreas());
    await expect(pricingDonePage.statusCells.filter({ hasText: 'RePricing' })).toHaveCount(1);
    await expect(pricingDonePage.rowStartingPrice(done)).toContainText('83,100');
  });

  test('T4 Suspend item 10941 with "Incorrect Inspection"', async ({
    page,
    failedPage,
    suspendedVehiclesPage,
    mazadDashboardPage,
  }, testInfo) => {
    const { item, reason } = approved.suspend;
    await verifyApprovedItem(failedPage, item);

    await failedPage.openSuspend(failedPage.row(item.itemId));
    await failedPage.suspendDialog.chooseReason(reason);
    await evidence(page, testInfo, 'T4 form before submit', mazadDashboardPage.sensitiveAreas());
    await failedPage.suspendDialog.submit();
    await expect(failedPage.resultAlert).toBeVisible();
    note(
      testInfo,
      'result message',
      (await failedPage.resultAlert.innerText()).replace(/\s+/g, ' ').trim(),
    );
    await evidence(page, testInfo, 'T4 result', mazadDashboardPage.sensitiveAreas());
    await failedPage.resultAlertOkButton.click();

    await failedPage.gotoByVin(item.vin);
    await expect(failedPage.row(item.itemId)).toHaveCount(0);

    await suspendedVehiclesPage.goto();
    await suspendedVehiclesPage.searchByVin(item.vin);
    const suspended = suspendedVehiclesPage.row(item.vehicleId);
    await expect(suspended).toHaveCount(1);
    note(
      testInfo,
      'after (Suspended row)',
      (await suspended.innerText()).replace(/\s+/g, ' ').trim(),
    );
    await evidence(page, testInfo, 'T4 Suspended list', mazadDashboardPage.sensitiveAreas());
    await expect(suspendedVehiclesPage.rowVin(suspended)).toContainText(item.vin);
    await expect(suspended).toContainText(reason);
  });

  test('T5 Create an auction from item 19529, two months ahead', async ({
    page,
    failedPage,
    createAuctionPage,
    awaitingPage,
    mazadDashboardPage,
  }, testInfo) => {
    const { item, titlePrefix, monthsAhead } = approved.createAuction;
    const info = await verifyApprovedItem(failedPage, item);
    const title = `${titlePrefix} ${uniqueDigits(8)}`;
    expect(title.length, 'title within the 45-character limit').toBeLessThanOrEqual(
      createAuctionText.titleMaxLength,
    );

    await failedPage.openCreateAuction();
    await createAuctionPage.fillConfiguration({
      title,
      supplier: info.supplier,
      monthsAhead,
      startDay: 10,
      endDay: 11,
    });
    const startDate = await createAuctionPage.startDateInput.inputValue();
    await createAuctionPage.goToSelectCars();
    await createAuctionPage.chooseCarSource('Failed');
    await createAuctionPage.selectVehicle(item.vin);
    await evidence(page, testInfo, 'T5 wizard before create', mazadDashboardPage.sensitiveAreas());

    await createAuctionPage.createAuctionButton.click();
    await expect(createAuctionPage.alert).toContainText(createAuctionText.created);
    note(testInfo, 'auction title', title);
    note(testInfo, 'auction start date', startDate);
    await evidence(page, testInfo, 'T5 result', mazadDashboardPage.sensitiveAreas());

    await failedPage.gotoByVin(item.vin);
    await expect(failedPage.row(item.itemId)).toHaveCount(0);

    await awaitingPage.goto();
    const awaiting = awaitingPage.rowByVin(item.vin);
    await expect(awaiting).toHaveCount(1);
    note(
      testInfo,
      'after (Awaiting row)',
      (await awaiting.innerText()).replace(/\s+/g, ' ').trim(),
    );
    await evidence(page, testInfo, 'T5 Awaiting list', mazadDashboardPage.sensitiveAreas());
    await expect(awaiting).toContainText(title);
    await expect(awaiting).toContainText(startDate);
  });

  test('T6 Add item 24540 to AWAITING auction 1537', async ({
    page,
    failedPage,
    awaitingPage,
    mazadDashboardPage,
  }, testInfo) => {
    const { item, auctionId, auctionTitle, auctionLabel } = approved.addToAuction;
    const info = await verifyApprovedItem(failedPage, item);

    // Re-check the auction is still offered and still AWAITING before adding anything.
    await failedPage.openAddToAuction(item.itemId);
    const options = await failedPage.addToAuctionDialog.auctionOptions();
    note(testInfo, 'auctions offered before adding', options.join('; '));
    const expectedOption = `${auctionId}=${auctionLabel}`;
    if (!options.includes(expectedOption)) {
      await failedPage.addToAuctionDialog.cancel();
      note(
        testInfo,
        'BLOCKED',
        `Auction ${auctionId} "${auctionTitle}" is no longer offered as AWAITING.`,
      );
    }
    test.skip(
      !options.includes(expectedOption),
      `BLOCKED: auction ${auctionId} "${auctionTitle}" is no longer offered as AWAITING.`,
    );

    await failedPage.addToAuctionDialog.chooseAuction(auctionLabel);
    await evidence(page, testInfo, 'T6 picker before save', mazadDashboardPage.sensitiveAreas());
    await failedPage.addToAuctionDialog.save();
    // The page shows no fixed popup after this save (seen 2026-11-11), so what it showed is
    // recorded as evidence and success is judged from the lists below.
    note(testInfo, 'what the page showed', await failedPage.settleAfterAddToAuction());
    await evidence(page, testInfo, 'T6 result', mazadDashboardPage.sensitiveAreas());

    await failedPage.gotoByVin(item.vin);
    await expect(failedPage.row(item.itemId)).toHaveCount(0);

    await awaitingPage.goto();
    const added = awaitingPage.rowByVin(item.vin);
    await expect(added).toHaveCount(1);
    note(testInfo, 'after (Awaiting row)', (await added.innerText()).replace(/\s+/g, ' ').trim());
    await evidence(page, testInfo, 'T6 Awaiting list', mazadDashboardPage.sensitiveAreas());
    await expect(added).toContainText(auctionTitle);
    await expect(added).toContainText(info.vehicleTitle);
    expect(await awaitingPage.rowByVin(item.vin).count(), 'listed once').toBe(1);
  });
});
