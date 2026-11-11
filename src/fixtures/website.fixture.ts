import {
  DEV_ROOT_MISSING_REASON,
  OTP_MISSING_REASON,
  getDevRootAccount,
  getOtpCode,
  testAccountNameFilter,
} from '@config/credentials.config';
import fs from 'node:fs';
import path from 'node:path';
import { approvedOrigin } from '@config/staging-environments';
import { envConfig } from '@config/env.config';
import { test as base } from '@fixtures/test.fixture';
import { installGuestGuard, type NetworkEvent } from '../network/request-guard';
import {
  deleteFirebaseAnonymousUser,
  type FirebaseAnonymousSession,
} from '../network/firebase-anonymous-cleanup';
import {
  activeWebRequests,
  APPROVED_WEB_REQUESTS,
  WEB_SYNTHETIC_VALUES,
} from '../network/web-approved-requests';
import { MazadLoginPage } from '@pages/backend/auth/mazad-login.page';
import type { AccountRole, DirectoryAccount } from '@pages/backend/mazad-user-directory.page';
import { MazadUserDirectoryPage } from '@pages/backend/mazad-user-directory.page';
import { MazadWebsiteLoginPage } from '@pages/website/mazad-login.page';
import { MazadRegistrationPage } from '@pages/website/mazad-registration.page';

interface WebsiteWorkerFixtures {
  /** Finds a dedicated test account in the back office. Worker-scoped: one lookup per worker. */
  findTestAccount: (role: AccountRole) => Promise<DirectoryAccount>;
}

interface WebsiteFixtures {
  mazadWebsiteLoginPage: MazadWebsiteLoginPage;
  mazadRegistrationPage: MazadRegistrationPage;
  /** A dedicated Individual test account from the back office (name contains the test filter). */
  individualAccount: DirectoryAccount;
  /** A dedicated Dealer test account from the back office (name contains the test filter). */
  dealerAccount: DirectoryAccount;
  /** The staging OTP (OTP_CODE in .env), never printed. Tests using it are skipped without one. */
  otpCode: string;
  /** Requests the web request guard blocked in this test (expected and unexpected). */
  webNetworkLog: NetworkEvent[];
  /**
   * Anonymous Firebase sessions this test's OWN allowed signup request created (populated only
   * when allowFirebaseAnonymousSignup is on). Each is deleted, with its own ID token, when the
   * test ends — pass or fail — and the result is attached to the report; a failed deletion fails
   * the test instead of being silently swallowed.
   */
  firebaseAnonymousSessions: FirebaseAnonymousSession[];
}

/** test.use() option. Off everywhere by default; only tests/website/registration.spec.ts sets it. */
interface WebsiteOptions {
  allowFirebaseAnonymousSignup: boolean;
}

/** Written on the first unexpected request; every later website test then fails at once. */
const WEB_GUARD_HALT_FILE = 'WEB-REQUEST-GUARD-HALT.json';

/**
 * The only host the website tests may open: the selected approved staging environment's host
 * (config/environments/<TEST_ENV>.json). envConfig is already restricted to it; checked again.
 */
function stagingHostOrThrow(): string {
  const allowed = new URL(approvedOrigin(envConfig.name));
  const target = new URL(envConfig.baseURL);
  if (target.origin !== allowed.origin) {
    throw new Error(
      `Refusing to run website tests: target is ${target.origin} (TEST_ENV=${envConfig.name}); only ${allowed.origin} is allowed.`,
    );
  }
  return allowed.host;
}

