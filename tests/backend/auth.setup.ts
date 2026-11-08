import fs from 'node:fs';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { expect, test as setup } from '@fixtures/test.fixture';
import { backendUrls } from '@test-data/backend-login.data';

// Signs in as Dev Root once per run and saves the session for the signed-in Backend specs.
// It enters real credentials, so it records no trace, video or screenshot.
setup.use({ trace: 'off', video: 'off', screenshot: 'off' });

setup('sign in as Dev Root', async ({ page, mazadLoginPage, devRoot }) => {
  // Drop any session from an earlier run, so a failed login can never leave a stale one behind.
  fs.rmSync(DEV_ROOT_SESSION_FILE, { force: true });

  await mazadLoginPage.goto();
  await mazadLoginPage.loginAs(devRoot);
  await expect(page).toHaveURL(backendUrls.dashboard);

  await page.context().storageState({ path: DEV_ROOT_SESSION_FILE });
});
