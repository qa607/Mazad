import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  failedInvoiceData,
  failedInvoiceRecord as record,
  failedInvoiceText as text,
} from '@test-data/backend-failed-invoice.data';
import { unsupportedInvoices } from '@utils/test-files';
import { escapeRegExp } from '@utils/text';
import { uniqueDigits } from '@utils/unique';

// Failed Invoice list (Invoices → Failed Invoice), read-only, as Dev Root. It holds one invoice,
// the one uploaded by approved transaction T2, so filters are checked for finding that record and
// for finding nothing; they cannot prove that other records are excluded, and pagination is only
// checked for the single-record case. Nothing is uploaded, replaced or updated: the popup behind
// "Update Supplier Invoice" is opened and closed, files are only chosen, never submitted.
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

test.describe('Backend - Failed Invoice - list and data', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ failedInvoicePage }) => {
    await failedInvoicePage.goto();
  });

  test(
    'FI-LIST-01 Page shows the heading, breadcrumb, sidebar link, filters and the seven columns',
    { tag: ['@smoke', '@functional'] },
    async ({ page, failedInvoicePage }) => {
      await expect(page).toHaveTitle(text.pageTitle);
      await expect(failedInvoicePage.pageHeading).toHaveText(text.pageTitle);
      await expect(failedInvoicePage.breadcrumbCurrent).toHaveText(text.pageTitle);
      await expect(failedInvoicePage.sidebarLink).toBeVisible();
      await expect(failedInvoicePage.vinInput).toBeEditable();
      await expect(failedInvoicePage.itemTitleInput).toBeEditable();
      await expect(failedInvoicePage.supplierValue).toBeVisible();
      await expect(failedInvoicePage.customerValue).toBeVisible();
      await expect(failedInvoicePage.searchButton).toBeEnabled();
      await expect(failedInvoicePage.resetButton).toBeVisible();
      await expect(failedInvoicePage.columnHeaders).toHaveText([...text.columnHeaders]);
    },
  );

  test(
    'FI-LIST-02 The T2 invoice row shows the right vehicle, customer, supplier and actions',
    { tag: ['@smoke', '@functional'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.gotoByVin(record.vin);

      const rows = await failedInvoicePage.readRows();
      expect(rows, 'one row for this VIN').toHaveLength(1);
      const [row] = rows;
      expect(row.ID).toBe(record.itemId);
      expect(row.Type).toBe(record.type);
      expect(row.Customer).toBe(record.customer);
      expect(row['Vin Number']).toBe(record.vin);
      expect(row['Item Title']).toBe(record.title);
      expect(row['Supplier Name']).toBe(record.supplier);
      expect(await failedInvoicePage.rowActionNames(failedInvoicePage.row(record.itemId))).toEqual([
        ...record.actions,
      ]);
    },
  );

  test(
    'FI-LIST-03 The grid summary matches the rows, with no more than one page of them',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      const { from, to, total } = await failedInvoicePage.summaryCounts();

      expect(total).toBeGreaterThan(0);
      await expect(failedInvoicePage.summary).toHaveText(
        new RegExp(`^Showing 1-${to} of ${total} items?[.]$`),
      );
      expect(to).toBe(Math.min(total, failedInvoiceData.pageSize));
      expect(from).toBe(1);
      await expect(failedInvoicePage.rows).toHaveCount(to);
      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
    },
  );

  test(
    'FI-LIST-04 An unknown VIN shows "No results found." and no rows',
    { tag: ['@functional', '@negative'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.searchByVin(failedInvoiceData.unknownVin);

      await expect(failedInvoicePage.emptyMessage).toHaveText(text.noResults);
      await expect(failedInvoicePage.rows).toHaveCount(0);
      await expect(failedInvoicePage.summary).toHaveCount(0);
    },
  );

  test(
    'FI-LIST-05 The record is the same after a refresh and after leaving the page and coming back',
    { tag: ['@functional'] },
    async ({ page, failedInvoicePage, failedPage }) => {
      await failedInvoicePage.gotoByVin(record.vin);
      const before = await failedInvoicePage.readRows();

      await page.reload();
      expect(await failedInvoicePage.readRows(), 'after a refresh').toEqual(before);

      await failedPage.goto();
      await page.goBack();
      expect(await failedInvoicePage.readRows(), 'after leaving and coming back').toEqual(before);
    },
  );
});

