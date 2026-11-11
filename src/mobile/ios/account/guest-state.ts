import type { AppStateMarker } from './recovery-journal';

/**
 * The guest-state guarantee. After an account test (pass or fail) the app must be back in guest
 * state, because a signed-in app fails every later test for the wrong reason.
 *
 * Boundaries (selfchecked):
 * - it signs out ONLY when logout is explicitly authorized (MAZAD_ALLOW_LOGOUT); otherwise it
 *   reports "not guest" and leaves the app untouched;
 * - it can do nothing else: the dependencies below have no OTP, login or password-reset
 *   operation, so cleanup can never request an OTP or reset a password;
 * - it never retries a logout: one attempt, then it verifies and reports.
 */
export interface GuestStateDeps {
  /** True when the app shows the guest state (More shows the guest prompt). */
  isGuest(): Promise<boolean>;
  /** Signs the app out through its UI. Only called when `logoutAuthorized` is true. */
  logout(): Promise<void>;
  /** MAZAD_ALLOW_LOGOUT, decided by the caller. */
  logoutAuthorized: boolean;
}

export type GuestStateFailure =
  | 'guest-check-failed'
  | 'not-guest-logout-not-authorized'
  | 'logout-failed'
  | 'still-not-guest-after-logout';

export type GuestStateResult =
  | { ok: true; action: 'already-guest' | 'logged-out' }
  | { ok: false; reason: GuestStateFailure; detail: string };

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Returns the app to guest state if, and only if, signing out is authorized. */
export async function ensureGuestState(deps: GuestStateDeps): Promise<GuestStateResult> {
  let guest: boolean;
  try {
    guest = await deps.isGuest();
  } catch (error) {
    return { ok: false, reason: 'guest-check-failed', detail: message(error) };
  }
  if (guest) return { ok: true, action: 'already-guest' };
  if (!deps.logoutAuthorized) {
    return {
      ok: false,
      reason: 'not-guest-logout-not-authorized',
      detail:
        'The app is not in guest state and signing out is not authorized (MAZAD_ALLOW_LOGOUT). Sign out manually.',
    };
  }
  try {
    await deps.logout();
  } catch (error) {
    return { ok: false, reason: 'logout-failed', detail: message(error) };
  }
  try {
    guest = await deps.isGuest();
  } catch (error) {
    return { ok: false, reason: 'guest-check-failed', detail: message(error) };
  }
  return guest
    ? { ok: true, action: 'logged-out' }
    : {
        ok: false,
        reason: 'still-not-guest-after-logout',
        detail: 'The app is still not in guest state after signing out.',
      };
}

/**
 * Cleanup after an account test, pass or fail. A failure writes the app-state marker, which
 * blocks the next account run (and so stops the chain's successors from running on a dirty app).
 */
export async function cleanupAfterAccountTest(
  deps: GuestStateDeps,
  marker: AppStateMarker,
): Promise<GuestStateResult> {
  const result = await ensureGuestState(deps);
  if (!result.ok) marker.write(`${result.reason}: ${result.detail}`);
  return result;
}

/**
 * Start of an account test: the app must be in guest state. Signs out only when authorized;
 * clears a left-over marker only after the guest state is confirmed.
 */
export async function guestStateAtStart(
  deps: GuestStateDeps,
  marker: AppStateMarker,
): Promise<GuestStateResult> {
  const result = await ensureGuestState(deps);
  if (result.ok) marker.clear();
  return result;
}
