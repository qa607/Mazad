import { expect, test } from '@fixtures/test.fixture';
import {
  type CancellationStatus,
  cancellationStatuses,
} from '@pages/backend/request-cancellation/car-cancellation.page';
import {
  type AccessProfile,
  backendHomePath,
  expectedAccess,
  forbiddenStatus,
} from '@test-data/backend-permissions.data';
import {
  cancellationActions,
  carCancellationAccess,
  carCancellationData,
  carCancellationText,
  carCancellationUrls,
} from '@test-data/backend-car-cancellation.data';

// Request Cancellation > Car (/backend/requestCancellation/car-cancellation/index): customers'
// requests to cancel a car purchase. Read-only: no request's status is ever changed. Customer
// names and phones stay out of test titles. Then, who can open the page and send its requests.

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const statuses = Object.keys(cancellationStatuses) as CancellationStatus[];

test.describe('Backend - Car Cancellations', () => {
  test.use({ signedInAs: 'devRoot' });

  test.beforeEach(async ({ page, carCancellationPage }) => {
    await carCancellationPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(carCancellationUrls.list);
  });

  test('Page shows the heading, filters and the requests grid', async ({
    page,
    carCancellationPage: list,
  }) => {
    await expect(page).toHaveTitle(carCancellationText.pageTitle);
    await expect(list.pageHeading).toHaveText(carCancellationText.pageTitle);
    await expect(list.breadcrumbCurrent).toHaveText(carCancellationText.pageTitle);
    await expect(list.sidebarLink).toHaveText(carCancellationText.sidebarLabel);

    await expect(list.requestIdInput).toBeEditable();
    await expect(list.vinInput).toBeEditable();
    await expect(list.titleInput).toBeEditable();
    await expect(list.columnHeaders).toHaveText([...carCancellationText.columnHeaders]);
    await expect(list.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
  });

  test.describe('statuses', () => {
    test('Pending + Approve + Decline cover every request', async ({
      carCancellationPage: list,
    }) => {
      const total = await list.totalCount();
      let sum = 0;

      for (const status of statuses) {
        await test.step(cancellationStatuses[status], async () => {
          await list.gotoFiltered({ status });
          const shown = (await list.readRows()).map((row) => row.status);
          expect(shown.filter((label) => label !== cancellationStatuses[status])).toEqual([]);
          sum += await list.totalCount();
        });
      }

      expect(sum, 'requests across all statuses').toBe(total);
    });

    test('Status filter in the form selects that status', async ({ carCancellationPage: list }) => {
      await list.filterByStatus('approve');

      await expect(list.statusValue).toContainText(cancellationStatuses.approve);
      const shown = (await list.readRows()).map((row) => row.status);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.filter((label) => label !== cancellationStatuses.approve)).toEqual([]);
    });

    test('A decided request can no longer change status', async ({ carCancellationPage: list }) => {
      const decided = (await list.readRows()).filter((row) => row.status !== 'Pending');

      expect(decided.filter((row) => row.statusEditable).map((row) => row.id)).toEqual([]);
    });

    test('A declined request leaves the vehicle sold', async ({ carCancellationPage: list }) => {
      await list.gotoFiltered({ status: 'decline' });
      const rows = await list.readRows();
      test.skip(rows.length === 0, 'No declined request right now.');

      expect(rows.filter((row) => row.itemStatus !== 'sold').map((row) => row.id)).toEqual([]);
    });
  });

  test.describe('rows (every request on the first page)', () => {
    test('Requests are listed newest first', async ({ carCancellationPage: list }) => {
      const ids = (await list.readRows()).map((row) => Number(row.id));

      expect(ids).toEqual([...ids].sort((a, b) => b - a));
    });

    test('Updated At is never before the request date', async ({ carCancellationPage: list }) => {
      const rows = await list.readRows();

      expect(rows.filter((row) => row.updatedAt < row.requestDate).map((row) => row.id)).toEqual(
        [],
      );
    });

    test('The vehicle is either sold or failed', async ({ carCancellationPage: list }) => {
      const statusesShown = (await list.readRows()).map((row) => row.itemStatus);

      expect(
        statusesShown.filter(
          (status) => !(carCancellationText.itemStatuses as readonly string[]).includes(status),
        ),
      ).toEqual([]);
    });
  });

  test.describe('filters', () => {
    test('Request ID, VIN and title find the request', async ({ carCancellationPage: list }) => {
      const [first] = await list.readRows();

      await test.step('request ID', async () => {
        await list.searchByRequestId(first.id);
        await expect(list.rows).toHaveCount(1);
        await expect(list.row(first.id)).toHaveCount(1);
      });
      await test.step('full VIN', async () => {
        await list.reset();
        await list.searchByVin(first.vin);
        await expect(list.row(first.id)).toHaveCount(1);
      });
      await test.step('part of the VIN', async () => {
        await list.reset();
        const part = first.vin.slice(0, carCancellationData.partialVinLength);
        await list.searchByVin(part);
        const vins = (await list.readRows()).map((row) => row.vin);
        expect(vins.filter((vin) => !vin.includes(part))).toEqual([]);
      });
      await test.step('unknown VIN', async () => {
        await list.reset();
        await list.searchByVin(carCancellationData.unknownVin);
        await expect(list.emptyMessage).toHaveText(carCancellationText.noResults);
      });
      await test.step('title', async () => {
        await list.reset();
        const make = first.title.split(' ')[0];
        await list.searchByTitle(make);
        await expect(list.row(first.id)).toHaveCount(1);
      });
    });

    test('Customer Type: Individual + Dealer = all requests', async ({
      carCancellationPage: list,
    }) => {
      const total = await list.totalCount();
      let sum = 0;

      for (const type of carCancellationText.customerTypes) {
        await test.step(type, async () => {
          await list.filterByCustomerType(type);
          await expect(list.customerTypeValue).toContainText(type);
          sum += await list.totalCount();
        });
      }

      expect(sum).toBe(total);
    });

    test('Supplier shows only that supplier’s requests', async ({ carCancellationPage: list }) => {
      await list.filterBySupplier(carCancellationData.supplierOption);

      const suppliers = (await list.readRows()).map((row) => row.supplier);
      expect(suppliers.length).toBeGreaterThan(0);
      expect(suppliers.filter((s) => s !== carCancellationData.supplierName)).toEqual([]);
    });

    test('Reason shows only requests with that reason', async ({ carCancellationPage: list }) => {
      await list.filterByReason(carCancellationText.reason);

      const reasons = (await list.readRows()).map((row) => row.reason);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.filter((reason) => reason !== carCancellationText.reason)).toEqual([]);
    });

    test('The "Other" reason is shown as "Other"', async ({ carCancellationPage: list }) => {
      // Known gap (found 2026-11-09): requests filtered by the "Other" reason (49 on staging)
      // show "(not set)" in both Reason and Reason Text, so the customer's reason is lost.
      // Remove test.fail() once they show "Other" and the customer's text.
      test.fail(true, 'Known gap: "Other" reasons show "(not set)".');

      await list.filterByReason(carCancellationText.otherReason);

      const reasons = (await list.readRows()).map((row) => row.reason);
      expect(reasons.filter((reason) => reason === carCancellationText.notSet)).toEqual([]);
    });

    test('Reset clears the filters', async ({ page, carCancellationPage: list }) => {
      const total = await list.totalCount();
      await list.searchByVin(carCancellationData.unknownVin);
      await expect(list.emptyMessage).toBeVisible();

      await list.reset();

      await expect(page).toHaveURL(/\/backend\/requestCancellation\/car-cancellation\/index$/);
      expect(await list.totalCount()).toBe(total);
    });
  });

  test.describe('sorting', () => {
    test('Request Id sorts ascending, then descending', async ({ carCancellationPage: list }) => {
      await list.sortBy('Request Id');
      const ascending = (await list.readRows()).map((row) => Number(row.id));
      expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

      await list.sortBy('Request Id');
      const descending = (await list.readRows()).map((row) => Number(row.id));
      expect(descending).toEqual([...descending].sort((a, b) => b - a));
    });

    test('Request Date sorts ascending, then descending', async ({ carCancellationPage: list }) => {
      await list.sortBy('Request Date');
      const ascending = (await list.readRows()).map((row) => row.requestDate);
      expect(ascending).toEqual([...ascending].sort());

      await list.sortBy('Request Date');
      const descending = (await list.readRows()).map((row) => row.requestDate);
      expect(descending).toEqual([...descending].sort().reverse());
    });
  });

  test.describe('links', () => {
    test('Customer name opens the customer in a new tab', async ({
      page,
      carCancellationPage: list,
    }) => {
      const row = list.rows.first();

      const [tab] = await Promise.all([
        page.context().waitForEvent('page'),
        list.customerLink(row).click(),
      ]);
      await tab.waitForLoadState();

      await expect(tab).toHaveURL(carCancellationUrls.customer);
    });

    test('Vehicle title opens the vehicle in a new tab', async ({
      page,
      carCancellationPage: list,
    }) => {
      const row = list.rows.first();
      const { title } = await list.readRow(row);

      const [tab] = await Promise.all([
        page.context().waitForEvent('page'),
        list.vehicleLink(row).click(),
      ]);
      await tab.waitForLoadState();

      await expect(tab).toHaveURL(carCancellationUrls.vehicle);
      expect((await tab.title()).replace(/\s+/g, ' ')).toContain(title.replace(/\s+/g, ' '));
    });
  });
});