test.describe('Backend - Failed Invoice - filters', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ failedInvoicePage }) => {
    await failedInvoicePage.goto();
  });

  test(
    'FI-FLT-01 VIN, full: finds the invoice',
    { tag: ['@functional'] },
    async ({ page, failedInvoicePage }) => {
      await failedInvoicePage.searchByVin(record.vin);

      await expect(page).toHaveURL(/FailedInvoiceSearch%5Bvin_number%5D=/);
      await expect(failedInvoicePage.vinInput).toHaveValue(record.vin);
      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
      await expect(failedInvoicePage.rows.filter({ hasNotText: record.vin })).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-02 VIN, partial: finds every invoice whose VIN contains it',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      const part = record.vin.slice(0, failedInvoiceData.partialVinLength);

      await failedInvoicePage.searchByVin(part);

      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
      await expect(failedInvoicePage.rows.filter({ hasNotText: part })).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-03 VIN, no match: shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.searchByVin(failedInvoiceData.unknownVin);

      await expect(failedInvoicePage.emptyMessage).toHaveText(text.noResults);
    },
  );

  test(
    'FI-FLT-04 Item Title, as the grid shows it (vehicle name and year): finds the invoice',
    { tag: ['@functional', '@known-bug'] },
    async ({ failedInvoicePage }) => {
      // Known defect candidate DC-07 (found 2026-11-11): the Item Title filter matches the vehicle
      // name ("MG 5") and the year ("2020") separately, but returns nothing for the title exactly as
      // the grid shows it ("MG 5 2020"). Remove test.fail() once the displayed title can be searched.
      test.fail(
        true,
        'Known defect candidate DC-07: the Item Title filter finds nothing for the displayed title.',
      );

      await failedInvoicePage.searchByTitle(record.title);

      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
    },
  );

  test(
    'FI-FLT-04b Item Title, vehicle name without the year: finds the invoice',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.searchByTitle(record.titleWithoutYear);

      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
      await expect(
        failedInvoicePage.rows.filter({ hasNotText: record.titleWithoutYear }),
      ).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-05 Item Title, partial: finds every invoice whose title contains it',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.searchByTitle(failedInvoiceData.partialTitle);

      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
      await expect(
        failedInvoicePage.rows.filter({ hasNotText: failedInvoiceData.partialTitle }),
      ).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-06 Item Title, no match: shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.searchByTitle(failedInvoiceData.unknownTitle);

      await expect(failedInvoicePage.emptyMessage).toHaveText(text.noResults);
    },
  );

  test(
    'FI-FLT-07 Supplier: the dropdown offers the supplier that has an invoice, and filtering finds it',
    { tag: ['@functional'] },
    async ({ page, failedInvoicePage }) => {
      await failedInvoicePage.filterBySupplier(
        new RegExp(`^\\s*${escapeRegExp(record.supplier)} - Supplier\\s*$`),
      );

      await expect(page).toHaveURL(/FailedInvoiceSearch%5Bsupplier_id%5D=\d+/);
      await expect(failedInvoicePage.supplierValue).toContainText(record.supplier);
      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
      await expect(failedInvoicePage.rows.filter({ hasNotText: record.supplier })).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-08 Customer: searching by part of a name offers the bidder',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      expect(await failedInvoicePage.customerSuggestions(record.customerSearch)).toContain(
        record.customer,
      );
    },
  );

  test(
    'FI-FLT-08b Customer: picking the bidder and searching finds the invoice',
    { tag: ['@functional'] },
    async ({ page, failedInvoicePage }) => {
      await failedInvoicePage.filterByCustomer(record.customerSearch, record.customer);

      await expect(page).toHaveURL(/FailedInvoiceSearch%5Bhighest_bidder_id%5D=\d+/);
      await expect(failedInvoicePage.customerValue).toContainText(record.customer);
      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
      await expect(failedInvoicePage.rows.filter({ hasNotText: record.customer })).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-09 Customer: a text that matches no customer shows a no-results message',
    { tag: ['@functional', '@negative'] },
    async ({ failedInvoicePage }) => {
      expect(
        await failedInvoicePage.customerNoResultsMessage(failedInvoiceData.unknownCustomerSearch),
      ).toMatch(/no results|not found/i);
    },
  );

  test(
    'FI-FLT-10 Combined: VIN, title, supplier and customer together find the invoice',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.vinInput.fill(record.vin);
      await failedInvoicePage.itemTitleInput.fill(record.titleWithoutYear);
      await failedInvoicePage.chooseSupplier(
        new RegExp(`^\\s*${escapeRegExp(record.supplier)} - Supplier\\s*$`),
      );
      await failedInvoicePage.chooseCustomer(record.customerSearch, record.customer);
      await failedInvoicePage.search();

      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
    },
  );

  test(
    'FI-FLT-11 Combined: a title that does not belong to the VIN finds nothing',
    { tag: ['@functional', '@negative'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.vinInput.fill(record.vin);
      await failedInvoicePage.itemTitleInput.fill(failedInvoiceData.unknownTitle);
      await failedInvoicePage.search();

      await expect(failedInvoicePage.emptyMessage).toHaveText(text.noResults);
      await expect(failedInvoicePage.rows).toHaveCount(0);
    },
  );

  test(
    'FI-FLT-12 Clearing one filter and searching again brings the invoice back',
    { tag: ['@functional'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.searchByVin(failedInvoiceData.unknownVin);
      await expect(failedInvoicePage.rows).toHaveCount(0);

      await failedInvoicePage.searchByVin('');

      await expect(failedInvoicePage.row(record.itemId)).toHaveCount(1);
    },
  );

  test(
    'FI-FLT-13 Reset clears every filter and shows the full list again',
    { tag: ['@functional'] },
    async ({ page, failedInvoicePage }) => {
      const total = await failedInvoicePage.totalCount();
      await failedInvoicePage.vinInput.fill(failedInvoiceData.unknownVin);
      await failedInvoicePage.itemTitleInput.fill(failedInvoiceData.unknownTitle);
      await failedInvoicePage.chooseCustomer(record.customerSearch, record.customer);
      await failedInvoicePage.search();
      await expect(failedInvoicePage.emptyMessage).toBeVisible();

      await failedInvoicePage.reset();

      await expect(page).toHaveURL(/\/backend\/invoice\/failed-invoice\/index$/);
      await expect(failedInvoicePage.vinInput).toHaveValue('');
      await expect(failedInvoicePage.itemTitleInput).toHaveValue('');
      await expect(failedInvoicePage.customerValue).not.toContainText(record.customer);
      expect(await failedInvoicePage.totalCount()).toBe(total);
    },
  );
});

