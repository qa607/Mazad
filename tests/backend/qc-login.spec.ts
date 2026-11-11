import { QC_MISSING_REASON, getQcAccount } from '@config/credentials.config';
import { signInFresh } from '@fixtures/backend-sign-in';
import { expect, test } from '@fixtures/test.fixture';
import { qcPagePaths, qcUrls } from '@test-data/qc.data';

/**
 * A QC (quality control) account must not be able to sign in to the Backend, even with its
 * correct password. Uses the QC account from the local .env (QC_PHONE / QC_PASSWORD); the tests
 * skip while it is not set. Nothing is changed: each test only attempts to sign in.
 */

/** Cookie that holds a signed-in Backend identity. */
const identityCookie = '_identity-mazad-backend';
const qc = getQcAccount();

// A real account signs in here: no trace or video, and only the masked failure screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('QC - sign-in of a QC account', { tag: ['@regression'] }, () => {
  test.skip(!qc, QC_MISSING_REASON);

  test(
    'A QC account is refused at sign-in with an error and stays on the login page',
    { tag: ['@smoke', '@negative'] },
    async ({ browser, pagesOn }) => {
      const signIn = await signInFresh(browser, pagesOn, qc!.phone, qc!.password);
      try {
        expect(signIn.error, 'sign-in is refused').not.toBeNull();
        expect(signIn.error, 'an error message is shown').not.toBe('');
        await expect(signIn.tab).toHaveURL(qcUrls.login);
      } finally {
        await signIn.context.close();
      }
    },
  );

  test(
    'After the refused sign-in there is no session: Backend and QC pages lead to login',
    { tag: ['@negative'] },
    async ({ browser, pagesOn }) => {
      const signIn = await signInFresh(browser, pagesOn, qc!.phone, qc!.password);
      try {
        const cookies = await signIn.context.cookies();
        expect(cookies.map((cookie) => cookie.name)).not.toContain(identityCookie);

        const { mazadDashboardPage } = pagesOn(signIn.tab);
        await mazadDashboardPage.goto();
        await expect(signIn.tab).toHaveURL(qcUrls.login);
        for (const path of qcPagePaths('1')) {
          await signIn.tab.goto(path);
          await expect(signIn.tab, path).toHaveURL(qcUrls.login);
        }
      } finally {
        await signIn.context.close();
      }
    },
  );
});
