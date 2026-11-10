import { expect, test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { gotoGuest } from '../support/stabilize';
import { expectLocatorShot } from '../support/visual-assert';

/**
 * /auctions/ (ended list). Its cards change as auctions end, so only stable components get
 * baselines; layout and localization checks still cover the whole page.
 * Sorting: not offered to guests (verified in the readiness review), so not tested.
 */
test.describe('Auctions list', () => {
  test.beforeEach(async ({ page, language }) => {
    await gotoGuest(page, `/${language}/auctions/`);
  });

  test('make and city chips', async ({ page, findings }) => {
    const chips = page.locator('app-quick-filters:visible').first();
    await expect(chips).toBeVisible();
    await expectLocatorShot(chips, 'auctions-quick-filters.png');
    await runPageChecks(page, findings, { screen: 'auctions-list' });
  });

  test('pagination', async ({ page }) => {
    // The nearest element holding more than one ?page= link is the pagination bar.
    const pagination = page
      .locator('a[href*="page="]')
      .first()
      .locator('xpath=ancestor::*[count(.//a[contains(@href,"page=")]) > 1][1]');
    await expect(pagination).toBeVisible();
    await expectLocatorShot(pagination, 'auctions-pagination.png');
  });
});
