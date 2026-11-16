import fs from 'node:fs';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  companyData,
  companyText,
  existingCompanies,
  qaAutoMarker,
} from '@test-data/backend-delivery.data';
import { arabicLetters } from '@test-data/backend-failed.data';
import { parseCsv } from '@utils/csv';

// Delivery Companies → Companies: list, controls, sorting, filters and export, read-only, as Dev
// Root. The three existing companies are only read: nothing here uses Update, Delete or the status
// dropdown, and no company is created, changed or deleted.
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

test.describe('Backend - Delivery Companies - list', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ deliveryCompanyListPage }) => {
    await deliveryCompanyListPage.goto();
  });

  test(
    'DC-LIST-01 Page shows the title, breadcrumb, sidebar link, columns, filters and Create button',
    { tag: ['@smoke', '@functional'] },
    async ({ page, deliveryCompanyListPage }) => {
      await expect(page).toHaveTitle(companyText.listTitle);
      await expect(deliveryCompanyListPage.pageHeading).toHaveText(companyText.listTitle);
      await expect(deliveryCompanyListPage.breadcrumbCurrent).toHaveText(companyText.listTitle);
      await expect(deliveryCompanyListPage.sidebarLink).toHaveCount(1);
      await expect(deliveryCompanyListPage.columnHeaders).toHaveText([
        ...companyText.columnHeaders,
      ]);
      await expect(deliveryCompanyListPage.arabicNameInput).toBeEditable();
      await expect(deliveryCompanyListPage.englishNameInput).toBeEditable();
      await expect(deliveryCompanyListPage.publishedSelect).toBeVisible();
      await expect(deliveryCompanyListPage.searchButton).toBeEnabled();
      await expect(deliveryCompanyListPage.resetButton).toBeVisible();
      await expect(deliveryCompanyListPage.createButton).toBeVisible();
      await expect(deliveryCompanyListPage.createButton).toHaveText(
        new RegExp(companyText.createButton),
      );
    },
  );

  test(
    'DC-LIST-02 The three existing companies show their IDs, Arabic and English names and Published status',
    { tag: ['@smoke', '@functional'] },
    async ({ deliveryCompanyListPage }) => {
      // QA-AUTO companies created by the automation are not part of the original three.
      const rows = (await deliveryCompanyListPage.readRows()).filter(
        (row) => !row.englishName.startsWith(qaAutoMarker),
      );

      expect(rows).toHaveLength(existingCompanies.length);
      // The default order is newest ID first.
      expect(rows.map((row) => row.id)).toEqual([...existingCompanies].reverse().map((c) => c.id));
      for (const company of existingCompanies) {
        const row = rows.find((r) => r.id === company.id);
        expect(row, `company ${company.id} is listed`).toBeDefined();
        expect(row?.arabicName).toBe(company.arabicName);
        expect(row?.englishName).toBe(company.englishName);
        expect(row?.status).toBe(company.status);
      }
      expect(rows.some((row) => arabicLetters.test(row.arabicName))).toBe(true);
    },
  );

  test(
    'DC-LIST-03 Every row has View and Update links and a status dropdown (nothing is changed)',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }) => {
      const count = await deliveryCompanyListPage.rows.count();

      await expect(deliveryCompanyListPage.rows.locator('a[title="View"]')).toHaveCount(count);
      await expect(deliveryCompanyListPage.rows.locator('a[title="Update"]')).toHaveCount(count);
      await expect(deliveryCompanyListPage.statusDropdowns).toHaveCount(count);
    },
  );

  test(
    'DC-LIST-04 ID sorts oldest first, then newest first',
    { tag: ['@functional'] },
    async ({ page, deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.sortById();
      await expect(page).toHaveURL(/[?&]sort=id(&|$)/);
      const ascending = (await deliveryCompanyListPage.readRows()).map((row) => Number(row.id));
      expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

      await deliveryCompanyListPage.sortById();
      await expect(page).toHaveURL(/[?&]sort=-id(&|$)/);
      const descending = (await deliveryCompanyListPage.readRows()).map((row) => Number(row.id));
      expect(descending).toEqual([...descending].sort((a, b) => b - a));
    },
  );

  test(
    'DC-LIST-05 A search with no match shows "No results found."',
    { tag: ['@functional', '@negative'] },
    async ({ deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.searchByEnglishName(companyData.unknownEnglishName);

      await expect(deliveryCompanyListPage.emptyMessage).toHaveText(companyText.noResults);
      await expect(deliveryCompanyListPage.rows).toHaveCount(0);
      await expect(deliveryCompanyListPage.summary).toHaveCount(0);
    },
  );

  test(
    'DC-LIST-06 The CSV export has the eight columns and one record per company, matching the list',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }, testInfo) => {
      const rows = await deliveryCompanyListPage.readRows();

      const download = await deliveryCompanyListPage.exportAsCsv();
      expect(download.suggestedFilename()).toMatch(companyText.exportFileName);
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const table = parseCsv(fs.readFileSync(file, 'utf8'));

      expect(table[0]).toEqual([...companyText.exportColumns]);
      expect(table.length - 1).toBe(rows.length);
      const exported = table
        .slice(1)
        .map((r) => ({ id: r[0], arabic: r[1], english: r[2], status: r[5] }));
      for (const row of rows) {
        expect(exported).toContainEqual({
          id: row.id,
          arabic: row.arabicName,
          english: row.englishName,
          status: row.status,
        });
      }
    },
  );
});

