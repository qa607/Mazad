import { test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations } from '@utils/test-category';
import { runCauses } from './ios-account-helpers';
import { LANGUAGES } from './ios-test-helpers';

/**
 * Mazad iOS: the signed-in Dealer (the dedicated Dealer account from .env). One shared scenario
 * list covers English and Arabic; nothing is duplicated per language.
 *
 * STRUCTURE ONLY. The signed-in iOS screens have never been inspected (that needs the first
 * authorized login), so no selector, text or expected result is written here: each scenario is a
 * declared, skipped test with its typed category, and its body is filled in after the inspection
 * records the screens. Nothing here logs in, requests an OTP or changes an account. Successful
 * login with logout already lives in login.spec.ts and is not repeated.
 *
 * Android has comparable screens (My Bids, My Actions, Notifications: src/mobile/screens), but their
 * iOS layout, labels and signed-in behaviour are not known and are not copied from Android.
 */
test.describe.configure({ mode: 'serial' });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

/** Scenarios to implement after the signed-in screens are inspected, in this order. */
export const DEALER_SCENARIOS = [
  'Signed-in Dealer sees the account tab for the dedicated account',
  'Signed-in Dealer opens My Bids',
  'Signed-in Dealer opens My Actions',
  'Signed-in Dealer opens Notifications',
] as const;

const PENDING =
  'Pending: the signed-in iOS screens have never been inspected; no selector or expected result is recorded for them (inspect after the first authorized login).';

for (const lang of LANGUAGES) {
  test.describe(
    `iOS dealer (${lang})`,
    allureLabels({
      feature: 'Dealer',
      story: 'Signed-in Dealer',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      for (const title of DEALER_SCENARIOS) {
        test.fixme(
          title,
          {
            annotation: categoryAnnotations({
              ...runCauses('login'),
              pending: PENDING,
              textGate: OTHER_TESTS_PROBLEM,
            }),
          },
          () => {
            // Declared only: filled in after the signed-in screens are inspected.
          },
        );
      }
    },
  );
}
