import { expect, test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { gotoGuest } from '../support/stabilize';
import { expectPageShot } from '../support/visual-assert';

const GROUP = 'at-competitive-bidding-355';
const FILTERS_PANEL = 'app-car-filters-side-modal';

test.describe('Auction group (ended)', () => {
  test('full page', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/auctions/${GROUP}/`);
    await expectPageShot(page, 'auction-group-355.png');
    await runPageChecks(page, findings, { screen: 'auction-group-355' });
  });

  // Opened and closed only: no option is selected and nothing is applied. The options depend on
  // data, so the panel gets layout and localization checks, not a pixel baseline.
  test('filters panel', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/auctions/${GROUP}/`);
    await page.locator('app-filter-button:visible').first().click();
    const panel = page.locator(FILTERS_PANEL);
    await expect(panel).toBeVisible();
    await runPageChecks(page, findings, { screen: 'auction-group-filters', root: FILTERS_PANEL });
    await panel.locator('.filter-close-icon-wrapper').first().click();
    await expect(panel).toBeHidden();
  });
});
