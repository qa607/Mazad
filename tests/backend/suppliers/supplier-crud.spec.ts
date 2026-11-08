import { expect, test } from '@fixtures/supplier.fixture';
import { shownOption } from '@utils/widgets';
import {
  type SupplierData,
  newTestSupplier,
  supplierText,
  supplierUrls,
} from '@test-data/supplier.data';

// Signed in as Dev Root: no trace or video (they would capture the account header).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

/**
 * Creates one test supplier, checks it everywhere it shows, then edits it. Each run creates a
 * single "QA-AUTO" supplier and only ever edits that one. The Backend has no delete action
 * for suppliers, so test suppliers stay on staging (they are marked by the QA-AUTO prefix).
 */
test.describe('Supplier create, view and edit', () => {
  // Steps build on each other, and a retry would create another test supplier.
  test.describe.configure({ mode: 'serial', retries: 0 });
  const created: SupplierData = newTestSupplier();
  const edited = {
    name: `${created.name} معدل`,
    nameEn: `${created.nameEn} Edited`,
    email: created.email.replace('@', '.edited@'),
    status: 'inactive',
  } as const;
  let supplierId = '';

  test('Create a supplier with valid data', async ({ page, supplierFormPage }) => {
    await supplierFormPage.gotoCreate();
    await supplierFormPage.fill(created);
    await supplierFormPage.setSwitch('requestMojaz', true);
    await supplierFormPage.setSwitch('canEditReservedPrice', true);
    await supplierFormPage.setSwitch('purchasingRequest', true);

    await supplierFormPage.save();

    await expect(supplierFormPage.resultPopup).toContainText(supplierText.createdMessage);
    await expect(supplierFormPage.loadingOverlay).toBeHidden();
    await supplierFormPage.confirmResult();
    await expect(page).toHaveURL(supplierUrls.anyUpdate);
    supplierId = supplierFormPage.currentSupplierId() ?? '';
    expect(supplierId).toMatch(/^\d+$/);
  });

  test('After saving, the edit form opens with every tab available', async ({
    page,
    supplierFormPage,
  }) => {
    await supplierFormPage.gotoUpdate(supplierId);

    await expect(page).toHaveTitle(`${supplierText.updateTitlePrefix}${created.nameEn}`);
    for (const name of [
      'Basic Information',
      'Auction Info',
      'Inspection Locations',
      'Email Templates',
      'Commission',
    ]) {
      await expect(supplierFormPage.tab(name)).not.toHaveClass(/disabled/);
    }
    await expect(supplierFormPage.input('nameEn')).toHaveValue(created.nameEn);
    await expect(supplierFormPage.input('name')).toHaveValue(created.name);
    await expect(supplierFormPage.input('email')).toHaveValue(created.email);
    await expect(supplierFormPage.input('crNumber')).toHaveValue(created.crNumber);
    await expect(supplierFormPage.input('taxId')).toHaveValue(created.taxId);
    await expect(supplierFormPage.selectedStatus()).toHaveText(shownOption(created.status));
    await expect(supplierFormPage.switchInput('requestMojaz')).toBeChecked();
    await expect(supplierFormPage.switchInput('canEditReservedPrice')).toBeChecked();
    await expect(supplierFormPage.switchInput('purchasingRequest')).toBeChecked();
    // Password fields are never pre-filled.
    await expect(supplierFormPage.input('newPassword')).toBeEmpty();
  });

  test('New supplier appears first in the list with the saved data', async ({
    supplierListPage,
  }) => {
    await supplierListPage.goto();

    const [first] = await supplierListPage.readRows();

    expect(first.ID).toBe(supplierId);
    expect(first['English Name']).toBe(created.nameEn);
    expect(first.Status).toBe(created.status);
    expect(first.Email).toBe(created.email);
    expect(first.Phone).toBe(created.phone);
    expect(first['Request Mojaz']).toBe('Yes');
    expect(first['Buyer Commission']).toBe('No');
    expect(first['Vehicles Count']).toBe('0');
    expect(first['Supplier Name En']).not.toBe('');
  });

  test('Supplier names are filled from the CR record, not from the form', async ({
    supplierViewPage,
  }) => {
    await supplierViewPage.goto(supplierId);

    await expect(supplierViewPage.value('Supplier Name')).not.toHaveValue('');
    await expect(supplierViewPage.value('Supplier Name')).not.toHaveValue(created.name);
    // Accepted: Supplier Name En holds the same Arabic name as Supplier Name.
    const supplierName = await supplierViewPage.value('Supplier Name').inputValue();
    await expect(supplierViewPage.value('Supplier Name En')).toHaveValue(supplierName);
  });

  test('Searching by the new phone finds only the new supplier', async ({ supplierListPage }) => {
    await supplierListPage.goto();

    await supplierListPage.search({ phone: created.phone });

    await expect(supplierListPage.rows).toHaveCount(1);
    await expect(supplierListPage.rowById(supplierId)).toBeVisible();
  });

  test('Details page shows the saved data', async ({ page, supplierViewPage }) => {
    await supplierViewPage.goto(supplierId);

    await expect(page).toHaveTitle(created.nameEn);
    const expected: Record<string, string> = {
      'English Name': created.nameEn,
      'Arabic Name': created.name,
      Status: created.status,
      Phone: created.phone,
      Email: created.email,
      'Cr Number': created.crNumber,
      'Tax ID': created.taxId,
      'Request Mojaz': 'Yes',
      'Can Edit Reserved Price': 'Yes',
      'Used cars purchasing request (CASH)': 'Yes',
      'Insurance Supplier': 'No',
      'Postpone Invoice': 'No',
      Insurance: 'Yes',
    };
    for (const [label, value] of Object.entries(expected)) {
      await expect(supplierViewPage.value(label), label).toHaveValue(value);
    }
    await expect(supplierViewPage.value('Created At')).toHaveValue(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });

  test('Update button on the details page opens the edit form', async ({
    page,
    supplierViewPage,
  }) => {
    await supplierViewPage.goto(supplierId);

    await supplierViewPage.updateButton.click();

    await expect(page).toHaveURL(supplierUrls.update(supplierId));
  });

  test('Clearing a required field on edit is rejected and nothing is saved', async ({
    page,
    supplierFormPage,
    supplierViewPage,
  }) => {
    await supplierFormPage.gotoUpdate(supplierId);
    await supplierFormPage.input('nameEn').fill('');

    await supplierFormPage.save();

    await expect(supplierFormPage.error('nameEn')).toHaveText(supplierText.required.nameEn);
    await expect(supplierFormPage.resultPopup).toBeHidden();
    await supplierViewPage.goto(supplierId);
    await expect(page).toHaveTitle(created.nameEn);
  });

  test('Edit names, email, status and a switch', async ({ supplierFormPage }) => {
    await supplierFormPage.gotoUpdate(supplierId);
    await supplierFormPage.fill(edited);
    await supplierFormPage.setSwitch('requestMojaz', false);

    await supplierFormPage.save();

    await expect(supplierFormPage.resultPopup).toBeVisible();
    await expect(supplierFormPage.resultPopup.locator('.swal2-success')).toBeVisible();
    await expect(supplierFormPage.loadingOverlay).toBeHidden();
  });

  test('Edited data shows on the details page', async ({ page, supplierViewPage }) => {
    await supplierViewPage.goto(supplierId);

    await expect(page).toHaveTitle(edited.nameEn);
    await expect(supplierViewPage.value('English Name')).toHaveValue(edited.nameEn);
    await expect(supplierViewPage.value('Arabic Name')).toHaveValue(edited.name);
    await expect(supplierViewPage.value('Email')).toHaveValue(edited.email);
    await expect(supplierViewPage.value('Status')).toHaveValue(edited.status);
    await expect(supplierViewPage.value('Request Mojaz')).toHaveValue('No');
    // Fields that were not edited keep their values.
    await expect(supplierViewPage.value('Phone')).toHaveValue(created.phone);
    await expect(supplierViewPage.value('Cr Number')).toHaveValue(created.crNumber);
    await expect(supplierViewPage.value('Can Edit Reserved Price')).toHaveValue('Yes');
    const createdAt = await supplierViewPage.value('Created At').inputValue();
    const updatedAt = await supplierViewPage.value('Updated At').inputValue();
    expect(updatedAt >= createdAt).toBe(true);
  });

  test('Edited data shows in the list and the filters find it', async ({ supplierListPage }) => {
    await supplierListPage.goto();
    await supplierListPage.search({ phone: created.phone, status: 'inactive' });

    const rows = await supplierListPage.readRows();

    expect(rows).toHaveLength(1);
    expect(rows[0].ID).toBe(supplierId);
    expect(rows[0]['English Name']).toBe(edited.nameEn);
    expect(rows[0].Email).toBe(edited.email);
    expect(rows[0].Status).toBe('inactive');
    expect(rows[0]['Request Mojaz']).toBe('No');
  });

  test('Old values no longer match the edited supplier', async ({ supplierListPage }) => {
    await supplierListPage.goto();

    await supplierListPage.search({ phone: created.phone, status: 'active' });

    await expect(supplierListPage.emptyState).toHaveText(supplierText.emptyState);
  });

  test('Edited data is still there after reloading the edit form', async ({
    page,
    supplierFormPage,
  }) => {
    await supplierFormPage.gotoUpdate(supplierId);
    await page.reload();

    await expect(supplierFormPage.input('nameEn')).toHaveValue(edited.nameEn);
    await expect(supplierFormPage.input('email')).toHaveValue(edited.email);
    await expect(supplierFormPage.selectedStatus()).toHaveText(shownOption(edited.status));
    await expect(supplierFormPage.switchInput('requestMojaz')).not.toBeChecked();
  });

  test('Edit form breadcrumb returns to the list', async ({
    page,
    supplierFormPage,
    supplierListPage,
  }) => {
    await supplierFormPage.gotoUpdate(supplierId);

    await supplierFormPage.breadcrumbList.click();

    await expect(page).toHaveURL(supplierUrls.list);
    await expect(supplierListPage.rowById(supplierId)).toBeVisible();
  });
});