test.describe('Backend - Delivery Companies - filters', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ deliveryCompanyListPage }) => {
    await deliveryCompanyListPage.goto();
  });

  test(
    'DC-FLT-01 Arabic Name: part of a name finds the companies, an unknown name finds none',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.searchByArabicName(companyData.commonArabicPart);
      await expect(deliveryCompanyListPage.rows).toHaveCount(existingCompanies.length);

      const full = existingCompanies[2].arabicName;
      await deliveryCompanyListPage.searchByArabicName(full);
      await expect(deliveryCompanyListPage.rows).toHaveCount(1);
      expect((await deliveryCompanyListPage.readRows())[0].arabicName).toBe(full);

      await deliveryCompanyListPage.searchByArabicName(companyData.unknownArabicName);
      await expect(deliveryCompanyListPage.emptyMessage).toHaveText(companyText.noResults);
    },
  );

  test(
    'DC-FLT-02 English Name: full, partial and different-case text find the company',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }) => {
      const target = existingCompanies[1];

      await deliveryCompanyListPage.searchByEnglishName(target.englishName);
      expect((await deliveryCompanyListPage.readRows()).map((row) => row.id)).toEqual([target.id]);

      await deliveryCompanyListPage.searchByEnglishName('riyadh');
      expect((await deliveryCompanyListPage.readRows()).map((row) => row.id)).toEqual([target.id]);

      await deliveryCompanyListPage.searchByEnglishName(target.englishName.toUpperCase());
      expect((await deliveryCompanyListPage.readRows()).map((row) => row.id)).toEqual([target.id]);

      await deliveryCompanyListPage.searchByEnglishName(companyData.commonEnglishPart);
      await expect(deliveryCompanyListPage.rows).toHaveCount(existingCompanies.length);
    },
  );

  test(
    'DC-FLT-03 Published: All and Published show the companies, Unpublished shows none while all are published',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.filterByPublished('Published');
      const published = await deliveryCompanyListPage.readRows();
      expect(published.length).toBeGreaterThan(0);
      for (const row of published) expect(row.status).toBe('Published');

      await deliveryCompanyListPage.gotoWithFilters({ is_published: '0' });
      const unpublished = await deliveryCompanyListPage.readRows();
      for (const row of unpublished) expect(row.status).toBe('Unpublished');
      await deliveryCompanyListPage.goto();
      await deliveryCompanyListPage.filterByPublished('All');
      const all = await deliveryCompanyListPage.readRows();
      expect(
        published.length + unpublished.length,
        'every company is Published or Unpublished',
      ).toBe(all.length);
      expect(all.length).toBeGreaterThanOrEqual(existingCompanies.length);
    },
  );

  test(
    'DC-FLT-04 Combined: name and status together narrow the list, and a mismatching pair finds none',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.gotoWithFilters({
        name_en: companyData.commonEnglishPart,
        is_published: '1',
      });
      await expect(deliveryCompanyListPage.rows).toHaveCount(existingCompanies.length);

      await deliveryCompanyListPage.gotoWithFilters({
        name_en: existingCompanies[0].englishName,
        name: existingCompanies[2].arabicName,
      });
      await expect(deliveryCompanyListPage.emptyMessage).toHaveText(companyText.noResults);
    },
  );

  test(
    'DC-FLT-05 Reset clears the filters and shows every company again',
    { tag: ['@functional'] },
    async ({ page, deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.searchByEnglishName(companyData.unknownEnglishName);
      await expect(deliveryCompanyListPage.emptyMessage).toBeVisible();

      await deliveryCompanyListPage.reset();

      await expect(page).toHaveURL(/\/delivery-company\/index$/);
      await expect(deliveryCompanyListPage.englishNameInput).toHaveValue('');
      await expect(deliveryCompanyListPage.rows.first()).toBeVisible();
      expect(await deliveryCompanyListPage.rows.count()).toBeGreaterThanOrEqual(
        existingCompanies.length,
      );
    },
  );

  test(
    'DC-FLT-06 Clearing one filter and searching again widens the result',
    { tag: ['@functional'] },
    async ({ deliveryCompanyListPage }) => {
      await deliveryCompanyListPage.arabicNameInput.fill(existingCompanies[0].arabicName);
      await deliveryCompanyListPage.englishNameInput.fill(companyData.unknownEnglishName);
      await deliveryCompanyListPage.search();
      await expect(deliveryCompanyListPage.emptyMessage).toBeVisible();

      await deliveryCompanyListPage.englishNameInput.fill('');
      await deliveryCompanyListPage.search();

      await expect(deliveryCompanyListPage.rows).toHaveCount(1);
    },
  );
});
