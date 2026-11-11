import fs from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { type BackendPages, devRootSession, expect, test } from '@fixtures/test.fixture';
import { parseCsv } from '@utils/csv';
import {
  invalidCompanyCases,
  newTestCompany,
  supplierCompanyText as text,
  supplierCompanyUrls,
  testSupplierName,
  typingLimits,
} from '@test-data/supplier-company.data';

/**
 * Mazad Backend > Companies: create form validation, then one QA-AUTO test company with two
 * warehouses created under the QA-AUTO test supplier, checked everywhere it shows, edited and
 * deleted. The last test deletes the company; afterAll deletes any QA-AUTO company of this run
 * left behind by a failed step.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

/** Deletes, in a fresh signed-in tab, every company with this English name. */
async function deleteCompaniesNamed(
  browser: Browser,
  pagesOn: (tab: Page) => BackendPages,
  nameEn: string,
): Promise<void> {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: DEV_ROOT_SESSION_FILE,
  });
  const { supplierCompanyListPage: list } = pagesOn(await context.newPage());
  await list.open({ nameEn });
  for (const row of await list.readRows()) {
    if (row.nameEn === nameEn && row.deletable) await list.deleteCompany(row.id);
  }
  await context.close();
}

test.describe('Supplier Company - create form validation', { tag: ['@regression'] }, () => {
  const valid = newTestCompany();
  const oneWarehouse = { ...valid, warehouses: [valid.warehouses[0]] };

  test.beforeEach(async ({ supplierCompanyFormPage: form }) => {
    await form.gotoCreate();
  });

  // A refusal that stops working would save a company; remove any such record.
  test.afterAll(async ({ browser, pagesOn }) => {
    await deleteCompaniesNamed(browser, pagesOn, valid.nameEn);
  });

  test(
    'Empty form shows a required error for each mandatory field',
    { tag: ['@negative'] },
    async ({ page, supplierCompanyFormPage: form }) => {
      await expect(form.pageHeading).toHaveText(text.createTitle);
      await form.save();

      await expect(page).toHaveURL(supplierCompanyUrls.create);
      const errors = await form.errorTexts();
      for (const error of Object.values(text.required)) expect(errors).toContain(error);
      // Email and the company phone are optional.
      await expect(form.fieldError('email')).toHaveText('');
      await expect(form.fieldError('phone')).toHaveText('');
    },
  );

  for (const { name, data, error } of invalidCompanyCases(valid)) {
    test(
      `Refuses ${name}`,
      { tag: ['@negative'] },
      async ({ page, supplierCompanyFormPage: form }) => {
        await form.fill({ ...oneWarehouse, ...data });
        await form.save();

        await expect(page).toHaveURL(supplierCompanyUrls.create);
        expect(await form.errorTexts()).toContain(error);
      },
    );
  }

  for (const { name, field, typed, kept } of typingLimits) {
    test(name, { tag: ['@negative'] }, async ({ supplierCompanyFormPage: form }) => {
      await form.typeInto(field, typed);
      await expect(form.input(field)).toHaveValue(kept);
    });
  }

  test(
    'Keeps the entered values after a validation error',
    { tag: ['@negative'] },
    async ({ supplierCompanyFormPage: form }) => {
      await form.fill({ ...oneWarehouse, email: 'bad' });
      await form.save();

      await expect(form.fieldError('email')).toHaveText(text.invalid.email);
      await expect(form.input('name')).toHaveValue(valid.name);
      await expect(form.input('nameEn')).toHaveValue(valid.nameEn);
      await expect(form.input('supplier')).toHaveValue(valid.supplierId);
      await expect(form.input('crNumber')).toHaveValue(valid.crNumber);
      await expect(form.warehouseInput(0, 'nameEn')).toHaveValue(valid.warehouses[0].nameEn);
    },
  );

  test(
    'Add warehouse adds a second set of fields, which are required too',
    { tag: ['@functional', '@negative'] },
    async ({ page, supplierCompanyFormPage: form }) => {
      await form.addWarehouse();
      await form.fill(oneWarehouse);
      await form.save();

      await expect(page).toHaveURL(supplierCompanyUrls.create);
      await expect(form.warehouseError(1, 'name')).toHaveText(text.required.warehouseName);
      await expect(form.warehouseError(1, 'nameEn')).toHaveText(text.required.warehouseNameEn);
      await expect(form.warehouseError(1, 'locationLink')).toHaveText(text.required.locationLink);
      await expect(form.warehouseError(1, 'phone')).toHaveText(text.required.warehousePhone);
    },
  );

  test(
    'Cancel returns to the list without saving',
    { tag: ['@functional'] },
    async ({ page, supplierCompanyFormPage: form, supplierCompanyListPage: list }) => {
      await form.fill(oneWarehouse);
      await form.cancel();

      await expect(page).toHaveURL(supplierCompanyUrls.list);
      await list.open({ nameEn: valid.nameEn });
      await expect(list.emptyMessage).toHaveText(text.emptyState);
    },
  );
});

