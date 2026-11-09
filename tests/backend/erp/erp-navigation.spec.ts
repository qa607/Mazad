import { ERP_MISSING_REASON, getErpAccount } from '@config/credentials.config';
import { expect, test } from '@fixtures/test.fixture';
import { ErpDeskPage } from '@pages/erp/erp-desk.page';
import { erpSearchText, erpUrls } from '@test-data/erp.data';

// Signs in to ERPNext with a real account: no trace, video or screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('ERPNext - open Customer List and Supplier List', () => {
  test.beforeEach(async ({ page }) => {
    const account = getErpAccount();
    test.skip(!account, ERP_MISSING_REASON);
    if (!account) return;
    const erp = new ErpDeskPage(page);
    await erp.goto();
    await erp.loginAs(account);
  });

  test('Login lands on Helpdesk', async ({ page }) => {
    await expect(page).toHaveURL(erpUrls.helpdesk);
    await expect(new ErpDeskPage(page).appSwitcher).toBeVisible();
  });

  for (const [list, url] of [
    ['customerList', erpUrls.customerList],
    ['supplierList', erpUrls.supplierList],
  ] as const) {
    test(`Helpdesk → Apps → ERPNext, then the global search opens ${erpSearchText[list]}`, async ({
      page,
    }) => {
      const app = new ErpDeskPage(await new ErpDeskPage(page).openErpNext());
      await expect(app.page).toHaveURL(erpUrls.desk);

      await app.searchAndOpen(erpSearchText[list]);

      // Rows are not asserted: ERPNext reapplies each user's last list filter, which may match
      // nothing for this account. The record checks are in erp-supplier-sync.spec.ts.
      await expect(app.page).toHaveURL(url);
      await expect(app.listCount).toHaveText(/\d+ of [\d,]+\+?/);
    });
  }
});
