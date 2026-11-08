import { expect, test } from '@fixtures/supplier.fixture';
import { shownOption } from '@utils/widgets';
import type { SupplierField } from '@pages/backend/supplier-form.page';
import { newTestSupplier, supplierText, supplierUrls } from '@test-data/supplier.data';

// Signed in as Dev Root: no trace or video (they would capture the account header).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Nothing in this file creates a supplier: every case is rejected before saving, and each
// test checks that no success popup appeared.
test.describe('Create Supplier - form and validation', () => {
  test.beforeEach(async ({ page, supplierFormPage }) => {
    await supplierFormPage.gotoCreate();
    await expect(page).toHaveURL(supplierUrls.create);
  });

  test.afterEach(async ({ supplierFormPage }) => {
    await expect(supplierFormPage.resultPopup).toBeHidden();
  });

  test('Form shows the page title, breadcrumb and empty fields', async ({
    page,
    supplierFormPage,
  }) => {
    await expect(page).toHaveTitle(supplierText.createTitle);
    await expect(supplierFormPage.breadcrumbList).toBeVisible();
    for (const field of ['name', 'nameEn', 'phone', 'email', 'crNumber', 'taxId'] as const) {
      await expect(supplierFormPage.input(field)).toBeEmpty();
    }
    await expect(supplierFormPage.selectedStatus()).toHaveText(shownOption('Choose Status'));
    await expect(supplierFormPage.input('newPassword')).toHaveAttribute('type', 'password');
    await expect(supplierFormPage.input('passwordConfirm')).toHaveAttribute('type', 'password');
    await expect(supplierFormPage.saveButton).toBeEnabled();
  });

  test('Only Basic Information is available before the supplier is saved', async ({
    supplierFormPage,
  }) => {
    await expect(supplierFormPage.tab('Basic Information')).toHaveClass(/active/);
    for (const name of ['Auction Info', 'Inspection Locations', 'Email Templates', 'Commission']) {
      await expect(supplierFormPage.tab(name)).toHaveClass(/disabled/);
    }
  });

  test('Fields filled from the CR record are read-only', async ({ supplierFormPage }) => {
    await expect(supplierFormPage.input('supplierName')).toBeDisabled();
    await expect(supplierFormPage.input('supplierNameEn')).toBeDisabled();
    await expect(supplierFormPage.switchInput('addUser')).toBeDisabled();
    await expect(supplierFormPage.switchInput('declarationReceipt')).toBeDisabled();
  });

  test('Supplier Config switches start with their default values', async ({ supplierFormPage }) => {
    const defaults = {
      purchasingRequest: false,
      insurance: true,
      addUser: true,
      declarationReceipt: true,
      insuranceSupplier: false,
      canEditReservedPrice: false,
      requestMojaz: false,
      postponeInvoice: false,
    } as const;
    for (const [name, on] of Object.entries(defaults)) {
      const input = supplierFormPage.switchInput(name as keyof typeof defaults);
      if (on) await expect(input, name).toBeChecked();
      else await expect(input, name).not.toBeChecked();
    }
  });

  test('Saving an empty form shows every required message', async ({ page, supplierFormPage }) => {
    await supplierFormPage.save();

    const required: [SupplierField, string][] = [
      ['name', supplierText.required.name],
      ['nameEn', supplierText.required.nameEn],
      ['status', supplierText.required.status],
      ['phone', supplierText.required.phone],
      ['newPassword', supplierText.required.newPassword],
      ['crNumber', supplierText.required.crNumber],
      ['taxId', supplierText.required.taxId],
    ];
    for (const [field, message] of required) {
      await expect(supplierFormPage.error(field)).toHaveText(message);
    }
    // Optional fields have no required message.
    await expect(supplierFormPage.error('email')).toBeEmpty();
    await expect(page).toHaveURL(supplierUrls.create);
  });

  test('Filling a required field clears its message', async ({ supplierFormPage }) => {
    await supplierFormPage.save();
    await expect(supplierFormPage.error('nameEn')).toHaveText(supplierText.required.nameEn);

    await supplierFormPage.enter('nameEn', 'QA-AUTO Name');

    await expect(supplierFormPage.error('nameEn')).toBeEmpty();
  });

  const invalidCases: [string, SupplierField, string, string][] = [
    ['too short phone', 'phone', '12345', supplierText.invalid.phone],
    ['letters in phone', 'phone', 'abcdefghij', supplierText.invalid.phone],
    ['email without @', 'email', 'not-an-email', supplierText.invalid.email('not-an-email')],
    ['CR number not starting with 7', 'crNumber', '8123456789', supplierText.invalid.crNumber],
    ['CR number with 9 digits', 'crNumber', '712345678', supplierText.invalid.crNumber],
    ['CR number with letters', 'crNumber', '71234567ab', supplierText.invalid.crNumber],
    ['tax ID not starting with 3', 'taxId', '123456789012345', supplierText.invalid.taxId],
    ['tax ID with 14 digits', 'taxId', '31234567890123', supplierText.invalid.taxId],
    [
      'English Name over 100 characters',
      'nameEn',
      'x'.repeat(101),
      supplierText.invalid.nameEnTooLong,
    ],
    ['Arabic Name over 100 characters', 'name', 'م'.repeat(101), supplierText.invalid.nameTooLong],
  ];
  for (const [label, field, value, message] of invalidCases) {
    test(`Rejects ${label}`, async ({ supplierFormPage }) => {
      await supplierFormPage.enter(field, value);

      await expect(supplierFormPage.error(field)).toHaveText(message);
      await expect(supplierFormPage.input(field)).toHaveClass(/is-invalid/);
    });
  }

  test('Accepts names of exactly 100 characters', async ({ supplierFormPage }) => {
    await supplierFormPage.enter('nameEn', 'x'.repeat(100));
    await supplierFormPage.enter('name', 'م'.repeat(100));

    await expect(supplierFormPage.error('nameEn')).toBeEmpty();
    await expect(supplierFormPage.error('name')).toBeEmpty();
  });

  test('Accepts a well-formed Saudi mobile, CR number and tax ID', async ({ supplierFormPage }) => {
    const data = newTestSupplier();

    await supplierFormPage.enter('phone', data.phone);
    await supplierFormPage.enter('crNumber', data.crNumber);
    await supplierFormPage.enter('taxId', data.taxId);

    await expect(supplierFormPage.error('phone')).toBeEmpty();
    await expect(supplierFormPage.error('crNumber')).toBeEmpty();
    await expect(supplierFormPage.error('taxId')).toBeEmpty();
  });

  test('Accepts several emails separated by commas', async ({ supplierFormPage }) => {
    await supplierFormPage.enter('email', 'qa.one@example.com, qa.two@example.com');

    await expect(supplierFormPage.error('email')).toBeEmpty();
  });

  test('Rejects a password shorter than 6 characters', async ({ supplierFormPage }) => {
    await supplierFormPage.enter('newPassword', '12345');

    await expect(supplierFormPage.error('newPassword')).toHaveText(
      supplierText.invalid.passwordTooShort,
    );
  });

  test('Rejects a password confirmation that does not match', async ({ supplierFormPage }) => {
    await supplierFormPage.enter('newPassword', 'QaAuto#2026');
    await supplierFormPage.enter('passwordConfirm', 'QaAuto#2027');

    await expect(supplierFormPage.error('passwordConfirm')).toHaveText(
      supplierText.invalid.passwordMismatch,
    );
  });

  test('Invalid data in one field blocks saving an otherwise valid form', async ({
    page,
    supplierFormPage,
  }) => {
    await supplierFormPage.fill({ ...newTestSupplier(), crNumber: '8123456789' });

    await supplierFormPage.save();

    await expect(supplierFormPage.error('crNumber')).toHaveText(supplierText.invalid.crNumber);
    await expect(page).toHaveURL(supplierUrls.create);
  });
});

