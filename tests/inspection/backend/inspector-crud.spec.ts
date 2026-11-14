import { expect, test } from '@fixtures/inspection.fixture';
import {
  buildInspectorData,
  existingInspector,
  inspectorText,
} from '@test-data/inspection/inspector.data';
import { userFormText } from '@test-data/inspection/user-form.data';
import { inspectionUrls } from '@test-data/inspection/inspection-login.data';

/**
 * Mazad Inspection backend > Inspectors CRUD (/inspector, stg-224-inspection). Every mutating
 * test creates its own "QA-AUTO INSPECTOR <digits>" record through the UI; the inspectorCleanup
 * fixture deletes it afterwards by id, whether the test passed or failed. The 23 real pre-existing
 * Inspector records (including "QA TEST", id 5464) and the dedicated persistent "QA-AUTO
 * INSPECTOR TEST" account (id 5485, for the backend-to-Android login integration scenario) are
 * never created, edited, or deleted here.
 *
 * This is the exact same Create/Update/Delete form and grid as QC Users (see UserFormPage,
 * UserViewPage, InspectionListPage), confirmed live 2026-11-11, with one extra field Create does
 * not require: a Krajee star-rating widget (see InspectorFormPage.ratingInput).
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Inspection Backend - Inspectors CRUD', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, inspectionLoginPage, inspectionAdmin }) => {
    await inspectionLoginPage.goto();
    await inspectionLoginPage.loginAs(inspectionAdmin);
    await expect(page).toHaveURL(inspectionUrls.dashboard);
  });

  test(
    'Creates an Inspector, lists it, views it, edits it (including its PIN), and the edit persists after reload',
    { tag: ['@smoke', '@functional', '@crud', '@mutates'] },
    async ({ page, inspectorFormPage, inspectorListPage, inspectorViewPage, inspectorCleanup }) => {
      const data = buildInspectorData();
      let id = '';

      await test.step('Create', async () => {
        await inspectorFormPage.gotoCreate();
        await inspectorFormPage.fillForm(data);
        id = await inspectorFormPage.saveAndWaitForCreatedPage();
        inspectorCleanup.track(id);
        await expect(inspectorFormPage.successAlert).toContainText(userFormText.createdMessage);
        await expect(inspectorFormPage.pageHeading).toHaveText(
          inspectorText.updateHeading(data.fullNameEn),
        );
      });

      await test.step('List', async () => {
        await inspectorListPage.goto();
        await expect(inspectorListPage.row(id)).toContainText(data.fullNameEn);
        await expect(inspectorListPage.row(id)).toContainText(data.status);
      });

      await test.step('View', async () => {
        await inspectorViewPage.goto(id);
        await expect(inspectorViewPage.fullNameEnValue).toHaveText(data.fullNameEn);
        await expect(inspectorViewPage.fullNameArValue).toHaveText(data.fullNameAr);
        await expect(inspectorViewPage.statusValue).toHaveText(data.status);
        await expect(inspectorViewPage.ratingValue).toHaveText('Not Rated');
        // Rendered with inserted spaces and a leading 0 (e.g. "051 814 9266"), so compared by
        // digits only rather than assuming an exact display format.
        const shownMobileDigits = (await inspectorViewPage.mobileNumberInput.inputValue()).replace(
          /\D/g,
          '',
        );
        expect(shownMobileDigits.endsWith(data.mobileNumber)).toBe(true);
      });

      const editedName = `${data.fullNameEn} Edited`;

      await test.step('Edit profile fields', async () => {
        await inspectorFormPage.gotoUpdate(id);
        await inspectorFormPage.fillForm({ fullNameEn: editedName });
        await inspectorFormPage.saveAndWaitForUpdatePage();
        await expect(inspectorFormPage.successAlert).toContainText(userFormText.updatedMessage);
      });

      await test.step('The PIN can also be changed through this same Edit form', async () => {
        // Confirmed live: the Update form prefills everything except Pin/Confirm Password, which
        // stay blank; filling them in changes the login PIN (not just profile fields).
        await expect(inspectorFormPage.pinInput).toHaveValue('');
        await inspectorFormPage.fillForm({ pin: '246890', confirmPin: '246890' });
        await inspectorFormPage.saveAndWaitForUpdatePage();
        await expect(inspectorFormPage.successAlert).toContainText(userFormText.updatedMessage);
      });

      await test.step('Both edits persist after a reload', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(inspectorFormPage.fullNameEnInput).toHaveValue(editedName);
        // The PIN itself is never redisplayed (confirmed live, same as Create); persistence of a
        // PIN change is instead verified end-to-end by the Android login integration scenario.
        await expect(inspectorFormPage.pinInput).toHaveValue('');
      });

      await test.step('Cancelling delete leaves the record in place', async () => {
        await inspectorListPage.goto();
        await inspectorListPage.startDeleteAndCancel(inspectorListPage.row(id));
        await expect(inspectorListPage.confirmDialog.dialog).toBeHidden();
        await inspectorListPage.goto();
        await expect(inspectorListPage.row(id)).toBeVisible();
      });

      await test.step('Confirming delete removes the record', async () => {
        await inspectorListPage.startDeleteAndConfirm(inspectorListPage.row(id));
        await inspectorListPage.goto();
        await expect(inspectorListPage.row(id)).toHaveCount(0);
      });
    },
  );

  test.describe('Create validation', { tag: ['@negative'] }, () => {
    test('Every required field is validated on an empty submit', async ({ inspectorFormPage }) => {
      await inspectorFormPage.gotoCreate();
      const submissions = inspectorFormPage.countSubmissions();

      await inspectorFormPage.save();

      await expect(inspectorFormPage.statusError).toHaveText(userFormText.statusRequired);
      await expect(inspectorFormPage.mobileNumberError).toHaveText(
        userFormText.mobileNumberRequired,
      );
      await expect(inspectorFormPage.fullNameEnError).toHaveText(userFormText.fullNameEnRequired);
      await expect(inspectorFormPage.pinError).toHaveText(userFormText.pinRequired);
      await expect(inspectorFormPage.confirmPinError).toHaveText(userFormText.confirmPinRequired);
      expect(submissions(), 'the empty form was actually sent to the server').toBeGreaterThan(0);
    });

    test('Full Name Ar is required even though it has no inline validator', async ({
      inspectorFormPage,
      inspectorListPage,
    }) => {
      const data = buildInspectorData({ fullNameAr: '' });
      await inspectorFormPage.gotoCreate();
      await inspectorFormPage.fillForm(data);

      await inspectorFormPage.save();

      await expect(inspectorFormPage.errorAlert).toContainText(userFormText.fullNameArRequired);
      await inspectorListPage.goto();
      await expect(inspectorListPage.rows.filter({ hasText: data.fullNameEn })).toHaveCount(0);
    });

    test('A PIN under 6 digits is rejected', async ({ inspectorFormPage }) => {
      const data = buildInspectorData({ pin: '123', confirmPin: '123' });
      await inspectorFormPage.gotoCreate();
      await inspectorFormPage.fillForm(data);

      await inspectorFormPage.save();

      await expect(inspectorFormPage.pinError).toHaveText(userFormText.pinTooShort);
      await expect(inspectorFormPage.confirmPinError).toHaveText(userFormText.pinTooShort);
    });

    test('Mismatched Pin and Confirm Password are rejected', async ({ inspectorFormPage }) => {
      const data = buildInspectorData({ pin: '135790', confirmPin: '097531' });
      await inspectorFormPage.gotoCreate();
      await inspectorFormPage.fillForm(data);

      await inspectorFormPage.save();

      await expect(inspectorFormPage.confirmPinError).toHaveText(userFormText.pinsDontMatch);
    });

    test('A mobile number already used by another Inspector is rejected', async ({
      inspectorFormPage,
    }) => {
      const data = buildInspectorData({ mobileNumber: existingInspector.localMobileNumber });
      await inspectorFormPage.gotoCreate();
      await inspectorFormPage.fillForm(data);

      await inspectorFormPage.save();

      await expect(inspectorFormPage.mobileNumberError).toHaveText(
        userFormText.mobileNumberTaken(existingInspector.formattedMobileNumber),
      );
    });
  });
});
