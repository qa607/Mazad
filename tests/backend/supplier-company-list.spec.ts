import { devRootSession, expect, test } from '@fixtures/test.fixture';
import type { CompanyRow } from '@pages/backend/suppliers/supplier-company-list.page';
import {
  companyColumns,
  companyFilterLabels,
  companyRowActions,
  defaultPageSize,
  isTestCompany,
  readPageSize,
  supplierCompanyText as text,
  supplierCompanyUrls,
  unknownCompanyId,
} from '@test-data/supplier-company.data';

/**
 * Mazad Backend > Users > Suppliers > Companies: page, grid, paging and View pages. Read-only.
 * Expected results come from the live list, and QA-AUTO test companies are left out of
 * comparisons because supplier-company-crud.spec.ts adds and deletes them in parallel.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const realRows = (rows: CompanyRow[]) => rows.filter((row) => !isTestCompany(row));

test.describe('Supplier Company - page and grid', { tag: ['@regression'] }, () => {
  test(
    'Companies in the sidebar opens the list',
    { tag: ['@smoke', '@functional'] },
    async ({ page, supplierListPage, supplierCompanyListPage: list }) => {
      // On the Supplier List page the Users > Suppliers menu is already open.
      await supplierListPage.goto();
      await list.openFromSidebarLink();

      await expect(page).toHaveURL(supplierCompanyUrls.list);
      await expect(page).toHaveTitle(text.listTitle);
      await expect(list.pageHeading).toHaveText(text.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(text.listTitle);
    },
  );

  test(
    'Shows the filters, buttons and grid columns',
    { tag: ['@smoke', '@ui'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();

      await expect(list.filterLabels).toHaveText([...companyFilterLabels]);
      await expect(list.selectedSupplier()).toHaveText(text.supplierPlaceholder);
      for (const control of [
        list.createButton,
        list.searchButton,
        list.resetButton,
        list.exportColumnsToggle,
        list.exportMenuToggle,
      ]) {
        await expect(control).toBeVisible();
      }
      expect(await list.headerTexts()).toEqual([...companyColumns, 'Actions']);
      // No column can be sorted.
      await expect(list.sortLinks).toHaveCount(0);
    },
  );

  test(
    'Lists companies newest first, numbered, 20 to a page, with unique IDs',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const all = realRows(await list.readAllRows());
      const ids = all.map((row) => Number(row.id));
      expect(new Set(ids).size, 'unique IDs').toBe(ids.length);

      await list.goto();
      const firstPage = await list.readRows();
      expect(firstPage).toHaveLength(Math.min(defaultPageSize, all.length));
      expect(firstPage.map((row) => row.number)).toEqual(firstPage.map((_, i) => String(i + 1)));
      const firstPageIds = firstPage.map((row) => Number(row.id));
      expect(firstPageIds, 'newest (highest ID) first').toEqual(
        [...firstPageIds].sort((a, b) => b - a),
      );
      const realFirstPage = realRows(firstPage).map((row) => Number(row.id));
      expect(realFirstPage).toEqual(ids.slice(0, realFirstPage.length));

      const summary = await list.summaryCounts();
      expect(summary.from).toBe(1);
      expect(summary.to).toBe(firstPage.length);
      // The CRUD spec may have one QA-AUTO company in the list at this moment.
      expect(summary.total - all.length).toBeGreaterThanOrEqual(0);
      expect(summary.total - all.length).toBeLessThanOrEqual(1);
    },
  );

  test(
    'Every row has non-empty names and View, Update and Delete actions',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      const rows = realRows(await list.readRows());
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        expect(row.supplier, `supplier of ${row.id}`).not.toBe('');
        expect(row.name, `Arabic name of ${row.id}`).not.toBe('');
        expect(row.nameEn, `English name of ${row.id}`).not.toBe('');
        expect(await list.rowActions(row.id), `actions of ${row.id}`).toEqual([
          ...companyRowActions,
        ]);
      }
    },
  );

  test(
    'Small pages sorted by ID page forward and back',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const query = { sort: 'id', 'per-page': String(readPageSize) };
      await list.open({}, { ...query, page: '2' });

      expect(await list.summaryCounts()).toMatchObject({
        from: readPageSize + 1,
        to: 2 * readPageSize,
      });
      await expect(list.activePage).toHaveText('2');
      const pageTwo = await list.rowIds();
      expect(pageTwo.map(Number)).toEqual(pageTwo.map(Number).sort((a, b) => a - b));
      expect((await list.readRows()).map((row) => row.number)).toEqual(
        pageTwo.map((_, i) => String(readPageSize + i + 1)),
      );

      await list.goToNextPage();
      await expect(list.activePage).toHaveText('3');
      expect(Number((await list.rowIds())[0])).toBeGreaterThan(Number(pageTwo.at(-1)));

      await list.goToPreviousPage();
      await list.goToPreviousPage();
      await expect(list.activePage).toHaveText('1');
      expect(Number((await list.rowIds()).at(-1))).toBeLessThan(Number(pageTwo[0]));
    },
  );

  test(
    'Page numbers that are not numbers open the first page',
    { tag: ['@negative'] },
    async ({ supplierCompanyListPage: list }) => {
      for (const pageNumber of ['-1', 'abc']) {
        expect(await list.open({}, { page: pageNumber }), `page=${pageNumber}`).toBe(200);
        await expect(list.activePage).toHaveText('1');
        await expect(list.rows).toHaveCount(defaultPageSize);
      }
    },
  );

  test(
    'Next opens page 2 with the rest of the companies',
    {
      tag: ['@functional', '@known-bug'],
      annotation: {
        type: 'issue',
        description:
          'Found 2026-11-10 on staging: page 2 of the default list (also ?sort=id&page=1, ' +
          '?per-page=10&page=4, ?page=99, ?per-page=50) answers 502 Bad Gateway. Ticket to be added.',
      },
    },
    async ({ supplierCompanyListPage: list }) => {
      test.fail();
      await list.goto();
      const total = await list.totalCount();
      test.skip(total <= defaultPageSize, 'The list fits on one page.');

      expect(await list.goToNextPageStatus()).toBe(200);
      expect(await list.summaryCounts()).toEqual({
        from: defaultPageSize + 1,
        to: Math.min(total, 2 * defaultPageSize),
        total,
      });
    },
  );

  test(
    'View page of every company opens',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      for (const row of realRows(await list.readAllRows())) {
        expect(await list.companyPageStatus('view', row.id), `view of ${row.id}`).toBe(200);
      }
    },
  );

  test(
    'View and Update of an unknown company answer 404',
    { tag: ['@negative'] },
    async ({ supplierCompanyListPage: list }) => {
      await list.goto();
      expect(await list.companyPageStatus('view', unknownCompanyId)).toBe(404);
      expect(await list.companyPageStatus('update', unknownCompanyId)).toBe(404);
    },
  );

  test(
    'View opens in a new tab with the same names and supplier as the grid',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list, pagesOn }) => {
      await list.goto();
      const [row] = realRows(await list.readRows());
      const tab = await list.openInNewTab(list.actionLink(row.id, 'view'));
      const { supplierCompanyFormPage: form } = pagesOn(tab);

      await expect(tab).toHaveURL(new RegExp(`/company/company/view\\?id=${row.id}$`));
      const values = await form.viewTexts();
      expect(values.slice(0, 3)).toEqual([row.name, row.nameEn, row.supplier]);
      await expect(form.pageHeading).toHaveText(row.nameEn);
      await expect(form.viewUpdateButton).toBeVisible();
      await expect(form.viewDeleteButton).toBeVisible();
    },
  );

  test(
    'List page runs without script errors',
    { tag: ['@functional'] },
    async ({ supplierCompanyListPage: list }) => {
      const scriptErrors = list.trackScriptErrors();
      await list.goto();
      await list.rows.first().waitFor();
      expect(scriptErrors()).toEqual([]);
    },
  );

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 375, height: 812 },
  ]) {
    test(
      `Fits a ${viewport.width}px wide window without horizontal scrolling`,
      { tag: ['@ui'] },
      async ({ page, supplierCompanyListPage: list }) => {
        await page.setViewportSize(viewport);
        await list.goto();
        const widths = await list.pageWidths();
        expect(widths.content).toBeLessThanOrEqual(widths.window + 1);
      },
    );
  }
});
