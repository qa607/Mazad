import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import type { SupplierListPage, SupplierRow } from '@pages/backend/suppliers/supplier-list.page';
import {
  statusOptions,
  supplierFormats,
  supplierSearchData,
  supplierText,
  supplierUrls,
  unsafeSearchValues,
  yesNoOptions,
} from '@test-data/supplier.data';

// Pages open signed in as Dev Root; see devRootSession for what is recorded.
test.use(devRootSession);

/**
 * Filter values are taken from suppliers already on the list, so the tests only read data
 * and do not depend on particular records existing.
 */
async function sampleRow(list: SupplierListPage): Promise<SupplierRow> {
  await list.goto();
  const rows = await list.readRows();
  // Prefer a supplier with an email and a distinctive name.
  return rows.find((row) => row.Email && row['English Name'].length > 6) ?? rows[0];
}

async function expectNoResults(list: SupplierListPage): Promise<void> {
  await expect(list.emptyMessage).toHaveText(supplierText.emptyState);
  await expect(list.rows).toHaveCount(0);
  await expect(list.summary).toHaveCount(0);
  await expect(list.pagination).toHaveCount(0);
}

test.describe('Supplier List - single filters', { tag: ['@regression', '@functional'] }, () => {
  for (const status of statusOptions) {
    test(`Status "${status}" shows only ${status} suppliers`, async ({ supplierListPage }) => {
      await supplierListPage.goto();

      await supplierListPage.search({ status });

      await expect(supplierListPage.selectedFilterOption(supplierListPage.statusFilter)).toHaveText(
        shownOption(status),
      );
      const statuses = await supplierListPage.columnValues('Status');
      expect(statuses.length).toBeGreaterThan(0);
      expect(new Set(statuses)).toEqual(new Set([status]));
    });
  }

  test('Active and inactive results add up to all suppliers', async ({ supplierListPage }) => {
    await supplierListPage.goto();
    const all = await supplierListPage.totalCount();
    await supplierListPage.search({ status: 'active' });
    const active = await supplierListPage.totalCount();
    await supplierListPage.goto();
    await supplierListPage.search({ status: 'inactive' });
    const inactive = await supplierListPage.totalCount();

    expect(active + inactive).toBe(all);
  });

  test('Commission "Yes" shows only suppliers with a buyer commission amount', async ({
    supplierListPage,
  }) => {
    await supplierListPage.goto();

    await supplierListPage.search({ commission: 'Yes' });

    const values = await supplierListPage.columnValues('Buyer Commission');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toMatch(supplierFormats.commissionAmount);
  });

  test('Commission "No" shows only suppliers without a buyer commission', async ({
    supplierListPage,
  }) => {
    await supplierListPage.goto();

    await supplierListPage.search({ commission: 'No' });

    const values = await supplierListPage.columnValues('Buyer Commission');
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values)).toEqual(new Set([supplierText.no]));
  });

  test('Commission "Yes" and "No" results add up to all suppliers', async ({
    supplierListPage,
  }) => {
    await supplierListPage.goto();
    const all = await supplierListPage.totalCount();
    await supplierListPage.search({ commission: 'Yes' });
    const withCommission = await supplierListPage.totalCount();
    await supplierListPage.goto();
    await supplierListPage.search({ commission: 'No' });
    const withoutCommission = await supplierListPage.totalCount();

    expect(withCommission + withoutCommission).toBe(all);
  });

  for (const requestMojaz of yesNoOptions) {
    test(`Request Mojaz "${requestMojaz}" shows only matching suppliers`, async ({
      supplierListPage,
    }) => {
      await supplierListPage.goto();

      await supplierListPage.search({ requestMojaz });

      const values = await supplierListPage.columnValues('Request Mojaz');
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values)).toEqual(new Set([requestMojaz]));
    });
  }

  test('Exact phone finds that supplier', async ({ supplierListPage }) => {
    const sample = await sampleRow(supplierListPage);

    await supplierListPage.search({ phone: sample.Phone });

    await expect(supplierListPage.phoneFilter).toHaveValue(sample.Phone);
    await expect(supplierListPage.row(sample.ID)).toBeVisible();
    for (const phone of await supplierListPage.columnValues('Phone')) {
      expect(phone).toBe(sample.Phone);
    }
  });

  // The phone filter matches the whole number only (the name and email filters match part of
  // the text). Accepted behaviour, see test-data/supplier.data.ts.
  test('Part of a phone number finds nothing: the phone filter needs the full number', async ({
    supplierListPage,
  }) => {
    const sample = await sampleRow(supplierListPage);

    await supplierListPage.search({ phone: sample.Phone.slice(0, 6) });

    await expectNoResults(supplierListPage);
  });

  test('Partial English Name finds matching suppliers, ignoring case', async ({
    supplierListPage,
  }) => {
    const sample = await sampleRow(supplierListPage);
    const partial = sample['English Name'].slice(1, 6);

    await supplierListPage.search({ nameEn: partial.toUpperCase() });

    await expect(supplierListPage.row(sample.ID)).toBeVisible();
    for (const name of await supplierListPage.columnValues('English Name')) {
      expect(name.toLowerCase()).toContain(partial.toLowerCase());
    }
  });

  test('Partial Supplier Name En finds matching suppliers', async ({ supplierListPage }) => {
    const sample = await sampleRow(supplierListPage);
    const partial = sample['Supplier Name En'].slice(0, 5);

    await supplierListPage.search({ supplierNameEn: partial });

    await expect(supplierListPage.row(sample.ID)).toBeVisible();
    for (const name of await supplierListPage.columnValues('Supplier Name En')) {
      expect(name).toContain(partial);
    }
  });

  test('Partial email finds matching suppliers, ignoring case', async ({ supplierListPage }) => {
    const sample = await sampleRow(supplierListPage);
    const partial = sample.Email.split('@')[0].slice(0, 5);

    await supplierListPage.search({ email: partial.toUpperCase() });

    await expect(supplierListPage.row(sample.ID)).toBeVisible();
    for (const email of await supplierListPage.columnValues('Email')) {
      expect(email.toLowerCase()).toContain(partial.toLowerCase());
    }
  });

  test('Pressing Enter in a search field runs the search', async ({ supplierListPage }) => {
    const sample = await sampleRow(supplierListPage);
    await supplierListPage.fillFilters({ phone: sample.Phone });

    await supplierListPage.submitSearchWithEnter(supplierListPage.phoneFilter);

    await expect(supplierListPage.row(sample.ID)).toBeVisible();
  });
});