test.describe('Create Supplier - duplicates', () => {
  test.afterEach(async ({ supplierFormPage }) => {
    await expect(supplierFormPage.resultPopup).toBeHidden();
  });

  test('Rejects the phone of an existing supplier', async ({
    supplierListPage,
    supplierFormPage,
  }) => {
    await supplierListPage.goto();
    const [existing] = await supplierListPage.readRows();
    await supplierFormPage.gotoCreate();

    await supplierFormPage.enter('phone', existing.Phone);

    await expect(supplierFormPage.error('phone')).toHaveText(supplierText.duplicate.phone);
  });

  test('Rejects the CR number of an existing supplier', async ({
    supplierListPage,
    supplierViewPage,
    supplierFormPage,
  }) => {
    await supplierListPage.goto();
    const [existing] = await supplierListPage.readRows();
    await supplierViewPage.goto(existing.ID);
    const crNumber = await supplierViewPage.value('Cr Number').inputValue();
    await supplierFormPage.gotoCreate();

    await supplierFormPage.enter('crNumber', crNumber);

    await expect(supplierFormPage.error('crNumber')).toHaveText(
      supplierText.duplicate.crNumber(crNumber),
    );
  });

  // Accepted: only phone and CR number must be unique (see test-data/supplier.data.ts).
  test('Accepts the email and tax ID of an existing supplier', async ({
    supplierListPage,
    supplierViewPage,
    supplierFormPage,
  }) => {
    await supplierListPage.goto();
    const existing = (await supplierListPage.readRows()).find((row) => row.Email)!;
    await supplierViewPage.goto(existing.ID);
    const taxId = await supplierViewPage.value('Tax ID').inputValue();
    await supplierFormPage.gotoCreate();

    await supplierFormPage.enter('email', existing.Email);
    await supplierFormPage.enter('taxId', taxId);

    await expect(supplierFormPage.error('email')).toBeEmpty();
    await expect(supplierFormPage.error('taxId')).toBeEmpty();
  });

  test('Saving with an existing phone does not create the supplier', async ({
    page,
    supplierListPage,
    supplierFormPage,
  }) => {
    await supplierListPage.goto();
    const [existing] = await supplierListPage.readRows();
    await supplierFormPage.gotoCreate();
    await supplierFormPage.fill({ ...newTestSupplier(), phone: existing.Phone });

    await supplierFormPage.save();

    await expect(supplierFormPage.error('phone')).toHaveText(supplierText.duplicate.phone);
    await expect(page).toHaveURL(supplierUrls.create);
  });
});