const profiles = Object.keys(carCancellationAccess) as AccessProfile[];

for (const profile of profiles) {
  const access = carCancellationAccess[profile];

  test.describe(`Car Cancellations permissions - ${expectedAccess[profile].label}`, () => {
    test.use({ signedInAs: profile });

    test(`${access.page ? 'can' : 'cannot'} open Car Cancellations`, async ({ page }) => {
      const response = await page.goto('/backend/requestCancellation/car-cancellation/index');

      expect(response?.status()).toBe(access.page ? 200 : forbiddenStatus);
    });

    test(`the sidebar ${access.page ? 'links to' : 'has no link to'} Car Cancellations`, async ({
      page,
    }) => {
      await page.goto(backendHomePath);

      await expect(
        page.locator('.app-sidebar a[href="/backend/requestCancellation/car-cancellation/index"]'),
      ).toHaveCount(access.page ? 1 : 0);
    });

    for (const key of ['decide', 'moveToFailed'] as const) {
      const action = cancellationActions[key];
      // Sent only where it must be refused; an allowed role could change real data.
      if (access[key]) continue;

      test(`server rejects "${action.label}"`, async ({ page, mazadDashboardPage }) => {
        await page.goto(backendHomePath);

        const status =
          action.method === 'POST'
            ? await mazadDashboardPage.postAction(
                `${action.path}?${new URLSearchParams(action.form).toString()}`,
              )
            : (await page.request.get(action.path, { maxRedirects: 0 })).status();

        expect(status, `${action.label} HTTP status`).toBe(forbiddenStatus);
      });
    }
  });
}
