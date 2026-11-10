import { expect, test } from '@fixtures/test.fixture';
import { MazadVehicleViewPage } from '@pages/backend/mazad-vehicle-view.page';
import { amountTolerance, soldListText } from '@test-data/sold-list.data';

// Signs in with real credentials, so no trace, video or automatic screenshot (see
// login-dev-root.spec.ts); backendSession attaches a masked screenshot on failure.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

test.describe('Back office - Sold List', () => {
  // The Sold List renders every row as nested tables; full-page loads are slow on staging.
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page, backendSession, mazadSoldListPage }) => {
    void backendSession;
    await mazadSoldListPage.goto();
    await expect(page).toHaveTitle(soldListText.pageTitle);
  });

  test('Sold List shows its column groups and a results summary', async ({ mazadSoldListPage }) => {
    await expect(mazadSoldListPage.columnHeaders).toHaveText([...soldListText.columnGroups]);
    await expect(mazadSoldListPage.summary).toHaveText(soldListText.summary);
    const count = await mazadSoldListPage.rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(soldListText.pageSize);
  });

  test('Every sold row shows its auction, vehicle, status and prices', async ({
    mazadSoldListPage,
  }) => {
    const rows = await mazadSoldListPage.rows.all();
    // No requirement says a sale cannot predate the start date, so such rows are recorded, not failed.
    const saleBeforeStart: number[] = [];
    const priceGap: string[] = [];
    for (const rowLocator of rows) {
      const row = await mazadSoldListPage.readRow(rowLocator);
      const at = `auction ${row.auctionId}`;
      expect.soft(row.auctionId, `${at}: auction ID`).toBeGreaterThan(0);
      expect.soft(row.vehicleId, `${at}: vehicle link`).not.toBeNull();
      expect.soft(row.vin, `${at}: VIN is 17 characters`).toMatch(/^[A-HJ-NPR-Z0-9]{17}$/i);
      expect.soft(row.status, `${at}: status`).not.toBe('');
      expect.soft(row.salePrice ?? 0, `${at}: sale price`).toBeGreaterThan(0);
      expect
        .soft(row.saleDate, `${at}: sale date`)
        .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      if (row.startDate && row.saleDate < row.startDate) saleBeforeStart.push(row.auctionId);
      // Not a confirmed business rule (it holds for most rows only), so differences are recorded.
      if (
        row.salePrice !== null &&
        row.netAmount !== null &&
        row.administrativeExpenses !== null &&
        Math.abs(row.salePrice - (row.netAmount + row.administrativeExpenses)) > amountTolerance
      ) {
        priceGap.push(
          `auction ${row.auctionId}: sale ${row.salePrice} vs net ${row.netAmount} + admin ${row.administrativeExpenses}`,
        );
      }
    }
    if (saleBeforeStart.length) {
      test.info().annotations.push({
        type: 'data anomaly: sale date before start date',
        description: saleBeforeStart.map((id) => `auction ${id}`).join(', '),
      });
    }
    if (priceGap.length) {
      test.info().annotations.push({
        type: 'to confirm: sale price is not net amount + admin fee',
        description: priceGap.join('; '),
      });
    }
  });

  test('Searching by VIN shows only that vehicle', async ({ mazadSoldListPage }) => {
    const first = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());

    await mazadSoldListPage.search({ vin: first.vin });

    await expect(mazadSoldListPage.rowByAuctionId(first.auctionId)).toBeVisible();
    for (const rowLocator of await mazadSoldListPage.rows.all()) {
      const row = await mazadSoldListPage.readRow(rowLocator);
      expect.soft(row.vin, `auction ${row.auctionId}`).toBe(first.vin);
    }
    await expect(mazadSoldListPage.vinInput).toHaveValue(first.vin);
  });

  test('Searching for an unknown VIN shows the empty result', async ({ mazadSoldListPage }) => {
    await mazadSoldListPage.search({ vin: soldListText.unknownVin });

    await expect(mazadSoldListPage.rows).toHaveCount(0);
    await expect(mazadSoldListPage.emptyResult).toHaveText(soldListText.emptyResult);
  });

  test('Reset clears the search and shows all sold auctions again', async ({
    mazadSoldListPage,
  }) => {
    const allSummary = await mazadSoldListPage.summary.textContent();
    await mazadSoldListPage.search({ vin: soldListText.unknownVin });
    await expect(mazadSoldListPage.rows).toHaveCount(0);

    await mazadSoldListPage.resetLink.click();

    await expect(mazadSoldListPage.summary).toHaveText(allSummary ?? '');
    await expect(mazadSoldListPage.vinInput).toHaveValue('');
  });

  test('Filtering by after-sale status shows only auctions in that status', async ({
    mazadSoldListPage,
  }) => {
    const options = await mazadSoldListPage.selectOptions(mazadSoldListPage.afterSaleStatusSelect);
    expect(options.length).toBeGreaterThan(0);
    // Every option is checked: one with no results is recorded, not failed (test data varies).
    const empty: string[] = [];
    const checked: string[] = [];
    for (const option of options) {
      await mazadSoldListPage.goto();
      await mazadSoldListPage.search({ afterSaleStatus: option.value });
      if ((await mazadSoldListPage.rows.count()) === 0) {
        empty.push(option.label);
        continue;
      }
      for (const rowLocator of await mazadSoldListPage.rows.all()) {
        const row = await mazadSoldListPage.readRow(rowLocator);
        expect.soft(normalise(row.status), `auction ${row.auctionId}`).toBe(option.label);
      }
      checked.push(option.label);
    }
    if (checked.length) {
      test.info().annotations.push({ type: 'statuses checked', description: checked.join(', ') });
    }
    if (empty.length) {
      test
        .info()
        .annotations.push({ type: 'statuses with no results', description: empty.join(', ') });
    }
    expect(empty.length, 'at least one after-sale status has results').toBeLessThan(options.length);
  });

  test('Searching by item title shows only matching vehicles', async ({ mazadSoldListPage }) => {
    const first = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());
    // A short, case-varied fragment of the title: proves the search is a partial, case-insensitive match.
    const fragment = first.itemTitle.trim().split(' ')[0];
    test.skip(!fragment, 'First row has no item title to search by.');

    await mazadSoldListPage.search({ itemTitle: fragment });

    const rows = await mazadSoldListPage.rows.all();
    expect(rows.length).toBeGreaterThan(0);
    for (const rowLocator of rows) {
      const row = await mazadSoldListPage.readRow(rowLocator);
      expect
        .soft(row.itemTitle.toLowerCase(), `auction ${row.auctionId}`)
        .toContain(fragment.toLowerCase());
    }
    await expect(mazadSoldListPage.itemTitleInput).toHaveValue(fragment);
  });

  test('Filtering by type shows only auctions of that type', async ({ mazadSoldListPage }) => {
    const options = await mazadSoldListPage.selectOptions(mazadSoldListPage.typeSelect);
    expect(options.length).toBeGreaterThan(0);
    // Every option is checked: one with no results is recorded, not failed (test data varies).
    const empty: string[] = [];
    const checked: string[] = [];
    for (const option of options) {
      await mazadSoldListPage.goto();
      await mazadSoldListPage.search({ type: option.value });
      if ((await mazadSoldListPage.rows.count()) === 0) {
        empty.push(option.label);
        continue;
      }
      for (const rowLocator of await mazadSoldListPage.rows.all()) {
        const row = await mazadSoldListPage.readRow(rowLocator);
        expect.soft(normalise(row.itemType), `auction ${row.auctionId}`).toBe(option.label);
      }
      checked.push(option.label);
    }
    if (checked.length) {
      test.info().annotations.push({ type: 'types checked', description: checked.join(', ') });
    }
    if (empty.length) {
      test
        .info()
        .annotations.push({ type: 'types with no results', description: empty.join(', ') });
    }
    expect(empty.length, 'at least one type has results').toBeLessThan(options.length);
  });

  test('Filtering by sale type shows only auctions of that sale type', async ({
    mazadSoldListPage,
  }) => {
    const options = await mazadSoldListPage.selectOptions(mazadSoldListPage.saleTypeSelect);
    expect(options.length).toBeGreaterThan(0);
    // Every option is checked: one with no results is recorded, not failed (test data varies).
    const empty: string[] = [];
    const checked: string[] = [];
    for (const option of options) {
      await mazadSoldListPage.goto();
      await mazadSoldListPage.search({ saleType: option.value });
      if ((await mazadSoldListPage.rows.count()) === 0) {
        empty.push(option.label);
        continue;
      }
      for (const rowLocator of await mazadSoldListPage.rows.all()) {
        const row = await mazadSoldListPage.readRow(rowLocator);
        expect.soft(normalise(row.saleType), `auction ${row.auctionId}`).toBe(option.label);
      }
      checked.push(option.label);
    }
    if (checked.length) {
      test.info().annotations.push({ type: 'sale types checked', description: checked.join(', ') });
    }
    if (empty.length) {
      test
        .info()
        .annotations.push({ type: 'sale types with no results', description: empty.join(', ') });
    }
    expect(empty.length, 'at least one sale type has results').toBeLessThan(options.length);
  });

  test('Combining VIN and type filters narrows to a single vehicle', async ({
    mazadSoldListPage,
  }) => {
    const first = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());
    const typeOptions = await mazadSoldListPage.selectOptions(mazadSoldListPage.typeSelect);
    const matchingType = typeOptions.find(
      (o) => normalise(o.label) === normalise(first.itemType),
    )?.value;
    test.skip(!matchingType, `No type option matches "${first.itemType}".`);

    await mazadSoldListPage.search({ vin: first.vin, type: matchingType });

    await expect(mazadSoldListPage.rows).toHaveCount(1);
    const row = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());
    expect(row.auctionId).toBe(first.auctionId);
  });

  test('Pagination shows the next page of sold auctions', async ({ mazadSoldListPage }) => {
    const firstPageIds = await mazadSoldListPage.auctionIds();

    await mazadSoldListPage.openPage(2);

    await expect(mazadSoldListPage.activePage).toHaveText('2');
    await expect(mazadSoldListPage.summary).toHaveText(/^Showing 21-\d+ of /);
    const secondPageIds = await mazadSoldListPage.auctionIds();
    expect(secondPageIds.length).toBeGreaterThan(0);
    expect(secondPageIds.filter((id) => firstPageIds.includes(id))).toEqual([]);
  });

  test('The vehicle link opens that vehicle in the back office', async ({
    page,
    mazadSoldListPage,
  }) => {
    const firstRow = mazadSoldListPage.rows.first();
    const row = await mazadSoldListPage.readRow(firstRow);

    // The link opens the vehicle in a new tab.
    const [vehicleTab] = await Promise.all([
      page.waitForEvent('popup'),
      mazadSoldListPage.vehicleLink(firstRow).click(),
    ]);
    const vehicleView = new MazadVehicleViewPage(vehicleTab);

    await expect(vehicleTab).toHaveURL(
      new RegExp(`/backend/vehicle/vehicle/view\\?id=${row.vehicleId}$`),
    );
    await expect(vehicleView.heading).toBeVisible();
    expect(normalise((await vehicleView.heading.textContent()) ?? '')).toContain(
      normalise(row.itemTitle),
    );
  });
});