export const test = base.extend<WebsiteFixtures & WebsiteOptions, WebsiteWorkerFixtures>({
  allowFirebaseAnonymousSignup: [false, { option: true }],
  // eslint-disable-next-line no-empty-pattern
  webNetworkLog: async ({}, use) => {
    await use([]);
  },
  // eslint-disable-next-line no-empty-pattern
  firebaseAnonymousSessions: async ({}, use, testInfo) => {
    const sessions: FirebaseAnonymousSession[] = [];
    await use(sessions);
    if (!sessions.length) return;
    const results = await Promise.all(sessions.map((s) => deleteFirebaseAnonymousUser(s)));
    await testInfo.attach('firebase-anonymous-cleanup.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      throw new Error(
        `Firebase anonymous-user cleanup failed for ${failed.length} session(s): ${failed
          .map((f) => `${f.localIdPrefix}… (${f.error})`)
          .join('; ')}`,
      );
    }
  },
  // Every page and context the website tests open is guarded before the first navigation:
  // GET/HEAD to staging and the listed static hosts only; known analytics/Firebase traffic is
  // blocked as expected; any other request (including every POST that is not an approved,
  // active endpoint in src/network/web-approved-requests.ts) is blocked, fails the test and
  // halts the run. Redirect hops are checked too. The back-office lookup (findTestAccount)
  // uses its own context and is not affected.
  //
  // allowFirebaseAnonymousSignup (default false) permits exactly one extra request, see
  // src/network/request-guard.ts FIREBASE_ANONYMOUS_SIGNUP: only tests/website/registration.spec.ts
  // turns it on. Its result (if any) is captured into firebaseAnonymousSessions for cleanup, never
  // logged here beyond the audit entry request-guard.ts itself adds to webNetworkLog.
  context: async (
    { context, webNetworkLog, allowFirebaseAnonymousSignup, firebaseAnonymousSessions },
    use,
    testInfo,
  ) => {
    const haltFile = path.join(testInfo.project.outputDir, WEB_GUARD_HALT_FILE);
    if (fs.existsSync(haltFile)) {
      throw new Error(
        `Run halted by the web request guard after an unexpected request; see ${haltFile}.`,
      );
    }
    const stagingHost = stagingHostOrThrow();
    await installGuestGuard(
      context,
      stagingHost,
      (event) => {
        webNetworkLog.push(event);
        if (event.kind === 'unexpected' && !fs.existsSync(haltFile)) {
          fs.mkdirSync(path.dirname(haltFile), { recursive: true });
          fs.writeFileSync(haltFile, JSON.stringify({ test: testInfo.title, event }, null, 2));
        }
      },
      undefined,
      activeWebRequests(APPROVED_WEB_REQUESTS),
      WEB_SYNTHETIC_VALUES,
      allowFirebaseAnonymousSignup,
      (session) => firebaseAnonymousSessions.push(session),
    );

    await use(context);

    if (webNetworkLog.length) {
      await testInfo.attach('web-request-guard.json', {
        body: JSON.stringify(webNetworkLog, null, 2),
        contentType: 'application/json',
      });
    }
    const unexpected = webNetworkLog.filter((e) => e.kind === 'unexpected');
    if (unexpected.length) {
      throw new Error(
        `Web request guard blocked unexpected request(s); the run is halted: ${unexpected
          .map((e) => `${e.method} ${e.target} (${e.reason})`)
          .join('; ')}`,
      );
    }
  },
  findTestAccount: [
    async ({ browser }, use) => {
      const account = getDevRootAccount();
      if (!account) throw new Error(DEV_ROOT_MISSING_REASON);
      const context = await browser.newContext();
      const page = await context.newPage();
      const loginPage = new MazadLoginPage(page);
      await loginPage.goto();
      await loginPage.loginAs(account);
      // loginAs() does not itself wait for the resulting redirect; every other caller follows
      // it with its own wait (e.g. an assertion), which this fixture has no test to attach to.
      await page.waitForURL((url) => !url.pathname.includes('/authentication/login'));

      const cache = new Map<AccountRole, DirectoryAccount>();
      await use(async (role) => {
        const cached = cache.get(role);
        if (cached) return cached;
        const directory = new MazadUserDirectoryPage(page);
        const found = await directory.findActiveAccount(role, testAccountNameFilter());
        if (!found) {
          throw new Error(
            `No active ${role} test account found (name containing "${testAccountNameFilter()}"). ` +
              'Create a dedicated staging test account, or set TEST_ACCOUNT_NAME_FILTER to match one.',
          );
        }
        cache.set(role, found);
        return found;
      });

      await context.close();
    },
    { scope: 'worker' },
  ],
  individualAccount: async ({ findTestAccount }, use) => {
    await use(await findTestAccount('individual'));
  },
  dealerAccount: async ({ findTestAccount }, use) => {
    await use(await findTestAccount('dealer'));
  },
  mazadWebsiteLoginPage: async ({ page, language }, use) => {
    await use(new MazadWebsiteLoginPage(page, language));
  },
  mazadRegistrationPage: async ({ page, language }, use) => {
    await use(new MazadRegistrationPage(page, language));
  },
  // eslint-disable-next-line no-empty-pattern
  otpCode: async ({}, use, testInfo) => {
    const otp = getOtpCode();
    testInfo.skip(!otp, OTP_MISSING_REASON);
    if (!otp) return; // Not reached: skip() ends the test.
    await use(otp);
  },
});

export { expect } from '@fixtures/test.fixture';