test.describe(
  'Supplier List - no results and unexpected input',
  { tag: ['@regression', '@negative'] },
  () => {
    test.beforeEach(async ({ supplierListPage }) => {
      await supplierListPage.goto();
    });

    for (const { name, filters } of supplierSearchData.noMatch) {
      test(`${name} shows the empty state`, async ({ supplierListPage }) => {
        await supplierListPage.search(filters);

        await expectNoResults(supplierListPage);
      });
    }

    for (const value of unsafeSearchValues) {
      test(`Search for ${JSON.stringify(value)} finds nothing and keeps the page working`, async ({
        supplierListPage,
      }) => {
        const dialogs = supplierListPage.countDialogs();

        await supplierListPage.search({ nameEn: value });

        await expectNoResults(supplierListPage);
        await expect(supplierListPage.nameEnFilter).toHaveValue(value);
        await expect(supplierListPage.searchButton).toBeEnabled();
        expect(dialogs(), 'search input must not run as script').toBe(0);
      });
    }
  },
);

test.describe(
  'Supplier List - combined filters, reset and persistence',
  { tag: ['@regression', '@functional'] },
  () => {
    test('Status and Request Mojaz together show suppliers matching both', async ({
      supplierListPage,
    }) => {
      await supplierListPage.goto();
      await supplierListPage.search({ status: 'active' });
      const activeTotal = await supplierListPage.totalCount();

      await supplierListPage.search({ requestMojaz: 'Yes' });

      const rows = await supplierListPage.readRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.Status).toBe('active');
        expect(row['Request Mojaz']).toBe('Yes');
      }
      expect(await supplierListPage.totalCount()).toBeLessThanOrEqual(activeTotal);
    });

    test('All three dropdown filters together show suppliers matching all of them', async ({
      supplierListPage,
    }) => {
      await supplierListPage.goto();

      await supplierListPage.search({ status: 'active', commission: 'No', requestMojaz: 'No' });

      for (const row of await supplierListPage.readRows()) {
        expect(row.Status).toBe('active');
        expect(row['Buyer Commission']).toBe('No');
        expect(row['Request Mojaz']).toBe('No');
      }
    });

    test('Phone with the opposite status finds nothing', async ({ supplierListPage }) => {
      const sample = await sampleRow(supplierListPage);
      const otherStatus = statusOptions.find((status) => status !== sample.Status)!;

      await supplierListPage.search({ phone: sample.Phone, status: otherStatus });

      await expectNoResults(supplierListPage);
    });

    test('Text and dropdown filters together narrow to the sample supplier', async ({
      supplierListPage,
    }) => {
      const sample = await sampleRow(supplierListPage);

      await supplierListPage.search({
        email: sample.Email,
        nameEn: sample['English Name'],
        status: sample.Status as 'active' | 'inactive',
        requestMojaz: sample['Request Mojaz'] as 'Yes' | 'No',
      });

      await expect(supplierListPage.row(sample.ID)).toBeVisible();
    });

    test('Reset clears every filter and shows all suppliers again', async ({
      page,
      supplierListPage,
    }) => {
      await supplierListPage.goto();
      const all = await supplierListPage.totalCount();
      await supplierListPage.search(supplierSearchData.everyFilter);

      await supplierListPage.reset();

      await expect(page).toHaveURL(supplierUrls.list);
      await expect(supplierListPage.phoneFilter).toBeEmpty();
      await expect(supplierListPage.nameEnFilter).toBeEmpty();
      await expect(supplierListPage.emailFilter).toBeEmpty();
      await expect(supplierListPage.selectedFilterOption(supplierListPage.statusFilter)).toHaveText(
        shownOption(supplierText.placeholders.status),
      );
      await expect(
        supplierListPage.selectedFilterOption(supplierListPage.commissionFilter),
      ).toHaveText(shownOption(supplierText.placeholders.all));
      await expect(
        supplierListPage.selectedFilterOption(supplierListPage.requestMojazFilter),
      ).toHaveText(shownOption(supplierText.placeholders.all));
      expect(await supplierListPage.totalCount()).toBe(all);
    });

    test('Reset after a search with no results brings the grid back', async ({
      supplierListPage,
    }) => {
      await supplierListPage.goto();
      await supplierListPage.search({ phone: supplierSearchData.unknownPhone });
      await expectNoResults(supplierListPage);

      await supplierListPage.reset();

      await expect(supplierListPage.rows.first()).toBeVisible();
      await expect(supplierListPage.summary).toBeVisible();
    });

    test('Filters and results stay the same after a page refresh', async ({
      page,
      supplierListPage,
    }) => {
      await supplierListPage.goto();
      await supplierListPage.search({ status: 'active', requestMojaz: 'Yes' });
      const rows = await supplierListPage.readRows();

      await page.reload();

      await expect(supplierListPage.selectedFilterOption(supplierListPage.statusFilter)).toHaveText(
        shownOption('active'),
      );
      await expect(
        supplierListPage.selectedFilterOption(supplierListPage.requestMojazFilter),
      ).toHaveText(shownOption('Yes'));
      expect(await supplierListPage.readRows()).toEqual(rows);
    });

    test('Filters stay applied when moving to the next page', async ({ supplierListPage }) => {
      await supplierListPage.goto();
      await supplierListPage.search({ status: 'active' });
      const { total } = await supplierListPage.summaryCounts();
      // eslint-disable-next-line playwright/no-skipped-test -- depends on live data volume
      test.skip(total <= 20, 'Needs more than one page of active suppliers.');

      await supplierListPage.goToNextPage();

      await expect(supplierListPage.selectedFilterOption(supplierListPage.statusFilter)).toHaveText(
        shownOption('active'),
      );
      const summary = await supplierListPage.summaryCounts();
      expect(summary.from).toBe(21);
      expect(summary.total).toBe(total);
      expect(new Set(await supplierListPage.columnValues('Status'))).toEqual(new Set(['active']));
    });

    test('A new search after paging starts again from page 1', async ({ supplierListPage }) => {
      await supplierListPage.goto();
      await supplierListPage.goToPage(2);

      await supplierListPage.search({ status: 'active' });

      expect((await supplierListPage.summaryCounts()).from).toBe(1);
      await expect(supplierListPage.activePage).toHaveText('1');
    });

    test('Filters stay applied when sorting', async ({ page, supplierListPage }) => {
      await supplierListPage.goto();
      await supplierListPage.search({ status: 'inactive' });
      const total = await supplierListPage.totalCount();

      await supplierListPage.sortBy('ID');

      await expect(page).toHaveURL(supplierUrls.statusFilter('inactive'));
      expect(await supplierListPage.totalCount()).toBe(total);
      const ids = (await supplierListPage.columnValues('ID')).map(Number);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(await supplierListPage.columnValues('Status'))).toEqual(new Set(['inactive']));
    });
  },
);
