import fs from 'node:fs';
import path from 'node:path';
import { DEV_ROOT_MISSING_REASON, getDevRootAccount } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { test as base, expect } from '@fixtures/test.fixture';
import { MazadLoginPage } from '@pages/backend/auth/mazad-login.page';
import { backendUrls } from '@test-data/backend-login.data';

/** Saved Dev Root sessions, one per worker. The folder is gitignored. */
const AUTH_DIR = path.resolve(__dirname, '..', '..', 'playwright', '.auth');

interface SupplierWorkerFixtures {
  /** Path of a signed-in Dev Root session, or null when the credentials are not in .env. */
  devRootSession: string | null;
}

/**
 * Tests that start signed in as Dev Root. The worker logs in once through the login page and
 * every test reuses that session. Tests are skipped when the Dev Root credentials are not set.
 * Page objects and the masked failure screenshot come from @fixtures/test.fixture.
 */
export const test = base.extend<object, SupplierWorkerFixtures>({
  devRootSession: [
    async ({ browser }, use, workerInfo) => {
      const account = getDevRootAccount();
      if (!account) {
        await use(null);
        return;
      }
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const file = path.join(AUTH_DIR, `dev-root-${workerInfo.workerIndex}.json`);
      const context = await browser.newContext({ baseURL: envConfig.baseURL });
      const page = await context.newPage();
      const loginPage = new MazadLoginPage(page);
      await loginPage.goto();
      await loginPage.loginAs(account);
      await page.waitForURL(backendUrls.dashboard);
      await context.storageState({ path: file });
      await context.close();
      await use(file);
      fs.rmSync(file, { force: true });
    },
    { scope: 'worker' },
  ],
  storageState: async ({ devRootSession }, use, testInfo) => {
    testInfo.skip(!devRootSession, DEV_ROOT_MISSING_REASON);
    await use(devRootSession ?? undefined);
  },
});

export { expect };
