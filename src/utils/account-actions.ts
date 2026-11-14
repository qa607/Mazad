/**
 * Approval switches for account-changing operations in the Web and Android functional tests.
 * All default to "blocked": the tests that need them are skipped when the spec file loads, so
 * no hook, fixture, account lookup or network request runs for them.
 *
 * Enable one only after the QA owner has approved, for that run, the exact test account, its
 * purpose, the operation and the maximum number of attempts. Never enable them for real
 * customer accounts. iOS uses its own, stricter gates (src/mobile/ios/ios-preflight.ts).
 */
const blocked = (name: string, what: string) =>
  process.env[name] === 'true'
    ? undefined
    : `Blocked: ${what} is not approved for this run (${name}). Ask the QA owner first.`;

/** Requests an OTP for a registered test account (Forgot Password with a real phone). */
export const OTP_REQUEST_BLOCKED = blocked(
  'MAZAD_ALLOW_OTP_REQUESTS',
  'sending OTP requests to a registered test account',
);

/** Resets a test account's password (Forgot Password to the end, or the successful-login flow). */
export const PASSWORD_RESET_BLOCKED = blocked(
  'MAZAD_ALLOW_PASSWORD_RESET',
  'resetting a test account password',
);

/** Logs a shared test account out (successful-login flow; signing out a signed-in app). */
export const LOGOUT_BLOCKED = blocked('MAZAD_ALLOW_LOGOUT', 'logging a shared test account out');

/** Submits registration (creates a new account) instead of only inspecting Step 2 state. */
export const ACCOUNT_CREATION_BLOCKED = blocked(
  'MAZAD_ALLOW_ACCOUNT_CREATION',
  'submitting registration to create a new test account',
);

/**
 * Sends a Contact Us message from the Android app to staging. Not an account change, but it
 * creates a back-office record the app tests cannot guard the way the website's request guard
 * does (app traffic is not intercepted), so it waits for the QA owner's sign-off.
 */
export const MOBILE_CONTACT_SUBMIT_BLOCKED = blocked(
  'MAZAD_ALLOW_MOBILE_CONTACT_SUBMIT',
  'sending a Contact Us message from the Android app',
);

/**
 * Adds an app version above the installed build with Force Update on (back office App Versions).
 * Not an account change, but while that row exists EVERY staging app of that platform shows the
 * non-dismissable update dialog, so it waits for the QA owner's sign-off for the run; the test
 * deletes the row again within about a minute.
 */
export const FORCE_UPDATE_BLOCKED = blocked(
  'MAZAD_ALLOW_FORCE_UPDATE',
  'adding a force-update app version on staging (blocks every staging app of that platform until it is deleted)',
);

/** The first reason a test needing these operations is blocked, if any. */
export function firstBlocked(...reasons: (string | undefined)[]): string | undefined {
  return reasons.find(Boolean);
}

/**
 * Annotation recording why a test is declared skipped. Used with
 * `(reason ? test.skip : test)(title, { annotation: blockedBy(reason) }, body)`, which skips the
 * test when the file loads (no hook, fixture or account lookup runs) while keeping its exact
 * title path, so its report history is preserved.
 */
export function blockedBy(reason: string | undefined): { type: string; description: string }[] {
  return reason ? [{ type: 'blocked', description: reason }] : [];
}
