import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { failedInvoiceText, failedText, failedUrls } from '@test-data/backend-failed.data';
import {
  destructiveSkipReason,
  failedPool,
  probeSkipReason,
} from '@test-data/backend-failed-pool.data';
import { emptyInvoice, sizedInvoice, unsupportedInvoices, validInvoice } from '@utils/test-files';
import { uniqueDigits } from '@utils/unique';

// Upload Invoice from the Failed list, and the Failed Invoice list it feeds. The first group is
// read-only: the popup is opened and files are only chosen, never submitted. The second group
// really uploads to QA-AUTO pool vehicles, only after explicit approval.
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

test.describe('Backend - Failed Invoice list (read-only)', { tag: ['@regression'] }, () => {
  test(
    'FL-INV-00 Failed Invoice list shows its heading, filters and columns',
    { tag: ['@smoke', '@functional'] },
    async ({ page, failedInvoicePage }) => {
      await failedInvoicePage.goto();

      await expect(page).toHaveTitle(failedInvoiceText.pageTitle);
      await expect(failedInvoicePage.pageHeading).toHaveText(failedInvoiceText.pageTitle);
      await expect(failedInvoicePage.sidebarLink).toBeVisible();
      await expect(failedInvoicePage.vinInput).toBeEditable();
      await expect(failedInvoicePage.itemTitleInput).toBeEditable();
      await expect(failedInvoicePage.columnHeaders).toHaveText([
        ...failedInvoiceText.columnHeaders,
      ]);
    },
  );

  test(
    'FL-INV-00b An unknown VIN shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ failedInvoicePage }) => {
      await failedInvoicePage.goto();

      await failedInvoicePage.searchByVin('ZZZZZZZZZZ0000000');

      await expect(failedInvoicePage.emptyMessage).toHaveText(failedInvoiceText.noResults);
    },
  );
});

