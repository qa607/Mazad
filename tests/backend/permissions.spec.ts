import { expect, test } from '@fixtures/test.fixture';
import {
  type AccessProfile,
  type AuctionAction,
  type AuctionPage,
  auctionActions,
  auctionPages,
  backendHomePath,
  expectedAccess,
  forbiddenStatus,
} from '@test-data/backend-permissions.data';

// Checks that each role can open, and act on, exactly the auction lists its permissions allow:
// Ready For Pricing, Pricing Done, Upcoming and Suspended Vehicles. Dev Root (role "root")
// always runs; every other role runs only when its test account is set in .env (see
// .env.example), and is skipped otherwise. Nothing changes on staging: action requests use a non-existent ID or an empty form.

// Signed-in sessions: no traces or videos, which would capture the session cookie.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const profiles = Object.keys(expectedAccess) as AccessProfile[];
const pageKeys = Object.keys(auctionPages) as AuctionPage[];
const actionKeys = Object.keys(auctionActions) as AuctionAction[];

for (const profile of profiles) {
  const access = expectedAccess[profile];

  test.describe(`Backend permissions - ${access.label}`, { tag: '@regression' }, () => {
    test.use({ signedInAs: profile });

    for (const pageKey of pageKeys) {
      const { label, path } = auctionPages[pageKey];
      const allowed = access.pages.includes(pageKey);

      test(
        `${allowed ? 'can' : 'cannot'} open ${label}`,
        { tag: '@negative' },
        async ({ page }) => {
          const response = await page.goto(path);

          expect(response?.status(), `${label} HTTP status`).toBe(allowed ? 200 : forbiddenStatus);
          expect((await page.title()) === label, `${label} page shown`).toBe(allowed);
        },
      );
    }

    test(
      'sidebar links only to the auction lists the role can open',
      { tag: '@functional' },
      async ({ page, mazadDashboardPage }) => {
        await page.goto(backendHomePath);

        for (const pageKey of pageKeys) {
          const { label, path } = auctionPages[pageKey];
          const link = mazadDashboardPage.sidebar.locator(`a[href="${path}"]`);
          await expect(link, `${label} link`).toHaveCount(access.pages.includes(pageKey) ? 1 : 0);
        }
      },
    );

    for (const actionKey of actionKeys) {
      const action = auctionActions[actionKey];
      const { label, path } = action;
      const allowed = access.actions.includes(actionKey);
      // An irreversible action is only ever sent where it must be refused.
      if (allowed && 'destructive' in action) continue;

      test(
        `server ${allowed ? 'accepts' : 'rejects'} "${label}"`,
        { tag: '@negative' },
        async ({ page, mazadDashboardPage }) => {
          // Any signed-in page gives the CSRF token the request needs.
          await page.goto(backendHomePath);

          const status = await mazadDashboardPage.postAction(path);

          expect(status === forbiddenStatus, `${label} rejected (HTTP ${status})`).toBe(!allowed);
        },
      );
    }
  });
}