test.describe(
  'Backend - Failed Invoice - pagination (single record)',
  { tag: ['@regression'] },
  () => {
    test(
      'FI-PAG-01 With one page of records there is no pager, and page and page-size parameters keep the page working',
      { tag: ['@functional'] },
      async ({ failedInvoicePage }) => {
        await failedInvoicePage.goto();
        const total = await failedInvoicePage.totalCount();
        test.skip(
          total > failedInvoiceData.pageSize,
          'More than one page of records: this check is for a single page.',
        );
        await expect(failedInvoicePage.pagination).toHaveCount(0);

        for (const query of ['page=1', 'page=2', 'per-page=1', 'per-page=100']) {
          await failedInvoicePage.gotoWithQuery(query);
          const ids = await failedInvoicePage.rowIds();
          expect(new Set(ids).size, `${query}: no repeated rows`).toBe(ids.length);
          expect(ids.length, `${query}: no more rows than records`).toBeLessThanOrEqual(total);
        }
      },
    );
  },
);

test.describe(
  'Backend - Failed Invoice - row actions (nothing is submitted)',
  { tag: ['@regression'] },
  () => {
    test.beforeEach(async ({ failedInvoicePage }) => {
      await failedInvoicePage.gotoByVin(record.vin);
    });

    test(
      'FI-ACT-01 View Invoice opens the invoice file in a new tab',
      { tag: ['@smoke', '@functional'] },
      async ({ page, failedInvoicePage }) => {
        const row = failedInvoicePage.row(record.itemId);
        await expect(failedInvoicePage.viewInvoiceLink(row)).toHaveAttribute('target', '_blank');

        const tab = await failedInvoicePage.openViewInvoice(row);

        // The address is private (signed), so only the file type is checked, never the address.
        expect(new URL(tab.url()).pathname.endsWith('.pdf'), 'the new tab shows a PDF file').toBe(
          true,
        );
        expect(page.url().includes('failed-invoice'), 'the list stays open').toBe(true);
        await tab.close();
      },
    );

    test(
      'FI-ACT-02 The View Invoice address is served by the Backend and redirects to a PDF',
      { tag: ['@functional'] },
      async ({ page, failedInvoicePage }) => {
        const href = await failedInvoicePage.invoiceFileHref(failedInvoicePage.row(record.itemId));

        const response = await page.request.get(href, { maxRedirects: 0 });

        expect(response.status(), 'redirect to the stored file').toBe(302);
        const location = response.headers().location ?? '';
        expect(new URL(location).pathname.endsWith('.pdf'), 'redirect target is a PDF').toBe(true);
      },
    );

    test(
      'FI-ACT-03 Update Supplier Invoice opens the "Upload Invoice" popup for this invoice',
      { tag: ['@smoke', '@functional'] },
      async ({ failedInvoicePage }) => {
        await failedInvoicePage.openUpdateSupplierInvoice(failedInvoicePage.row(record.itemId));
        const dialog = failedInvoicePage.uploadInvoiceDialog;

        await expect(dialog.title).toHaveText(text.updateDialogTitle);
        await expect(dialog.fileInput).toBeAttached();
        await expect(dialog.submitButton).toBeVisible();
        await expect(dialog.closeButton.first()).toBeVisible();
        await expect(dialog.form).toContainText(text.extensionError);
        await dialog.close();
      },
    );

    test(
      'FI-ACT-04 Submitting with no file is refused, and nothing is uploaded',
      { tag: ['@functional', '@negative'] },
      async ({ failedInvoicePage }) => {
        await failedInvoicePage.openUpdateSupplierInvoice(failedInvoicePage.row(record.itemId));
        const dialog = failedInvoicePage.uploadInvoiceDialog;
        const uploads = dialog.countSubmissions();

        await dialog.submit();

        await expect(dialog.fieldError).toHaveText(text.fileRequired);
        await expect(dialog.dialog).toBeVisible();
        expect(uploads(), 'no upload was sent').toBe(0);
        await dialog.close();
      },
    );

    for (const { name, file } of unsupportedInvoices(uniqueDigits(6))) {
      test(
        `FI-ACT-05 Choosing ${name} shows the extension message`,
        { tag: ['@functional', '@negative'] },
        async ({ failedInvoicePage }) => {
          await failedInvoicePage.openUpdateSupplierInvoice(failedInvoicePage.row(record.itemId));
          const dialog = failedInvoicePage.uploadInvoiceDialog;
          const uploads = dialog.countSubmissions();

          await dialog.chooseFile(file);

          await expect(dialog.extensionError).toBeVisible();
          await expect(dialog.extensionError).toHaveText(text.extensionError);
          expect(uploads(), 'choosing a file sends nothing').toBe(0);
          await dialog.close();
        },
      );
    }

    test(
      'FI-ACT-06 Closing the popup leaves the record unchanged',
      { tag: ['@functional'] },
      async ({ page, failedInvoicePage }) => {
        const before = await failedInvoicePage.readRows();
        await failedInvoicePage.openUpdateSupplierInvoice(failedInvoicePage.row(record.itemId));
        const uploads = failedInvoicePage.uploadInvoiceDialog.countSubmissions();
        await failedInvoicePage.uploadInvoiceDialog.chooseFile(
          unsupportedInvoices('close')[0].file,
        );

        await failedInvoicePage.uploadInvoiceDialog.close();

        await expect(failedInvoicePage.uploadInvoiceDialog.dialog).toBeHidden();
        expect(uploads(), 'nothing was sent').toBe(0);
        await page.reload();
        expect(await failedInvoicePage.readRows(), 'the row is unchanged after a refresh').toEqual(
          before,
        );
      },
    );
  },
);