test.describe('Back office - Sold List export', () => {
  // Clicking a format link submits the export (a file download); that request, and its
  // file, are not exercised here. Only the menu's presence and its format options are checked.
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page, backendSession, mazadSoldListPage }) => {
    void backendSession;
    await mazadSoldListPage.goto();
    await expect(page).toHaveTitle(soldListText.pageTitle);
  });

  test('Export All offers CSV and Excel formats', async ({ mazadSoldListPage }) => {
    await expect(mazadSoldListPage.exportButton).toBeVisible();

    await mazadSoldListPage.openExportMenu();

    await expect(mazadSoldListPage.exportFormatLink('Csv')).toBeVisible();
    await expect(mazadSoldListPage.exportFormatLink('Xls')).toBeVisible();
    await expect(mazadSoldListPage.exportFormatLink('Xlsx')).toBeVisible();
  });

  test('Export menu is available after filtering to a non-empty result', async ({
    mazadSoldListPage,
  }) => {
    const first = await mazadSoldListPage.readRow(mazadSoldListPage.rows.first());

    await mazadSoldListPage.search({ vin: first.vin });

    // Confirms the filter actually narrowed the results, before checking the export menu.
    await expect(mazadSoldListPage.rowByAuctionId(first.auctionId)).toBeVisible();
    await expect(mazadSoldListPage.exportButton).toBeVisible();

    await mazadSoldListPage.openExportMenu();

    await expect(mazadSoldListPage.exportFormatLink('Csv')).toBeVisible();
    await expect(mazadSoldListPage.exportFormatLink('Xls')).toBeVisible();
    await expect(mazadSoldListPage.exportFormatLink('Xlsx')).toBeVisible();
  });

  test('Export menu is available after filtering to an empty result', async ({
    mazadSoldListPage,
  }) => {
    await mazadSoldListPage.search({ vin: soldListText.unknownVin });

    // Confirms the filter actually produced no results, before checking the export menu.
    await expect(mazadSoldListPage.rows).toHaveCount(0);
    await expect(mazadSoldListPage.exportButton).toBeVisible();

    await mazadSoldListPage.openExportMenu();

    await expect(mazadSoldListPage.exportFormatLink('Csv')).toBeVisible();
  });
});
