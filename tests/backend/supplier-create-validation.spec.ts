import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import type { SupplierField } from '@pages/backend/suppliers/supplier-form.page';
import {
  invalidSupplierFieldCases,
  newTestSupplier,
  supplierDetailLabels,
  supplierFormData,
  supplierSwitchDefaults,
  supplierTabs,
  supplierText,
  supplierUrls,
} from '@test-data/supplier.data';

// Pages open signed in as Dev Root; see devRootSession for what is recorded.
test.use(devRootSession);

// Nothing in this file creates a supplier: every case is rejected before saving, and each
// test checks that no success popup appeared.
test.describe('Create Supplier - form and validation', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, supplierFormPage }) => {
    await supplierFormPage.gotoCreate();
    await expect(page).toHaveURL(supplierUrls.create);
  });

  test.afterEach(async ({ supplierFormPage }) => {
    await expect(supplierFormPage.resultPopup).toBeHidden();
  });

  test(
    'Form shows the page title, breadcrumb and empty fields',
    { tag: ['@functional'] },
    async ({ page, supplierFormPage }) => {
      await expect(page).toHaveTitle(supplierText.createTitle);
      await expect(supplierFormPage.breadcrumbList).toBeVisible();
      for (const field of ['name', 'nameEn', 'phone', 'email', 'crNumber', 'taxId'] as const) {
        await expect(supplierFormPage.input(field)).toBeEmpty();
      }
      await expect(supplierFormPage.selectedStatus()).toHaveText(
        shownOption(supplierText.placeholders.status),
      );
      await expect(supplierFormPage.input('newPassword')).toHaveAttribute('type', 'password');
      await expect(supplierFormPage.input('passwordConfirm')).toHaveAttribute('type', 'password');
      await expect(supplierFormPage.saveButton).toBeEnabled();
    },
  );

  test(
    'Only Basic Information is available before the supplier is saved',
    { tag: ['@functional'] },
    async ({ supplierFormPage }) => {
      const [first, ...later] = supplierTabs;
      await expect(supplierFormPage.tab(first)).toHaveClass(/active/);
      for (const name of later) {
        await expect(supplierFormPage.tab(name)).toHaveClass(/disabled/);
      }
    },
  );

  test(
    'Fields filled from the CR record are read-only',
    { tag: ['@functional'] },
    async ({ supplierFormPage }) => {
      await expect(supplierFormPage.input('supplierName')).toBeDisabled();
      await expect(supplierFormPage.input('supplierNameEn')).toBeDisabled();
      await expect(supplierFormPage.switchInput('addUser')).toBeDisabled();
      await expect(supplierFormPage.switchInput('declarationReceipt')).toBeDisabled();
    },
  );

  test(
    'Supplier Config switches start with their default values',
    { tag: ['@functional'] },
    async ({ supplierFormPage }) => {
      for (const [name, on] of Object.entries(supplierSwitchDefaults)) {
        const input = supplierFormPage.switchInput(name as keyof typeof supplierSwitchDefaults);
        await expect(input, name).toBeChecked({ checked: on });
      }
    },
  );

  test(
    'Saving an empty form shows every required message',
    { tag: ['@negative'] },
    async ({ page, supplierFormPage }) => {
      await supplierFormPage.save();

      // Every field with a required message (the keys are form field names).
      const required = Object.entries(supplierText.required) as [SupplierField, string][];
      for (const [field, message] of required) {
        await expect(supplierFormPage.error(field)).toHaveText(message);
      }
      // Optional fields have no required message.
      await expect(supplierFormPage.error('email')).toBeEmpty();
      await expect(page).toHaveURL(supplierUrls.create);
    },
  );

  test(
    'Filling a required field clears its message',
    { tag: ['@negative'] },
    async ({ supplierFormPage }) => {
      await supplierFormPage.save();
      await expect(supplierFormPage.error('nameEn')).toHaveText(supplierText.required.nameEn);

      await supplierFormPage.enter('nameEn', supplierFormData.validNameEn);

      await expect(supplierFormPage.error('nameEn')).toBeEmpty();
    },
  );

  for (const { name, field, input, error } of invalidSupplierFieldCases) {
    test(`Rejects ${name}`, { tag: ['@negative'] }, async ({ supplierFormPage }) => {
      await supplierFormPage.enter(field, input);

      await expect(supplierFormPage.error(field)).toHaveText(error);
      await expect(supplierFormPage.input(field)).toHaveClass(/is-invalid/);
    });
  }

  test(
    'Accepts names of exactly 100 characters',
    { tag: ['@functional'] },
    async ({ supplierFormPage }) => {
      await supplierFormPage.enter('nameEn', supplierFormData.longestNameEn);
      await supplierFormPage.enter('name', supplierFormData.longestName);

      await expect(supplierFormPage.error('nameEn')).toBeEmpty();
      await expect(supplierFormPage.error('name')).toBeEmpty();
    },
  );

  test(
    'Accepts a well-formed Saudi mobile, CR number and tax ID',
    { tag: ['@functional'] },
    async ({ supplierFormPage }) => {
      const data = newTestSupplier();

      await supplierFormPage.enter('phone', data.phone);
      await supplierFormPage.enter('crNumber', data.crNumber);
      await supplierFormPage.enter('taxId', data.taxId);

      await expect(supplierFormPage.error('phone')).toBeEmpty();
      await expect(supplierFormPage.error('crNumber')).toBeEmpty();
      await expect(supplierFormPage.error('taxId')).toBeEmpty();
    },
  );

  test(
    'Accepts several emails separated by commas',
    { tag: ['@functional'] },
    async ({ supplierFormPage }) => {
      await supplierFormPage.enter('email', supplierFormData.multipleEmails);

      await expect(supplierFormPage.error('email')).toBeEmpty();
    },
  );

  test(
    'Rejects a password shorter than 6 characters',
    { tag: ['@negative'] },
    async ({ supplierFormPage }) => {
      await supplierFormPage.enter('newPassword', supplierFormData.shortPassword);

      await expect(supplierFormPage.error('newPassword')).toHaveText(
        supplierText.invalid.passwordTooShort,
      );
    },
  );

  test(
    'Rejects a password confirmation that does not match',
    { tag: ['@negative'] },
    async ({ supplierFormPage }) => {
      await supplierFormPage.enter('newPassword', supplierFormData.password);
      await supplierFormPage.enter('passwordConfirm', supplierFormData.mismatchedPassword);

      await expect(supplierFormPage.error('passwordConfirm')).toHaveText(
        supplierText.invalid.passwordMismatch,
      );
    },
  );

  test(
    'Invalid data in one field blocks saving an otherwise valid form',
    { tag: ['@negative'] },
    async ({ page, supplierFormPage }) => {
      await supplierFormPage.fillForm({
        ...newTestSupplier(),
        crNumber: supplierFormData.invalidCrNumber,
      });

      await supplierFormPage.save();

      await expect(supplierFormPage.error('crNumber')).toHaveText(supplierText.invalid.crNumber);
      await expect(page).toHaveURL(supplierUrls.create);
    },
  );
});

