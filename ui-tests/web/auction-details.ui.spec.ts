import { test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { gotoGuest } from '../support/stabilize';
import { expectPageShot } from '../support/visual-assert';

/** Ended auction 24696: stable data, chosen for the initial auction-details tests. */
const CAR_ID = 24696;

test.describe('Auction details', () => {
  test('full page', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/car/${CAR_ID}/`);
    await expectPageShot(page, `car-${CAR_ID}.png`);
    await runPageChecks(page, findings, { screen: `car-${CAR_ID}` });
  });
});
