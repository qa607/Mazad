import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type {
  MemberFilters,
  MemberRow,
  SupplierMemberListPage,
} from '@pages/backend/suppliers/supplier-member-list.page';
import {
  allOnOnePage,
  isTestMember,
  noMatchName,
  pagingSize,
  supplierMemberText,
  unusualFilterValues,
} from '@test-data/supplier-member.data';

/**
 * Mazad Backend > Supplier Members: search filters. Read-only. Expected results are worked out
 * from the full, unfiltered list read before each test, so the tests follow whatever data staging
 * holds. QA-AUTO test members are left out: supplier-member-crud.spec.ts adds and deletes one in
 * parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const ALL = { 'per-page': String(allOnOnePage) };
const lower = (text: string) => text.toLowerCase();
const ids = (rows: MemberRow[]) =>
  rows
    .filter((row) => !isTestMember(row))
    .map((row) => row.ID)
    .sort();

let all: MemberRow[] = [];
/** A member with an email whose Arabic and English names differ. */
let sample: MemberRow;

test.beforeEach(async ({ supplierMemberListPage: list }) => {
  await list.open({}, ALL);
  all = (await list.readRows()).filter((row) => !isTestMember(row));
  sample =
    all.find((row) => row.Email !== '(not set)' && row['Arabic Name'] !== row['English Name']) ??
    all[0];
});

/** Searches through the form and checks the grid shows exactly the matching members. */
async function expectResults(
  list: SupplierMemberListPage,
  filters: MemberFilters,
  matches: (row: MemberRow) => boolean,
): Promise<void> {
  await list.goto();
  await list.searchBy(filters);
  const shown = await list.readRows();
  expect(ids(shown), JSON.stringify(filters)).toEqual(ids(all.filter(matches)));
  expect(await list.totalCount()).toBe(shown.length);
}

test.describe('Supplier Members - each filter', { tag: ['@regression'] }, () => {
  test(
    'Phone: the full number finds that member',
    { tag: ['@smoke', '@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await expectResults(list, { phone: sample.Phone }, (r) => r.Phone === sample.Phone);
    },
  );

  test(
    'Phone: part of a number finds nothing (full number only)',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ phone: sample.Phone.slice(0, 6) });

      await expect(list.emptyMessage).toHaveText(supplierMemberText.emptyState);
    },
  );

  test(
    'Arabic Name: part of an Arabic name',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const arabic = all.find((row) => /[؀-ۿ]/.test(row['Arabic Name']));
      test.skip(!arabic, 'No member with an Arabic name.');
      const part = arabic!['Arabic Name'].split(' ')[0];
      await expectResults(list, { name: part }, (r) => r['Arabic Name'].includes(part));
    },
  );

  test(
    'English Name: partial and case-insensitive',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const part = sample['English Name'].split(' ')[0];
      const matches = (r: MemberRow) => lower(r['English Name']).includes(lower(part));
      await expectResults(list, { nameEn: part.toUpperCase() }, matches);
      await expectResults(list, { nameEn: part.toLowerCase() }, matches);
    },
  );

  test(
    'English Name: surrounding spaces are ignored',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const name = sample['English Name'];
      await expectResults(list, { nameEn: `  ${name}  ` }, (r) =>
        lower(r['English Name']).includes(lower(name)),
      );
    },
  );

  test(
    'Email: part of the address, any case',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const domain = sample.Email.split('@')[1] ?? sample.Email;
      await expectResults(list, { email: domain.toUpperCase() }, (r) =>
        lower(r.Email).includes(lower(domain)),
      );
    },
  );

  for (const status of ['active', 'inactive'] as const) {
    test(
      `Status: ${status}`,
      { tag: ['@functional'] },
      async ({ supplierMemberListPage: list }) => {
        await expectResults(list, { status }, (r) => r.Status === status);
        await expect(list.selectedStatus()).toContainText(status);
      },
    );
  }
});

test.describe('Supplier Members - combined filters', { tag: ['@regression'] }, () => {
  test(
    'English Name and Status together',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const part = sample['English Name'].split(' ')[0];
      await expectResults(
        list,
        { nameEn: part, status: 'active' },
        (r) => lower(r['English Name']).includes(lower(part)) && r.Status === 'active',
      );
    },
  );

  test(
    'All five filters matching one member',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await expectResults(
        list,
        {
          phone: sample.Phone,
          name: sample['Arabic Name'],
          nameEn: sample['English Name'],
          email: sample.Email,
          status: sample.Status as 'active' | 'inactive',
        },
        (r) => r.ID === sample.ID,
      );
    },
  );

  test(
    'Contradicting filters show the empty state',
    { tag: ['@negative'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({
        phone: sample.Phone,
        status: sample.Status === 'active' ? 'inactive' : 'active',
      });

      await expect(list.emptyMessage).toHaveText(supplierMemberText.emptyState);
      await expect(list.summary).toHaveCount(0);
      await expect(list.rows).toHaveCount(0);
    },
  );
});

