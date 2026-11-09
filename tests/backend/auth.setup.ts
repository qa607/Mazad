import fs from 'node:fs';
import {
  BACKEND_ROLES,
  type BackendRole,
  DEV_ROOT_SESSION_FILE,
  getRoleAccount,
  roleSessionFile,
} from '@config/credentials.config';
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

// One sign-in per role account configured in .env, for the permission specs. Roles with no
// account get no sign-in step, and the permission tests that need them are skipped.
for (const role of Object.keys(BACKEND_ROLES) as BackendRole[]) {
  const account = getRoleAccount(role);
  if (!account) continue;

  setup(`sign in as ${BACKEND_ROLES[role].label}`, async ({ page, mazadLoginPage }) => {
    const sessionFile = roleSessionFile(role);
    // Drop any session from an earlier run, so a failed login never leaves a stale one behind.
    fs.rmSync(sessionFile, { force: true });

    await mazadLoginPage.goto();
    await mazadLoginPage.loginAs(account);
    await expect(page).toHaveURL(backendUrls.dashboard);

    await page.context().storageState({ path: sessionFile });
  });
}