test.describe(
  'Backend - Failed List - Upload Invoice (read-only)',
  { tag: ['@regression'] },
  () => {
    test.beforeEach(async ({ page, failedPage }) => {
      await failedPage.goto();
      await expect(page).toHaveURL(failedUrls.list);
    });

    test(
      'FL-INV-01 The popup shows the help text, the file picker, Submit and Close; Close keeps the vehicle',
      { tag: ['@functional'] },
      async ({ page, failedPage }) => {
        const itemId = await failedPage.rowId(failedPage.rows.first());
        await failedPage.openUploadInvoice(failedPage.row(itemId));
        const dialog = failedPage.uploadInvoiceDialog;
        const submissions = dialog.countSubmissions();

        await expect(dialog.title).toHaveText(failedText.uploadInvoiceTitle);
        await expect(dialog.fileInput).toBeAttached();
        await expect(dialog.form).toContainText(failedText.invoiceExtensionError);
        await expect(dialog.submitButton).toBeVisible();
        await expect(dialog.closeButton.first()).toBeVisible();

        await dialog.close();

        await expect(dialog.dialog).toBeHidden();
        expect(submissions()).toBe(0);
        await page.reload();
        await expect(failedPage.row(itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-INV-02 Submitting without a file is refused, and nothing is sent',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage }) => {
        await failedPage.openUploadInvoice(failedPage.rows.first());
        const dialog = failedPage.uploadInvoiceDialog;
        const submissions = dialog.countSubmissions();

        await dialog.submit();

        await expect(dialog.fieldError).toHaveText(failedText.invoiceRequired);
        await expect(dialog.dialog).toBeVisible();
        expect(submissions()).toBe(0);
        await dialog.close();
      },
    );

    for (const { name, file } of unsupportedInvoices(uniqueDigits(6))) {
      test(
        `FL-INV-03 Choosing ${name} shows the extension message`,
        { tag: ['@functional', '@negative'] },
        async ({ failedPage }) => {
          await failedPage.openUploadInvoice(failedPage.rows.first());
          const dialog = failedPage.uploadInvoiceDialog;

          await dialog.chooseFile(file);

          await expect(dialog.extensionError).toBeVisible();
          await expect(dialog.extensionError).toHaveText(failedText.invoiceExtensionError);
          await dialog.close();
        },
      );
    }

    for (const kind of ['png', 'jpg', 'jpeg', 'pdf'] as const) {
      test(
        `FL-INV-04 Choosing a .${kind} file shows no extension message`,
        { tag: ['@functional'] },
        async ({ failedPage }) => {
          await failedPage.openUploadInvoice(failedPage.rows.first());
          const dialog = failedPage.uploadInvoiceDialog;
          const submissions = dialog.countSubmissions();

          await dialog.chooseFile(validInvoice(kind, uniqueDigits(6)));

          await expect(dialog.extensionError).toBeHidden();
          expect(submissions(), 'choosing a file sends nothing').toBe(0);
          await dialog.close();
        },
      );
    }
  },
);

test.describe(
  'Backend - Failed List - Upload Invoice (real upload, QA-AUTO pool only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    // An upload cannot be undone and a retry could upload twice: never retried, one at a time.
    test.describe.configure({ mode: 'default', retries: 0 });

    test.beforeEach(() => {
      test.skip(
        process.env.FAILED_DESTRUCTIVE_APPROVED !== 'true',
        'Needs FAILED_DESTRUCTIVE_APPROVED=true for this run.',
      );
    });

    test(
      'FL-INV-05 An empty PDF is refused and the vehicle stays in Failed',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage, failedInvoicePage }) => {
        const skip = probeSkipReason('general');
        test.skip(!!skip, skip ?? '');
        const vin = failedPool.probes.general;
        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        const itemId = await failedPage.rowId(row);

        await failedPage.openUploadInvoice(row);
        await failedPage.uploadInvoiceDialog.chooseFile(emptyInvoice(uniqueDigits(6)));
        await failedPage.uploadInvoiceDialog.submit();

        await expect(failedPage.uploadInvoiceDialog.dialog).toBeVisible();
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(itemId)).toHaveCount(1);
        await failedInvoicePage.gotoByVin(vin);
        await expect(failedInvoicePage.rows).toHaveCount(0);
      },
    );

    test(
      'FL-INV-06 A file far over any reasonable limit is refused and the vehicle stays in Failed',
      { tag: ['@functional', '@negative'] },
      async ({ failedPage, failedInvoicePage }) => {
        const skip = probeSkipReason('general');
        test.skip(!!skip, skip ?? '');
        const vin = failedPool.probes.general;
        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        const itemId = await failedPage.rowId(row);

        await failedPage.openUploadInvoice(row);
        await failedPage.uploadInvoiceDialog.chooseFile(
          sizedInvoice(uniqueDigits(6), 60 * 1024 * 1024),
        );
        await failedPage.uploadInvoiceDialog.submit();

        await expect(failedPage.uploadInvoiceDialog.dialog).toBeVisible();
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(itemId)).toHaveCount(1);
        await failedInvoicePage.gotoByVin(vin);
        await expect(failedInvoicePage.rows).toHaveCount(0);
      },
    );

    test(
      'FL-INV-07 An upload failure keeps the vehicle in Failed',
      { tag: ['@functional', '@negative'] },
      async ({ page, failedPage }) => {
        const skip = probeSkipReason('general');
        test.skip(!!skip, skip ?? '');
        const vin = failedPool.probes.general;
        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        const itemId = await failedPage.rowId(row);
        // The request is stopped in the browser, so the server never receives it.
        await page.route('**/ajax/upload-failed-invoice*', (route) => route.abort());

        await failedPage.openUploadInvoice(row);
        await failedPage.uploadInvoiceDialog.chooseFile(validInvoice('pdf', uniqueDigits(6)));
        await failedPage.uploadInvoiceDialog.submit();

        await expect(failedPage.uploadInvoiceDialog.dialog).toBeVisible();
        await page.unroute('**/ajax/upload-failed-invoice*');
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(itemId)).toHaveCount(1);
      },
    );

    test(
      'FL-INV-08 An uploaded invoice moves the vehicle from Failed to the Failed Invoice list',
      { tag: ['@functional'] },
      async ({ failedPage, failedInvoicePage }, testInfo) => {
        const reason = destructiveSkipReason(['invoice']);
        test.skip(!!reason, reason ?? '');
        const vin = failedPool.vehicles.invoice;

        await failedPage.gotoByVin(vin);
        const row = failedPage.rows.first();
        await expect(row, `QA-AUTO vehicle ${vin} is in Failed`).toBeVisible();
        const info = await failedPage.readRow(row);

        await failedPage.openUploadInvoice(row);
        await failedPage.uploadInvoiceDialog.chooseFile(validInvoice('pdf', uniqueDigits(6)));
        await failedPage.uploadInvoiceDialog.submit();
        await expect(failedPage.resultAlert).toBeVisible();
        await failedPage.resultAlertOkButton.click();

        // Source: gone from Failed, after a reload.
        await failedPage.gotoByVin(vin);
        await expect(failedPage.row(info.itemId)).toHaveCount(0);

        // Destination: in Failed Invoice, with the vehicle's details. The Type shown there is
        // recorded as found (no category is assumed).
        await failedInvoicePage.gotoByVin(vin);
        await expect(failedInvoicePage.rows).toHaveCount(1);
        const [record] = await failedInvoicePage.readRows();
        testInfo.annotations.push({
          type: 'Failed Invoice Type observed',
          description: record.Type,
        });
        expect(record['Vin Number']).toContain(vin);
        expect(record['Item Title']).toBe(info.vehicleTitle);
        expect(record['Supplier Name']).toBe(info.supplier);
        await expect(failedInvoicePage.viewInvoiceLinks.first()).toBeVisible();
      },
    );
  },
);
