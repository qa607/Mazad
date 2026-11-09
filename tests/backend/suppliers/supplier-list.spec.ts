import { expect, test } from '@fixtures/supplier.fixture';
import { shownOption } from '@utils/widgets';
import { envConfig } from '@config/env.config';
import { MazadLoginPage } from '@pages/backend/mazad-login.page';
import { SupplierFormPage } from '@pages/backend/supplier-form.page';
import { SupplierListPage } from '@pages/backend/supplier-list.page';
import { SupplierViewPage } from '@pages/backend/supplier-view.page';
import { backendUrls } from '@test-data/backend-login.data';
import {
  pageSize,
  statusOptions,
  supplierColumns,
  supplierText,
  supplierUrls,
  yesNoOptions,
} from '@test-data/supplier.data';

// Signed in as Dev Root: no trace or video (they would capture the account header).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Supplier List - page and grid', () => {
  test.beforeEach(async ({ page, supplierListPage }) => {
    await supplierListPage.goto();
    await expect(page).toHaveURL(supplierUrls.list);
  });

  test('Page shows the title, breadcrumb, filters and Create button', async ({
    page,
    supplierListPage,
  }) => {
    await expect(page).toHaveTitle(supplierText.listTitle);
    await expect(supplierListPage.pageHeading).toContainText(supplierText.listTitle);
    await expect(page.locator('.breadcrumb')).toContainText(supplierText.listTitle);
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
  });

  test('Filters start empty with their default options', async ({ supplierListPage }) => {
    await expect(supplierListPage.phoneFilter).toBeEmpty();
    await expect(supplierListPage.nameEnFilter).toBeEmpty();
    await expect(supplierListPage.supplierNameEnFilter).toBeEmpty();
    await expect(supplierListPage.emailFilter).toBeEmpty();
    await expect(supplierListPage.selectedFilterOption(supplierListPage.statusFilter)).toHaveText(
      shownOption('Choose Status'),
    );
    await expect(
      supplierListPage.selectedFilterOption(supplierListPage.commissionFilter),
    ).toHaveText(shownOption('All'));
    await expect(
      supplierListPage.selectedFilterOption(supplierListPage.requestMojazFilter),
    ).toHaveText(shownOption('All'));
  });

  test('Grid shows all columns in order', async ({ supplierListPage }) => {
    expect(await supplierListPage.columnHeaders()).toEqual([...supplierColumns]);
  });

  test('Summary matches the rows shown and the first page holds 20 rows', async ({
    supplierListPage,
  }) => {
    const { from, to, total } = await supplierListPage.summaryCounts();
    expect(from).toBe(1);
    expect(to).toBe(Math.min(pageSize, total));
    await expect(supplierListPage.rows).toHaveCount(to);
  });

  test('Row numbers run from 1 and every row has a numeric, unique ID', async ({
    supplierListPage,
  }) => {
    const numbers = await supplierListPage.columnValues('#');
    const ids = await supplierListPage.columnValues('ID');

    expect(numbers).toEqual(numbers.map((_, index) => String(index + 1)));
    for (const id of ids) expect(id).toMatch(/^\d+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('Every row shows well-formed values', async ({ supplierListPage }) => {
    const rows = await supplierListPage.readRows();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const where = `supplier ${row.ID}`;
      expect(statusOptions, where).toContain(row.Status);
      expect(yesNoOptions, where).toContain(row['Request Mojaz']);
      // Buyer Commission is "No" or an amount.
      expect(row['Buyer Commission'], where).toMatch(/^(No|[\d,]+(\.\d+)?)$/);
      expect(row['Vehicles Count'], where).toMatch(/^\d+$/);
      expect(row.Phone, where).toMatch(/^0\d{9}$/);
      expect(row['Joining Date'], where).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(row['English Name'], where).not.toBe('');
      // Email may hold several addresses separated by commas; a supplier without one shows "(not set)".
      if (row.Email && row.Email !== '(not set)') {
        for (const email of row.Email.split(',')) {
          expect(email.trim(), where).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        }
      }
    }
  });

  test('Every row has View and Update actions for its own supplier', async ({
    supplierListPage,
  }) => {
    for (const id of await supplierListPage.columnValues('ID')) {
      await expect(supplierListPage.viewLink(id)).toBeVisible();
      await expect(supplierListPage.updateLink(id)).toBeVisible();
    }
  });

  test('Default order is newest Joining Date first', async ({ supplierListPage }) => {
    const dates = await supplierListPage.columnValues('Joining Date');
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('Create Supplier opens the create form', async ({ page, supplierListPage }) => {
    await supplierListPage.createButton.click();

    await expect(page).toHaveURL(supplierUrls.create);
    await expect(page).toHaveTitle(supplierText.createTitle);
  });

  test('Row actions open in a new browser tab', async ({ supplierListPage }) => {
    const [row] = await supplierListPage.readRows();

    await expect(supplierListPage.viewLink(row.ID)).toHaveAttribute('target', '_blank');
    await expect(supplierListPage.updateLink(row.ID)).toHaveAttribute('target', '_blank');
  });

  test('View action opens the details of that supplier', async ({ supplierListPage }) => {
    const [row] = await supplierListPage.readRows();

    const tab = await supplierListPage.openInNewTab(supplierListPage.viewLink(row.ID));

    const details = new SupplierViewPage(tab);
    await expect(tab).toHaveURL(supplierUrls.view(row.ID));
    await expect(tab).toHaveTitle(row['English Name']);
    await expect(details.value('English Name')).toHaveValue(row['English Name']);
    await expect(details.value('Status')).toHaveValue(row.Status);
    await expect(details.value('Phone')).toHaveValue(row.Phone);
    await expect(details.value('Email')).toHaveValue(row.Email);
    await expect(details.value('Created At')).toHaveValue(row['Joining Date']);
    await expect(details.value('Supplier Name En')).toHaveValue(row['Supplier Name En']);
  });

  test('Update action opens the edit form of that supplier', async ({ supplierListPage }) => {
    const [row] = await supplierListPage.readRows();

    const tab = await supplierListPage.openInNewTab(supplierListPage.updateLink(row.ID));

    const form = new SupplierFormPage(tab);
    await expect(tab).toHaveURL(supplierUrls.update(row.ID));
    await expect(tab).toHaveTitle(`${supplierText.updateTitlePrefix}${row['English Name']}`);
    await expect(form.input('nameEn')).toHaveValue(row['English Name']);
    await expect(form.input('email')).toHaveValue(row.Email);
    await expect(form.selectedStatus()).toHaveText(shownOption(row.Status));
  });

  test('Details page links back to the list through the breadcrumb', async ({
    supplierListPage,
  }) => {
    const [row] = await supplierListPage.readRows();
    const tab = await supplierListPage.openInNewTab(supplierListPage.viewLink(row.ID));
    const details = new SupplierViewPage(tab);
    await expect(details.breadcrumbCurrent).toHaveText(row['English Name']);

    await details.breadcrumbList.click();

    await expect(tab).toHaveURL(supplierUrls.list);
    await expect(new SupplierListPage(tab).rowById(row.ID)).toBeVisible();
  });

  test('Sidebar marks Supplier List as the current page', async ({ page }) => {
    await expect(page.locator('.app-sidebar a[href="/backend/users/supplier/index"]')).toHaveClass(
      /mm-active/,
    );
  });

  test('Grid shows the same data after a page refresh', async ({ page, supplierListPage }) => {
    const before = await supplierListPage.readRows();
    const summaryBefore = await supplierListPage.summary.innerText();

    await page.reload();

    expect(await supplierListPage.readRows()).toEqual(before);
    await expect(supplierListPage.summary).toHaveText(summaryBefore);
  });
});

test.describe('Supplier List - access', () => {
  test('Signed-out visitor is sent to the login page', async ({ browser }) => {
    // A fresh context with no saved session.
    const context = await browser.newContext({
      baseURL: envConfig.baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto('/backend/users/supplier/index');

    await expect(page).toHaveURL(backendUrls.login);
    await expect(new MazadLoginPage(page).submitButton).toBeVisible();
    await context.close();
  });
});