test.describe('Supplier Members - filter behaviour', { tag: ['@regression'] }, () => {
  test(
    'Enter in a text filter runs the search',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.nameEnFilter.fill(sample['English Name']);
      await list.searchWithEnter(list.nameEnFilter);

      expect(await list.columnValues('ID')).toContain(sample.ID);
      expect(ids(await list.readRows()).length).toBeLessThan(all.length);
    },
  );

  test(
    'Reset clears every filter and shows all members',
    { tag: ['@functional'] },
    async ({ page, supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: sample['English Name'], status: 'active' });

      await list.reset();

      await expect(list.nameEnFilter).toHaveValue('');
      await expect(list.selectedStatus()).toHaveText(supplierMemberText.statusPlaceholder);
      expect(page.url()).not.toContain('SupplierMemberSearch');
      expect(ids(await list.readRows())).toEqual(ids(all));
    },
  );

  test(
    'Changing the status and searching again replaces the results',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ status: 'inactive' });
      await list.searchBy({ status: 'active' });

      const shown = await list.readRows();
      expect(shown.map((r) => r.Status)).not.toContain('inactive');
      expect(ids(shown)).toEqual(ids(all.filter((r) => r.Status === 'active')));
    },
  );

  test(
    'Clearing a text filter and searching shows all members again',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: sample['English Name'] });
      await list.searchBy({ nameEn: '' });

      expect(ids(await list.readRows())).toEqual(ids(all));
    },
  );

  test(
    'Filters survive a page refresh',
    { tag: ['@functional'] },
    async ({ page, supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: 'a', status: 'active' });
      const before = ids(await list.readRows());

      await page.reload();

      expect(ids(await list.readRows())).toEqual(before);
      await expect(list.nameEnFilter).toHaveValue('a');
      await expect(list.selectedStatus()).toContainText('active');
    },
  );

  test(
    'Filters are kept when sorting',
    { tag: ['@functional'] },
    async ({ page, supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ status: 'active' });
      const before = ids(await list.readRows());

      await list.sortBy('Phone');

      expect(page.url()).toContain('SupplierMemberSearch');
      expect(ids(await list.readRows())).toEqual(before);
      const phones = await list.columnValues('Phone');
      expect(phones).toEqual([...phones].sort());
    },
  );

  test(
    'Filters are kept across pages',
    { tag: ['@functional'] },
    async ({ supplierMemberListPage: list }) => {
      const active = all.filter((r) => r.Status === 'active');
      test.skip(active.length <= pagingSize, `Needs more than ${pagingSize} active members.`);
      const seen: MemberRow[] = [];
      for (let n = 1; n <= Math.ceil((active.length + 1) / pagingSize); n++) {
        await list.open({ status: 'active' }, { 'per-page': String(pagingSize), page: String(n) });
        seen.push(...(await list.readRows()));
      }

      expect(seen.map((r) => r.Status)).not.toContain('inactive');
      expect(ids(seen)).toEqual(ids(active));
    },
  );

  test(
    'A new search starts again from page 1',
    { tag: ['@functional'] },
    async ({ page, supplierMemberListPage: list }) => {
      await list.openPage(2, pagingSize);
      await list.searchBy({ nameEn: 'a' });

      expect(new URL(page.url()).searchParams.get('page')).toBeNull();
    },
  );

  test(
    'No match shows "No results found." and no summary',
    { tag: ['@negative'] },
    async ({ supplierMemberListPage: list }) => {
      await list.goto();
      await list.searchBy({ nameEn: noMatchName });

      await expect(list.emptyMessage).toHaveText(supplierMemberText.emptyState);
      await expect(list.summary).toHaveCount(0);
    },
  );

  for (const { name, value } of unusualFilterValues) {
    test(
      `English Name filter handles ${name}`,
      { tag: ['@negative'] },
      async ({ supplierMemberListPage: list }) => {
        const dialogs = list.countDialogs();

        await list.open({ nameEn: value });

        expect(dialogs(), 'no script ran').toBe(0);
        await expect(list.nameEnFilter).toHaveValue(value);
        expect(ids(await list.readRows())).toEqual(
          ids(all.filter((r) => lower(r['English Name']).includes(lower(value)))),
        );
      },
    );
  }
});
