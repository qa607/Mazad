import { test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { gotoGuest } from '../support/stabilize';
import { expectPageShot } from '../support/visual-assert';

test.describe('Home', () => {
  test('full page', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/`);
    await expectPageShot(page, 'home.png');
    await runPageChecks(page, findings, { screen: 'home' });
  });
});
