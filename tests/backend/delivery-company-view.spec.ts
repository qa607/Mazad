import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { existingCompanies } from '@test-data/backend-delivery.data';

// Delivery Company details page (View), read-only, for the three existing companies, compared
// with the list. Email and phone are contact details of real companies: only their format is
// checked, and they are never logged or stored. Update and Delete are never used.
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

test.describe('Backend - Delivery Companies - view page', { tag: ['@regression'] }, () => {
  for (const company of existingCompanies) {
    test(
      `DC-VIEW-01 Company ${company.id} (${company.englishName}) shows its saved details, matching the list`,
      { tag: ['@smoke', '@functional'] },
      async ({ page, deliveryCompanyViewPage, deliveryCompanyListPage }) => {
        await deliveryCompanyViewPage.goto(company.id);

        await expect(page).toHaveURL(new RegExp(`/delivery-company/view\\?id=${company.id}$`));
        await expect(page).toHaveTitle(company.englishName);
        const details = await deliveryCompanyViewPage.details();
        expect(details.ID).toBe(company.id);
        expect(details['Arabic Name']).toBe(company.arabicName);
        expect(details['English Name']).toBe(company.englishName);
        expect(details.Status).toBe(company.status);
        expect(details.Email, 'a valid-looking e-mail address').toMatch(
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        );
        expect(details['Phone Number'], 'a phone number').toMatch(/^\+?\d{9,15}$/);
        expect(details['Created At']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        expect(details['Updated At']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        expect(
          details['Updated At'] >= details['Created At'],
          'updated is not before created',
        ).toBe(true);

        // The list row for the same company agrees.
        await deliveryCompanyListPage.goto();
        const row = (await deliveryCompanyListPage.readRows()).find((r) => r.id === company.id);
        expect(row?.arabicName).toBe(details['Arabic Name']);
        expect(row?.englishName).toBe(details['English Name']);
        expect(row?.status).toBe(details.Status);
      },
    );
  }

  test(
    'DC-VIEW-02 The page offers Back and Update, and Back returns to the list',
    { tag: ['@functional'] },
    async ({ page, deliveryCompanyViewPage }) => {
      await deliveryCompanyViewPage.goto(existingCompanies[0].id);

      await expect(deliveryCompanyViewPage.updateButton).toBeVisible();
      await expect(deliveryCompanyViewPage.backButton).toBeVisible();
      await deliveryCompanyViewPage.backButton.click();

      await expect(page).toHaveURL(/\/delivery-company\/index$/);
    },
  );

  test(
    'DC-VIEW-03 A company ID that does not exist is not shown as a company',
    { tag: ['@functional', '@negative'] },
    async ({ page, deliveryCompanyViewPage }) => {
      const response = await page.goto(
        '/backend/deliveryCompany/delivery-company/view?id=99999999',
      );

      expect(response?.status()).toBe(404);
      await expect(deliveryCompanyViewPage.updateButton).toHaveCount(0);
    },
  );
});
