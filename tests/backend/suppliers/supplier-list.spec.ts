import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import { backendUrls } from '@test-data/backend-login.data';
import {
  pageSize,
  statusOptions,
  supplierColumns,
  supplierDetailLabels,
  supplierFormats,
  supplierText,
  supplierUrls,
  yesNoOptions,
} from '@test-data/supplier.data';

// Pages open signed in as Dev Root; see devRootSession for what is recorded.
test.use(devRootSession);

test.describe('Supplier List - page and grid', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, supplierListPage }) => {
    await supplierListPage.goto();
    await expect(page).toHaveURL(supplierUrls.list);
  });

  test(
    'Page shows the title, breadcrumb, filters and Create button',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage }) => {
      await expect(page).toHaveTitle(supplierText.listTitle);
      await expect(supplierListPage.pageHeading).toContainText(supplierText.listTitle);
      await expect(supplierListPage.breadcrumb).toContainText(supplierText.listTitle);
      for (const filter of [
        supplierListPage.phoneFilter,
        supplierListPage.nameEnFilter,
        supplierListPage.supplierNameEnFilter,
        supplierListPage.emailFilter,
        supplierListPage.statusFilter,
        supplierListPage.commissionFilter,
        supplierListPage.requestMojazFilter,
      ]) {
        await expect(filter).toBeVisible();
      }
      await expect(supplierListPage.searchButton).toBeEnabled();
      await expect(supplierListPage.resetButton).toBeVisible();
      await expect(supplierListPage.createButton).toBeVisible();
    },
  );

  test(
    'Filters start empty with their default options',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      await expect(supplierListPage.phoneFilter).toBeEmpty();
      await expect(supplierListPage.nameEnFilter).toBeEmpty();
      await expect(supplierListPage.supplierNameEnFilter).toBeEmpty();
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
    },
  );

  test(
    'Grid shows all columns in order',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      await expect(supplierListPage.columnHeaders).toHaveText([...supplierColumns]);
    },
  );

  test(
    'Summary matches the rows shown and the first page holds 20 rows',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      const { from, to, total } = await supplierListPage.summaryCounts();
      expect(from).toBe(1);
      expect(to).toBe(Math.min(pageSize, total));
      await expect(supplierListPage.rows).toHaveCount(to);
    },
  );

  test(
    'Row numbers run from 1 and every row has a numeric, unique ID',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      const numbers = await supplierListPage.columnValues('#');
      const ids = await supplierListPage.columnValues('ID');

      expect(numbers).toEqual(numbers.map((_, index) => String(index + 1)));
      for (const id of ids) expect(id).toMatch(supplierFormats.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  test(
    'Every row shows well-formed values',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      const rows = await supplierListPage.readRows();
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        const where = `supplier ${row.ID}`;
        expect(statusOptions, where).toContain(row.Status);
        expect(yesNoOptions, where).toContain(row['Request Mojaz']);
        // Buyer Commission is "No" or an amount.
        expect(row['Buyer Commission'], where).toMatch(supplierFormats.commission);
        expect(row['Vehicles Count'], where).toMatch(supplierFormats.count);
        expect(row.Phone, where).toMatch(supplierFormats.phone);
        expect(row['Joining Date'], where).toMatch(supplierFormats.dateTime);
        expect(row['English Name'], where).not.toBe('');
        // Email is optional and may hold several addresses separated by commas.
        for (const email of row.Email.split(',').filter(Boolean)) {
          expect(email.trim(), where).toMatch(supplierFormats.email);
        }
      }
    },
  );

  test(
    'Every row has View and Update actions for its own supplier',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      for (const id of await supplierListPage.columnValues('ID')) {
        await expect(supplierListPage.viewLink(id)).toBeVisible();
        await expect(supplierListPage.updateLink(id)).toBeVisible();
      }
    },
  );

  test(
    'Default order is newest Joining Date first',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      const dates = await supplierListPage.columnValues('Joining Date');
      expect(dates).toEqual([...dates].sort().reverse());
    },
  );

  test(
    'Create Supplier opens the create form',
    { tag: ['@functional'] },
    async ({ page, supplierListPage }) => {
      await supplierListPage.createButton.click();

      await expect(page).toHaveURL(supplierUrls.create);
      await expect(page).toHaveTitle(supplierText.createTitle);
    },
  );

  test(
    'Row actions open in a new browser tab',
    { tag: ['@functional'] },
    async ({ supplierListPage }) => {
      const [row] = await supplierListPage.readRows();

      await expect(supplierListPage.viewLink(row.ID)).toHaveAttribute('target', '_blank');
      await expect(supplierListPage.updateLink(row.ID)).toHaveAttribute('target', '_blank');
    },
  );

  test(
    'View action opens the details of that supplier',
    { tag: ['@functional'] },
    async ({ supplierListPage, pagesOn }) => {
      const [row] = await supplierListPage.readRows();

      const tab = await supplierListPage.openInNewTab(supplierListPage.viewLink(row.ID));

      const details = pagesOn(tab).supplierViewPage;
      await expect(tab).toHaveURL(supplierUrls.view(row.ID));
      await expect(tab).toHaveTitle(row['English Name']);
      await expect(details.value(supplierDetailLabels.nameEn)).toHaveValue(row['English Name']);
      await expect(details.value(supplierDetailLabels.status)).toHaveValue(row.Status);
      await expect(details.value(supplierDetailLabels.phone)).toHaveValue(row.Phone);
      await expect(details.value(supplierDetailLabels.email)).toHaveValue(row.Email);
      await expect(details.value(supplierDetailLabels.createdAt)).toHaveValue(row['Joining Date']);
      await expect(details.value(supplierDetailLabels.supplierNameEn)).toHaveValue(
        row['Supplier Name En'],
      );
    },
  );

  test(
    'Update action opens the edit form of that supplier',
    { tag: ['@functional'] },
    async ({ supplierListPage, pagesOn }) => {
      const [row] = await supplierListPage.readRows();

      const tab = await supplierListPage.openInNewTab(supplierListPage.updateLink(row.ID));

      const form = pagesOn(tab).supplierFormPage;
      await expect(tab).toHaveURL(supplierUrls.update(row.ID));
      await expect(tab).toHaveTitle(`${supplierText.updateTitlePrefix}${row['English Name']}`);
      await expect(form.input('nameEn')).toHaveValue(row['English Name']);
      await expect(form.input('email')).toHaveValue(row.Email);
      await expect(form.selectedStatus()).toHaveText(shownOption(row.Status));
    },
  );

  test(
    'Details page links back to the list through the breadcrumb',
    { tag: ['@functional'] },
    async ({ supplierListPage, pagesOn }) => {
      const [row] = await supplierListPage.readRows();
      const tab = await supplierListPage.openInNewTab(supplierListPage.viewLink(row.ID));
      const { supplierViewPage: details, supplierListPage: listInTab } = pagesOn(tab);
      await expect(details.breadcrumbCurrent).toHaveText(row['English Name']);

      await details.breadcrumbList.click();

      await expect(tab).toHaveURL(supplierUrls.list);
      await expect(listInTab.row(row.ID)).toBeVisible();
    },
  );

  test(
    'Sidebar marks Supplier List as the current page',
    { tag: ['@ui'] },
    async ({ supplierListPage }) => {
      await expect(supplierListPage.sidebarLink).toHaveClass(/mm-active/);
    },
  );

  test(
    'Grid shows the same data after a page refresh',
    { tag: ['@functional'] },
    async ({ page, supplierListPage }) => {
      const before = await supplierListPage.readRows();
      const summaryBefore = await supplierListPage.summary.innerText();

      await page.reload();

      expect(await supplierListPage.readRows()).toEqual(before);
      await expect(supplierListPage.summary).toHaveText(summaryBefore);
    },
  );
});

test.describe('Supplier List - access', { tag: ['@regression', '@negative'] }, () => {
  // A fresh browser with no saved session.
  test.use({ signedInAs: 'none' });

  test('Signed-out visitor is sent to the login page', async ({
    page,
    supplierListPage,
    mazadLoginPage,
  }) => {
    await supplierListPage.goto();

    await expect(page).toHaveURL(backendUrls.login);
    await expect(mazadLoginPage.submitButton).toBeVisible();
  });
});
