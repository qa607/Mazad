import { expect, test } from '@fixtures/inspection.fixture';
import { buildQcUserData, existingQcUser, qcUserText } from '@test-data/inspection/qc-user.data';
import { inspectionUrls } from '@test-data/inspection/inspection-login.data';

/**
 * Mazad Inspection backend > QC Users CRUD (/operation, stg-224-inspection). Every mutating test
 * creates its own "QA-AUTO QC <digits>" record through the UI; the qcCleanup fixture deletes it
 * afterwards by id, whether the test passed or failed. The two pre-existing QC records (Ahmed
 * Moussa id 5333, Mohammed Abduo id 1383) are read-only reference data here and are never
 * created, edited, or deleted.
 *
 * There is no per-row delete link on this grid: the single delete button (#user-delete-btn) acts
 * on whichever rows' checkboxes are checked, confirmed through InspectionConfirmDialog (a
 * Bootstrap Dialog modal, not a native confirm()) — so checking one row and deleting it already
 * exercises the same mechanism a multi-row bulk delete would.
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Inspection Backend - QC Users CRUD', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, inspectionLoginPage, inspectionAdmin }) => {
    await inspectionLoginPage.goto();
    await inspectionLoginPage.loginAs(inspectionAdmin);
    // Logging in has no explicit navigation wait of its own (see InspectionLoginPage.submit), so
    // the next action in a test can otherwise race the login's own in-flight navigation.
    await expect(page).toHaveURL(inspectionUrls.dashboard);
  });

  test(
    'Creates a QC user, lists it, views it, edits it, and the edit persists after reload',
    { tag: ['@smoke', '@functional', '@crud', '@mutates'] },
    async ({ page, qcFormPage, qcListPage, qcViewPage, qcCleanup }) => {
      const data = buildQcUserData();
      let id = '';

      await test.step('Create', async () => {
        await qcFormPage.gotoCreate();
        await qcFormPage.fillForm(data);
        id = await qcFormPage.saveAndWaitForCreatedPage();
        qcCleanup.track(id);
        await expect(qcFormPage.successAlert).toContainText(qcUserText.createdMessage);
        await expect(qcFormPage.pageHeading).toHaveText(qcUserText.updateHeading(data.fullNameEn));
      });

      await test.step('List', async () => {
        await qcListPage.goto();
        await expect(qcListPage.row(id)).toContainText(data.fullNameEn);
        await expect(qcListPage.row(id)).toContainText(data.status);
      });

      await test.step('View', async () => {
        await qcViewPage.goto(id);
        await expect(qcViewPage.fullNameEnValue).toHaveText(data.fullNameEn);
        await expect(qcViewPage.fullNameArValue).toHaveText(data.fullNameAr);
        await expect(qcViewPage.statusValue).toHaveText(data.status);
        // Rendered with inserted spaces and a leading 0 (e.g. "051 814 9266"), so compared by
        // digits only rather than assuming an exact display format.
        const shownMobileDigits = (await qcViewPage.mobileNumberInput.inputValue()).replace(
          /\D/g,
          '',
        );
        expect(shownMobileDigits.endsWith(data.mobileNumber)).toBe(true);
      });

      const editedName = `${data.fullNameEn} Edited`;

      await test.step('Edit', async () => {
        await qcFormPage.gotoUpdate(id);
        await qcFormPage.fillForm({ fullNameEn: editedName });
        await qcFormPage.saveAndWaitForUpdatePage();
        await expect(qcFormPage.successAlert).toContainText(qcUserText.updatedMessage);
      });

      await test.step('Edit persists after a reload', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(qcFormPage.fullNameEnInput).toHaveValue(editedName);
      });

      await test.step('Cancelling delete leaves the record in place', async () => {
        await qcListPage.goto();
        await qcListPage.startDeleteAndCancel(qcListPage.row(id));
        await expect(qcListPage.confirmDialog.dialog).toBeHidden();
        await qcListPage.goto();
        await expect(qcListPage.row(id)).toBeVisible();
      });

      await test.step('Confirming delete removes the record', async () => {
        await qcListPage.startDeleteAndConfirm(qcListPage.row(id));
        await qcListPage.goto();
        await expect(qcListPage.row(id)).toHaveCount(0);
      });
    },
  );

  test(
    'Bulk-deleting two selected QC users removes both at once',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ qcFormPage, qcListPage, qcCleanup }) => {
      const first = buildQcUserData();
      const second = buildQcUserData();
      const ids: string[] = [];
      for (const data of [first, second]) {
        await qcFormPage.gotoCreate();
        await qcFormPage.fillForm(data);
        const id = await qcFormPage.saveAndWaitForCreatedPage();
        qcCleanup.track(id);
        ids.push(id);
      }

      await qcListPage.goto();
      await qcListPage.rowCheckbox(qcListPage.row(ids[0])).check();
      await qcListPage.rowCheckbox(qcListPage.row(ids[1])).check();
      await qcListPage.deleteButton.click();
      await qcListPage.confirmDialog.waitForVisible();
      await qcListPage.confirmDialog.confirmAndWaitForPageLoad();

      await qcListPage.goto();
      await expect(qcListPage.row(ids[0])).toHaveCount(0);
      await expect(qcListPage.row(ids[1])).toHaveCount(0);
    },
  );

  test.describe('Create validation', { tag: ['@negative'] }, () => {
    test('Every required field is validated on an empty submit', async ({ qcFormPage }) => {
      await qcFormPage.gotoCreate();
      const submissions = qcFormPage.countSubmissions();

      await qcFormPage.save();

      await expect(qcFormPage.statusError).toHaveText(qcUserText.statusRequired);
      await expect(qcFormPage.mobileNumberError).toHaveText(qcUserText.mobileNumberRequired);
      await expect(qcFormPage.fullNameEnError).toHaveText(qcUserText.fullNameEnRequired);
      await expect(qcFormPage.pinError).toHaveText(qcUserText.pinRequired);
      await expect(qcFormPage.confirmPinError).toHaveText(qcUserText.confirmPinRequired);
      // No inline required validator exists for Full Name Ar (confirmed live), unlike the fields
      // above; it is still enforced, as the dedicated test below shows.
      expect(submissions(), 'the empty form was actually sent to the server').toBeGreaterThan(0);
    });

    test('Full Name Ar is required even though it has no inline validator', async ({
      qcFormPage,
      qcListPage,
    }) => {
      const data = buildQcUserData({ fullNameAr: '' });
      await qcFormPage.gotoCreate();
      await qcFormPage.fillForm(data);

      await qcFormPage.save();

      await expect(qcFormPage.errorAlert).toContainText(qcUserText.fullNameArRequired);
      await qcListPage.goto();
      await expect(qcListPage.rows.filter({ hasText: data.fullNameEn })).toHaveCount(0);
    });

    test('A PIN under 6 digits is rejected', async ({ qcFormPage }) => {
      const data = buildQcUserData({ pin: '123', confirmPin: '123' });
      await qcFormPage.gotoCreate();
      await qcFormPage.fillForm(data);

      await qcFormPage.save();

      await expect(qcFormPage.pinError).toHaveText(qcUserText.pinTooShort);
      await expect(qcFormPage.confirmPinError).toHaveText(qcUserText.pinTooShort);
    });

    test('Mismatched Pin and Confirm Password are rejected', async ({ qcFormPage }) => {
      const data = buildQcUserData({ pin: '135790', confirmPin: '097531' });
      await qcFormPage.gotoCreate();
      await qcFormPage.fillForm(data);

      await qcFormPage.save();

      await expect(qcFormPage.confirmPinError).toHaveText(qcUserText.pinsDontMatch);
    });

    test('A mobile number already used by another QC user is rejected', async ({ qcFormPage }) => {
      const data = buildQcUserData({ mobileNumber: existingQcUser.localMobileNumber });
      await qcFormPage.gotoCreate();
      await qcFormPage.fillForm(data);

      await qcFormPage.save();

      await expect(qcFormPage.mobileNumberError).toHaveText(
        qcUserText.mobileNumberTaken(existingQcUser.formattedMobileNumber),
      );
    });
  });
});
