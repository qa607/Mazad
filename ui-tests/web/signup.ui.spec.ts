import { expect, test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { gotoGuest } from '../support/stabilize';
import { expectPageShot } from '../support/visual-assert';

/**
 * Registration step 1, display only. No field is touched, Next is never clicked and nothing is
 * submitted. The guest guard halts the run if any request other than GET/HEAD is attempted.
 */
test.describe('Registration', () => {
  test('step 1 (display only)', async ({ page, language, findings, networkLog }) => {
    await gotoGuest(page, `/${language}/signup/`);
    await expect(page).toHaveURL(new RegExp(`/${language}/signup/?$`));
    await expectPageShot(page, 'signup-step-1.png');
    await runPageChecks(page, findings, { screen: 'signup-step-1' });
    expect(networkLog.filter((e) => e.kind === 'unexpected')).toEqual([]);
  });
});
