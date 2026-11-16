import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { trackingText } from '@test-data/backend-delivery.data';

// Edit Link on the Delivery Tracking page: the popup is opened, typed into and cancelled. Typing
// runs the form's live validation (a validate-only request); Save is NEVER pressed, and every test
// checks that no real save was sent. Saving a link and checking it persists are blocked pending
// separate authorization.
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

test.describe(
  'Backend - Delivery Tracking - Edit Link (nothing is saved)',
  { tag: ['@regression'] },
  () => {
    test.beforeEach(async ({ deliveryTrackingPage }) => {
      await deliveryTrackingPage.goto();
    });

    test(
      'TRK-LINK-01 Every row shows an Edit Link control',
      { tag: ['@smoke', '@functional'] },
      async ({ deliveryTrackingPage }) => {
        const rows = await deliveryTrackingPage.rows.count();

        await expect(deliveryTrackingPage.editLinkLinks).toHaveCount(rows);
        await expect(deliveryTrackingPage.editLinkLinks.first()).toContainText(
          trackingText.editLink,
        );
      },
    );

    test(
      'TRK-LINK-02 The popup shows its title, the Tracking Link box, Cancel and Save',
      { tag: ['@smoke', '@functional'] },
      async ({ deliveryTrackingPage }) => {
        await deliveryTrackingPage.openEditLink(deliveryTrackingPage.rows.first());
        const dialog = deliveryTrackingPage.linkDialog;
        const saves = dialog.countSaves();

        await expect(dialog.title).toHaveText(trackingText.linkDialogTitle);
        await expect(dialog.linkInput).toBeEditable();
        await expect(dialog.cancelButton).toBeVisible();
        await expect(dialog.saveButton).toBeVisible();
        expect(saves(), 'opening the popup saves nothing').toBe(0);
        await dialog.cancel();
      },
    );

    test(
      'TRK-LINK-03 The Tracking Link box is optional: leaving it empty shows no error',
      { tag: ['@functional'] },
      async ({ deliveryTrackingPage }) => {
        await deliveryTrackingPage.openEditLink(deliveryTrackingPage.rows.first());
        const dialog = deliveryTrackingPage.linkDialog;
        const saves = dialog.countSaves();

        await expect(dialog.linkInput).not.toHaveAttribute('required', /.*/);
        await dialog.typeLink('');

        await expect(dialog.linkError).toHaveText('');
        expect(saves()).toBe(0);
        await dialog.cancel();
      },
    );

    test(
      'TRK-LINK-04 The box takes up to 1,000 characters and refuses more, with nothing saved',
      { tag: ['@functional', '@negative'] },
      async ({ deliveryTrackingPage }) => {
        await deliveryTrackingPage.openEditLink(deliveryTrackingPage.rows.first());
        const dialog = deliveryTrackingPage.linkDialog;
        const saves = dialog.countSaves();

        await dialog.typeLink('a'.repeat(trackingText.linkMaxLength));
        await expect(dialog.linkError, '1,000 characters').toHaveText('');

        await dialog.typeLink('a'.repeat(trackingText.linkMaxLength + 1));
        await expect(dialog.linkError, '1,001 characters').toHaveText(trackingText.linkTooLong);

        expect(saves(), 'no real save was sent').toBe(0);
        await dialog.cancel();
      },
    );

    test(
      'TRK-LINK-05 Cancel closes the popup and discards what was typed',
      { tag: ['@functional'] },
      async ({ deliveryTrackingPage }) => {
        const row = deliveryTrackingPage.rows.first();
        await deliveryTrackingPage.openEditLink(row);
        const dialog = deliveryTrackingPage.linkDialog;
        const saves = dialog.countSaves();
        await dialog.typeLink('https://example.com/qa-auto-not-saved');

        await dialog.cancel();

        await expect(dialog.dialog).toBeHidden();
        await deliveryTrackingPage.openEditLink(row);
        await expect(dialog.linkInput).toHaveValue('');
        expect(saves(), 'nothing was saved').toBe(0);
        await dialog.cancel();
      },
    );

    test(
      'TRK-LINK-06 The Tracking Link column still shows only "Edit Link" after the popup is used and cancelled',
      { tag: ['@functional'] },
      async ({ page, deliveryTrackingPage }) => {
        const before = await deliveryTrackingPage.readRows();
        await deliveryTrackingPage.openEditLink(deliveryTrackingPage.rows.first());
        await deliveryTrackingPage.linkDialog.typeLink('qa-auto');
        await deliveryTrackingPage.linkDialog.cancel();

        await page.reload();

        expect(await deliveryTrackingPage.readRows()).toEqual(before);
      },
    );
  },
);