test.describe('Create Supplier - duplicates', { tag: ['@regression'] }, () => {
  test.afterEach(async ({ supplierFormPage }) => {
    await expect(supplierFormPage.resultPopup).toBeHidden();
  });

  test(
    'Rejects the phone of an existing supplier',
    { tag: ['@negative'] },
    async ({ supplierListPage, supplierFormPage }) => {
      await supplierListPage.goto();
      const [existing] = await supplierListPage.readRows();
      await supplierFormPage.gotoCreate();

      await supplierFormPage.enter('phone', existing.Phone);

      await expect(supplierFormPage.error('phone')).toHaveText(supplierText.duplicate.phone);
    },
  );

  test(
    'Rejects the CR number of an existing supplier',
    { tag: ['@negative'] },
    async ({ supplierListPage, supplierViewPage, supplierFormPage }) => {
      await supplierListPage.goto();
      const [existing] = await supplierListPage.readRows();
      await supplierViewPage.goto(existing.ID);
      const crNumber = await supplierViewPage.value(supplierDetailLabels.crNumber).inputValue();
      await supplierFormPage.gotoCreate();

      await supplierFormPage.enter('crNumber', crNumber);

      await expect(supplierFormPage.error('crNumber')).toHaveText(
        supplierText.duplicate.crNumber(crNumber),
      );
    },
  );

  // Accepted: only phone and CR number must be unique (see test-data/supplier.data.ts).
  test(
    'Accepts the email and tax ID of an existing supplier',
    { tag: ['@functional'] },
    async ({ supplierListPage, supplierViewPage, supplierFormPage }) => {
      await supplierListPage.goto();
      const existing = (await supplierListPage.readRows()).find((row) => row.Email)!;
      await supplierViewPage.goto(existing.ID);
      const taxId = await supplierViewPage.value(supplierDetailLabels.taxId).inputValue();
      await supplierFormPage.gotoCreate();

      await supplierFormPage.enter('email', existing.Email);
      await supplierFormPage.enter('taxId', taxId);

      await expect(supplierFormPage.error('email')).toBeEmpty();
      await expect(supplierFormPage.error('taxId')).toBeEmpty();
    },
  );

  test(
    'Saving with an existing phone does not create the supplier',
    { tag: ['@negative'] },
    async ({ page, supplierListPage, supplierFormPage }) => {
      await supplierListPage.goto();
      const [existing] = await supplierListPage.readRows();
      await supplierFormPage.gotoCreate();
      await supplierFormPage.fillForm({ ...newTestSupplier(), phone: existing.Phone });

      await supplierFormPage.save();

      await expect(supplierFormPage.error('phone')).toHaveText(supplierText.duplicate.phone);
      await expect(page).toHaveURL(supplierUrls.create);
    },
  );
});
