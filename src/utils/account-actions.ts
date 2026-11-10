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
