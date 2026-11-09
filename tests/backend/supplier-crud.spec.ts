import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { shownOption } from '@utils/widgets';
import {
  type SupplierData,
  createdSupplierSwitches,
  editedSupplier,
  expectedSupplierDetails,
  newTestSupplier,
  supplierDetailLabels,
  supplierFormats,
  supplierTabs,
  supplierText,
  supplierUrls,
} from '@test-data/supplier.data';

// Pages open signed in as Dev Root; see devRootSession for what is recorded.
test.use(devRootSession);

/**
 * Creates one test supplier, checks it everywhere it shows, then edits it. Each run creates a
 * single "QA-AUTO" supplier and only ever edits that one. The Backend has no delete action
 * for suppliers, so test suppliers stay on staging (they are marked by the QA-AUTO prefix).
 */
test.describe(
  'Supplier create, view and edit',
  { tag: ['@regression', '@crud', '@mutates'] },
  () => {
    // Steps build on each other, and a retry would create another test supplier.
    test.describe.configure({ mode: 'serial', retries: 0 });
    const created: SupplierData = newTestSupplier();
    const edited = editedSupplier(created);
    let supplierId = '';

    test(
      'Create a supplier with valid data',
      { tag: ['@functional'] },
      async ({ page, supplierFormPage }) => {
        await supplierFormPage.gotoCreate();
        await supplierFormPage.fillForm(created);
        for (const name of createdSupplierSwitches) await supplierFormPage.setSwitch(name, true);

        await supplierFormPage.save();

        await expect(supplierFormPage.resultPopup).toContainText(supplierText.createdMessage);
        await expect(supplierFormPage.loadingOverlay).toBeHidden();
        await supplierFormPage.confirmResult();
        await expect(page).toHaveURL(supplierUrls.anyUpdate);
        supplierId = supplierFormPage.currentSupplierId() ?? '';
        expect(supplierId).toMatch(supplierFormats.id);
      },
    );

    test(
      'After saving, the edit form opens with every tab available',
      { tag: ['@functional'] },
      async ({ page, supplierFormPage }) => {
        await supplierFormPage.gotoUpdate(supplierId);

        await expect(page).toHaveTitle(`${supplierText.updateTitlePrefix}${created.nameEn}`);
        for (const name of supplierTabs) {
          await expect(supplierFormPage.tab(name)).not.toHaveClass(/disabled/);
        }
        await expect(supplierFormPage.input('nameEn')).toHaveValue(created.nameEn);
        await expect(supplierFormPage.input('name')).toHaveValue(created.name);
        await expect(supplierFormPage.input('email')).toHaveValue(created.email);
        await expect(supplierFormPage.input('crNumber')).toHaveValue(created.crNumber);
        await expect(supplierFormPage.input('taxId')).toHaveValue(created.taxId);
        await expect(supplierFormPage.selectedStatus()).toHaveText(shownOption(created.status));
        for (const name of createdSupplierSwitches) {
          await expect(supplierFormPage.switchInput(name), name).toBeChecked();
        }
        // Password fields are never pre-filled.
        await expect(supplierFormPage.input('newPassword')).toBeEmpty();
      },
    );

    test(
      'New supplier appears first in the list with the saved data',
      { tag: ['@functional'] },
      async ({ supplierListPage }) => {
        await supplierListPage.goto();

        const [first] = await supplierListPage.readRows();

        expect(first.ID).toBe(supplierId);
        expect(first['English Name']).toBe(created.nameEn);
        expect(first.Status).toBe(created.status);
        expect(first.Email).toBe(created.email);
        expect(first.Phone).toBe(created.phone);
        expect(first['Request Mojaz']).toBe(supplierText.yes);
        expect(first['Buyer Commission']).toBe(supplierText.no);
        expect(first['Vehicles Count']).toBe('0');
        expect(first['Supplier Name En']).not.toBe('');
      },
    );

    test(
      'Supplier names are filled from the CR record, not from the form',
      { tag: ['@functional'] },
      async ({ supplierViewPage }) => {
        await supplierViewPage.goto(supplierId);

        await expect(supplierViewPage.value(supplierDetailLabels.supplierName)).not.toHaveValue('');
        await expect(supplierViewPage.value(supplierDetailLabels.supplierName)).not.toHaveValue(
          created.name,
        );
        // Accepted: Supplier Name En holds the same Arabic name as Supplier Name.
        const supplierName = await supplierViewPage
          .value(supplierDetailLabels.supplierName)
          .inputValue();
        await expect(supplierViewPage.value(supplierDetailLabels.supplierNameEn)).toHaveValue(
          supplierName,
        );
      },
    );

    test(
      'Searching by the new phone finds only the new supplier',
      { tag: ['@functional'] },
      async ({ supplierListPage }) => {
        await supplierListPage.goto();

        await supplierListPage.search({ phone: created.phone });

        await expect(supplierListPage.rows).toHaveCount(1);
        await expect(supplierListPage.row(supplierId)).toBeVisible();
      },
    );

    test(
      'Details page shows the saved data',
      { tag: ['@functional'] },
      async ({ page, supplierViewPage }) => {
        await supplierViewPage.goto(supplierId);

        await expect(page).toHaveTitle(created.nameEn);
        for (const [label, value] of Object.entries(expectedSupplierDetails(created))) {
          await expect(supplierViewPage.value(label), label).toHaveValue(value);
        }
        await expect(supplierViewPage.value(supplierDetailLabels.createdAt)).toHaveValue(
          supplierFormats.dateTime,
        );
      },
    );

    test(
      'Update button on the details page opens the edit form',
      { tag: ['@functional'] },
      async ({ page, supplierViewPage }) => {
        await supplierViewPage.goto(supplierId);

        await supplierViewPage.updateButton.click();

        await expect(page).toHaveURL(supplierUrls.update(supplierId));
      },
    );

    test(
      'Clearing a required field on edit is rejected and nothing is saved',
      { tag: ['@negative'] },
      async ({ page, supplierFormPage, supplierViewPage }) => {
        await supplierFormPage.gotoUpdate(supplierId);
        await supplierFormPage.input('nameEn').fill('');

        await supplierFormPage.save();

        await expect(supplierFormPage.error('nameEn')).toHaveText(supplierText.required.nameEn);
        await expect(supplierFormPage.resultPopup).toBeHidden();
        await supplierViewPage.goto(supplierId);
        await expect(page).toHaveTitle(created.nameEn);
      },
    );

    test(
      'Edit names, email, status and a switch',
      { tag: ['@functional'] },
      async ({ supplierFormPage }) => {
        await supplierFormPage.gotoUpdate(supplierId);
        await supplierFormPage.fillForm(edited);
        await supplierFormPage.setSwitch('requestMojaz', false);

        await supplierFormPage.save();

        await expect(supplierFormPage.resultPopup).toBeVisible();
        await expect(supplierFormPage.resultPopupSuccessIcon).toBeVisible();
        await expect(supplierFormPage.loadingOverlay).toBeHidden();
      },
    );

    test(
      'Edited data shows on the details page',
      { tag: ['@functional'] },
      async ({ page, supplierViewPage }) => {
        await supplierViewPage.goto(supplierId);

        await expect(page).toHaveTitle(edited.nameEn);
        await expect(supplierViewPage.value(supplierDetailLabels.nameEn)).toHaveValue(
          edited.nameEn,
        );
        await expect(supplierViewPage.value(supplierDetailLabels.name)).toHaveValue(edited.name);
        await expect(supplierViewPage.value(supplierDetailLabels.email)).toHaveValue(edited.email);
        await expect(supplierViewPage.value(supplierDetailLabels.status)).toHaveValue(
          edited.status,
        );
        await expect(supplierViewPage.value(supplierDetailLabels.requestMojaz)).toHaveValue(
          supplierText.no,
        );
        // Fields that were not edited keep their values.
        await expect(supplierViewPage.value(supplierDetailLabels.phone)).toHaveValue(created.phone);
        await expect(supplierViewPage.value(supplierDetailLabels.crNumber)).toHaveValue(
          created.crNumber,
        );
        await expect(supplierViewPage.value(supplierDetailLabels.canEditReservedPrice)).toHaveValue(
          supplierText.yes,
        );
        const createdAt = await supplierViewPage.value(supplierDetailLabels.createdAt).inputValue();
        const updatedAt = await supplierViewPage.value(supplierDetailLabels.updatedAt).inputValue();
        expect(updatedAt >= createdAt).toBe(true);
      },
    );

    test(
      'Edited data shows in the list and the filters find it',
      { tag: ['@functional'] },
      async ({ supplierListPage }) => {
        await supplierListPage.goto();
        await supplierListPage.search({ phone: created.phone, status: edited.status });

        const rows = await supplierListPage.readRows();

        expect(rows).toHaveLength(1);
        expect(rows[0].ID).toBe(supplierId);
        expect(rows[0]['English Name']).toBe(edited.nameEn);
        expect(rows[0].Email).toBe(edited.email);
        expect(rows[0].Status).toBe(edited.status);
        expect(rows[0]['Request Mojaz']).toBe(supplierText.no);
      },
    );

    test(
      'Old values no longer match the edited supplier',
      { tag: ['@functional'] },
      async ({ supplierListPage }) => {
        await supplierListPage.goto();

        await supplierListPage.search({ phone: created.phone, status: created.status });

        await expect(supplierListPage.emptyMessage).toHaveText(supplierText.emptyState);
      },
    );

    test(
      'Edited data is still there after reloading the edit form',
      { tag: ['@functional'] },
      async ({ page, supplierFormPage }) => {
        await supplierFormPage.gotoUpdate(supplierId);
        await page.reload();

        await expect(supplierFormPage.input('nameEn')).toHaveValue(edited.nameEn);
        await expect(supplierFormPage.input('email')).toHaveValue(edited.email);
        await expect(supplierFormPage.selectedStatus()).toHaveText(shownOption(edited.status));
        await expect(supplierFormPage.switchInput('requestMojaz')).not.toBeChecked();
      },
    );

    test(
      'Edit form breadcrumb returns to the list',
      { tag: ['@functional'] },
      async ({ page, supplierFormPage, supplierListPage }) => {
        await supplierFormPage.gotoUpdate(supplierId);

        await supplierFormPage.breadcrumbList.click();

        await expect(page).toHaveURL(supplierUrls.list);
        await expect(supplierListPage.row(supplierId)).toBeVisible();
      },
    );
  },
);