test.describe(
  'Supplier Company - create, view, edit and delete',
  { tag: ['@regression', '@crud', '@mutates'] },
  () => {
    // Steps build on each other, and a retry would create another test company.
    test.describe.configure({ mode: 'serial', retries: 0 });
    const company = newTestCompany();
    const edited = {
      name: `${company.name} معدلة`,
      nameEn: `${company.nameEn} Edited`,
      email: company.email.replace('@', '.edited@'),
      workingHoursEn: '9 AM - 6 PM',
      warehouseNameEn: 'Riyadh Main Warehouse',
    };
    let companyId = '';

    test.afterAll(async ({ browser, pagesOn }) => {
      await deleteCompaniesNamed(browser, pagesOn, company.nameEn);
      await deleteCompaniesNamed(browser, pagesOn, edited.nameEn);
    });

    test(
      'Creates a company with two warehouses',
      { tag: ['@functional'] },
      async ({ supplierCompanyFormPage: form, supplierCompanyListPage: list }) => {
        await form.gotoCreate();
        await form.fill(company);
        await form.save();
        await expect(form.flashMessage).toContainText(text.createdMessage);

        await list.open({ nameEn: company.nameEn });
        const rows = await list.readRows();
        expect(rows).toHaveLength(1);
        companyId = rows[0].id;
      },
    );

    test(
      'The new company is first in the list with its names and supplier',
      { tag: ['@functional'] },
      async ({ supplierCompanyListPage: list }) => {
        await list.goto();
        const [first] = await list.readRows();
        expect(first).toMatchObject({
          id: companyId,
          number: '1',
          supplier: testSupplierName,
          name: company.name,
          nameEn: company.nameEn,
          deletable: true,
        });
      },
    );

    test(
      'View page shows every saved value and both warehouses, also after a refresh',
      { tag: ['@functional'] },
      async ({ page, supplierCompanyFormPage: form }) => {
        await form.gotoView(companyId);
        await expect(form.pageHeading).toHaveText(company.nameEn);

        for (const pass of ['first load', 'after refresh']) {
          expect(await form.viewTexts(), pass).toEqual([
            company.name,
            company.nameEn,
            testSupplierName,
            company.email,
            company.phone,
            company.crNumber,
            company.taxNumber,
            company.workingHours,
            company.workingHoursEn,
          ]);
          const warehouses = await form.viewWarehouseText();
          for (const warehouse of company.warehouses) {
            for (const value of [warehouse.name, warehouse.nameEn, warehouse.phone]) {
              expect(warehouses, pass).toContain(value);
            }
          }
          await page.reload();
        }
      },
    );

    test(
      'Each filter finds the new company',
      { tag: ['@functional'] },
      async ({ supplierCompanyListPage: list }) => {
        for (const filters of [
          { supplierId: company.supplierId },
          { name: company.name },
          { nameEn: company.nameEn },
          { nameEn: company.nameEn.slice(company.nameEn.indexOf('Test')).toLowerCase() },
        ]) {
          await list.goto();
          await list.searchBy(filters);
          expect(await list.rowIds(), JSON.stringify(filters)).toContain(companyId);
        }
      },
    );

    test(
      'CSV export of the new company holds its saved values',
      { tag: ['@functional'] },
      async ({ supplierCompanyListPage: list }) => {
        await list.open({ nameEn: company.nameEn });
        const download = await list.exportAs('CSV');
        const [header, ...data] = parseCsv(fs.readFileSync(await download.path(), 'utf8'));

        expect(data).toHaveLength(1);
        const value = (column: string) => data[0][header.indexOf(column)];
        expect(value('ID')).toBe(companyId);
        expect(value('Company Name En')).toBe(company.nameEn);
        expect(value('Email')).toBe(company.email);
        expect(value('Commercial Registration Number')).toBe(company.crNumber);
        expect(value('Tax Number')).toBe(company.taxNumber);
      },
    );

    test(
      'Edit form shows the saved values, with the supplier locked',
      { tag: ['@functional'] },
      async ({ supplierCompanyFormPage: form }) => {
        await form.gotoUpdate(companyId);

        await expect(form.pageHeading).toHaveText(`${text.updateTitlePrefix}${company.nameEn}`);
        await expect(form.input('name')).toHaveValue(company.name);
        await expect(form.input('nameEn')).toHaveValue(company.nameEn);
        await expect(form.input('supplier')).toHaveValue(company.supplierId);
        await expect(form.input('supplier')).toBeDisabled();
        await expect(form.input('email')).toHaveValue(company.email);
        await expect(form.input('crNumber')).toHaveValue(company.crNumber);
        await expect(form.input('taxNumber')).toHaveValue(company.taxNumber);
        for (const [index, warehouse] of company.warehouses.entries()) {
          await expect(form.warehouseInput(index, 'nameEn')).toHaveValue(warehouse.nameEn);
          await expect(form.warehouseInput(index, 'locationLink')).toHaveValue(
            warehouse.locationLink,
          );
        }
      },
    );

    test(
      'Edit refuses an empty required field and an invalid email, changing nothing',
      { tag: ['@negative'] },
      async ({ page, supplierCompanyFormPage: form, supplierCompanyListPage: list }) => {
        await form.gotoUpdate(companyId);
        await form.input('nameEn').fill('');
        await form.save();
        await expect(page).toHaveURL(supplierCompanyUrls.update);
        await expect(form.fieldError('nameEn')).toHaveText(text.required.nameEn);

        await form.gotoUpdate(companyId);
        await form.input('email').fill('bad@');
        await form.save();
        await expect(page).toHaveURL(supplierCompanyUrls.update);
        await expect(form.fieldError('email')).toHaveText(text.invalid.email);

        await list.open({ nameEn: company.nameEn });
        expect(await list.rowIds()).toEqual([companyId]);
      },
    );

    test(
      'Saves edited names, email, working hours and a warehouse',
      { tag: ['@functional'] },
      async ({ page, supplierCompanyFormPage: form }) => {
        await form.gotoUpdate(companyId);
        await form.fill({
          name: edited.name,
          nameEn: edited.nameEn,
          email: edited.email,
          workingHoursEn: edited.workingHoursEn,
        });
        await form.fillWarehouse(0, { nameEn: edited.warehouseNameEn });
        await form.save();
        await expect(form.flashMessage).toContainText(text.savedMessage);

        await form.gotoView(companyId);
        await page.reload();
        const values = await form.viewTexts();
        expect(values.slice(0, 2)).toEqual([edited.name, edited.nameEn]);
        expect(values).toContain(edited.email);
        expect(values).toContain(edited.workingHoursEn);
        expect(values).toContain(company.crNumber);
        expect(await form.viewWarehouseText()).toContain(edited.warehouseNameEn);
      },
    );

    test(
      'After the edit the list and filters show the new names',
      { tag: ['@functional'] },
      async ({ page, supplierCompanyListPage: list }) => {
        await list.goto();
        await page.reload();
        const row = (await list.readRows()).find((r) => r.id === companyId);
        expect(row).toMatchObject({ name: edited.name, nameEn: edited.nameEn });

        await list.open({ nameEn: edited.nameEn });
        expect(await list.rowIds()).toEqual([companyId]);
        await list.open({ name: edited.name });
        expect(await list.rowIds()).toEqual([companyId]);
      },
    );

    test(
      'Delete asks for confirmation, and Cancel keeps the company',
      { tag: ['@functional'] },
      async ({ page, supplierCompanyListPage: list }) => {
        await list.open({ nameEn: edited.nameEn });
        await list.clickDelete(companyId);
        await expect(list.confirmDialog.message).toHaveText(text.deleteConfirmation);

        await list.confirmDialog.cancel();
        await expect(list.confirmDialog.dialog).toBeHidden();
        await page.reload();
        expect(await list.rowIds()).toEqual([companyId]);
      },
    );

    test(
      'Delete with Ok removes the company from the list and every filter',
      { tag: ['@functional'] },
      async ({ supplierCompanyListPage: list }) => {
        await list.open({ nameEn: edited.nameEn });
        await list.deleteCompany(companyId);
        await expect(list.flashMessage).toContainText(text.deletedMessage);

        for (const filters of [
          { nameEn: edited.nameEn },
          { name: edited.name },
          { supplierId: company.supplierId },
        ]) {
          await list.open(filters);
          expect(await list.rowIds(), JSON.stringify(filters)).not.toContain(companyId);
        }
        await list.goto();
        expect(await list.rowIds()).not.toContain(companyId);
      },
    );
  },
);

test.describe('Supplier Company - delete protection', { tag: ['@regression'] }, () => {
  test(
    'A company linked to auctions cannot be deleted and stays in the list',
    { tag: ['@negative'] },
    async ({ page, supplierCompanyListPage: list }) => {
      await list.goto();
      const linked = (await list.readRows()).find((row) => !row.deletable);
      test.skip(!linked, 'No company on the first page is linked to auctions.');

      await list.clickBlockedDelete(linked!.id);
      await expect(list.resultAlert).toContainText(text.linkedToAuctions);
      await expect(list.confirmDialog.dialog).toBeHidden();
      await list.closeResultAlert();

      await page.reload();
      expect(await list.rowIds()).toContain(linked!.id);
    },
  );
});
