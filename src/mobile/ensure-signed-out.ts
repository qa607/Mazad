import type { MazadAccountScreen } from '@mobile/screens/account.screen';
import type { AppShellScreen } from '@mobile/screens/app-shell.screen';
import type { MazadLoginScreen } from '@mobile/screens/login.screen';
import { LOGOUT_BLOCKED } from '@utils/account-actions';

/**
 * Defensive guard for the start of a login/forgot-password test: if the account is still
 * signed in (e.g. a previous test's own logout step failed), logs it out first (only when logout
 * is approved for the run; otherwise it stops with a clear message), so every test
 * starts from the same guest state instead of failing on an unrelated, stale precondition.
 */
export async function ensureSignedOut(
  appShell: AppShellScreen,
  loginScreen: MazadLoginScreen,
  accountScreen: MazadAccountScreen,
  guestPromptLabel: string,
  logoutLabel: string,
): Promise<void> {
  await appShell.open('more');
  const guestPrompt = loginScreen.guestPrompt(guestPromptLabel);
  if (await guestPrompt.isExisting()) return;

  // Logging a shared account out is an account action: only when approved for this run.
  if (LOGOUT_BLOCKED) {
    throw new Error(
      `The app is signed in, and automatic logout is not approved. Sign out manually, then re-run. ${LOGOUT_BLOCKED}`,
    );
  }
  await accountScreen.confirmLogout(logoutLabel, logoutLabel);
  await guestPrompt.waitForDisplayed({ timeout: 10_000 });
}
