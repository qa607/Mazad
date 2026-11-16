import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { newQaAutoCompany, qaAutoMarker } from '@test-data/backend-delivery.data';

// The ONE authorized creation of a Delivery Company, as Dev Root, on staging only. It is serial,
// never retried and submits the form at most once. If a QA-AUTO company already exists the test
// stops and reports it instead of creating another. The record is NOT updated, unpublished or
// deleted afterwards: it stays in staging and its ID and status are attached to the report.
test.use(devRootSession);
test.describe.configure({ mode: 'serial', retries: 0 });

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
  'Backend - Delivery Companies - create',
  { tag: ['@regression', '@crud', '@mutates'] },
  () => {
    test(
      'DC-CRT-01 Creating one QA-AUTO company saves it and shows it in the list and on its details page',
      { tag: ['@functional'] },
      async (
        { page, deliveryCompanyListPage, deliveryCompanyFormPage: form, deliveryCompanyViewPage },
        testInfo,
      ) => {
        // 1. Pre-check (GET only): do not create a second QA-AUTO company.
        await deliveryCompanyListPage.gotoWithFilters({ name_en: qaAutoMarker });
        const existing = await deliveryCompanyListPage.readRows();
        if (existing.length > 0) {
          testInfo.annotations.push({
            type: 'skipped',
            description: `A ${qaAutoMarker} company already exists (ID ${existing.map((r) => r.id).join(', ')}); none was created.`,
          });
          test.skip(true, 'A QA-AUTO delivery company already exists; nothing was created.');
        }

        const company = newQaAutoCompany();

        // 2. Fill the form and make sure it is valid before the single submit.
        await form.gotoCreate();
        await form.fill(company);
        await form.input('phone').blur();
        await expect(form.visibleErrors).toHaveCount(0);

        // 3. Submit once. The result is judged from the page; on any doubt it is checked by GET, never resubmitted.
        await form.save();
        // Saving returns to the list with a success message (it does not open the details page).
        await expect(page).toHaveURL(/\/delivery-company\/index$/, { timeout: 30_000 });
        await expect(deliveryCompanyListPage.successAlert).toHaveText(
          /Delivery Company has been created/,
        );
        await deliveryCompanyListPage.gotoWithFilters({ name_en: company.englishName });
        const created = await deliveryCompanyListPage.readRows();
        expect(created, 'exactly one company with the new name').toHaveLength(1);
        const id = created[0].id;
        expect(id).toMatch(/^\d+$/);
        await deliveryCompanyViewPage.goto(id);
        testInfo.annotations.push({ type: 'created-company-id', description: id });
        await testInfo.attach('created-company', {
          body: `Delivery company ID ${id} (${company.englishName}), Published status as saved by default. Left in staging.`,
          contentType: 'text/plain',
        });

        // 4. The details page shows what was typed.
        const details = await deliveryCompanyViewPage.details();
        expect(details.ID).toBe(id);
        expect(details['Arabic Name']).toBe(company.arabicName);
        expect(details['English Name']).toBe(company.englishName);
        expect(details.Email).toBe(company.email);
        expect(details['Phone Number']).toBe(company.phone);
        expect(['Published', 'Unpublished']).toContain(details.Status);

        // 5. It is in the list, and still there after a reload.
        await deliveryCompanyListPage.gotoWithFilters({ name_en: company.englishName });
        let rows = await deliveryCompanyListPage.readRows();
        expect(rows.map((r) => r.id)).toEqual([id]);
        expect(rows[0].arabicName).toBe(company.arabicName);
        expect(rows[0].status).toBe(details.Status);

        await page.reload();
        rows = await deliveryCompanyListPage.readRows();
        expect(rows.map((r) => r.id)).toEqual([id]);
        await deliveryCompanyViewPage.goto(id);
        expect((await deliveryCompanyViewPage.details()).Email).toBe(company.email);
      },
    );

    test(
      'DC-CRT-02 The name filters find the new company by its QA-AUTO marker, in Arabic and English',
      { tag: ['@functional'] },
      async ({ deliveryCompanyListPage }) => {
        await deliveryCompanyListPage.gotoWithFilters({ name_en: qaAutoMarker });
        const byEnglish = await deliveryCompanyListPage.readRows();
        test.skip(byEnglish.length === 0, 'No QA-AUTO company exists (creation was not run).');

        await deliveryCompanyListPage.gotoWithFilters({ name: qaAutoMarker });
        const byArabic = await deliveryCompanyListPage.readRows();

        expect(byArabic.map((r) => r.id)).toEqual(byEnglish.map((r) => r.id));
      },
    );
  },
);
