import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { failedInvoiceText, failedText, failedUrls } from '@test-data/backend-failed.data';
import { unsupportedInvoices, validInvoice } from '@utils/test-files';
import { uniqueDigits } from '@utils/unique';

// Upload Invoice from the Failed list, and the Failed Invoice list it feeds. Read-only: the popup is
// opened and files are only chosen, never submitted. Real invoice uploads are not part of the
// automation scope.
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
