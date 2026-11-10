import { currentPasswordVerified } from '../../../../config/ios-account-policy';
import {
  type AccountRunContext,
  type AccountRunKind,
  accountRunProblem,
} from '@mobile/ios/account/account-preflight';
import type { OtpChainId } from '@mobile/ios/account/otp-chain';

/**
 * THE central authorization guard for iOS account actions that are not an OTP request (those also
 * need a permit, otp-permit.ts, which calls the same check). Every screen method that submits an
 * account action calls `authorizeAccountAction` BEFORE it types or taps anything, so no helper, page
 * object or spec can submit one without it. It requires, for the run kind, ALL of:
 * the confirmed applicable policy facts, the confirmed synthetic account, its environment variables,
 * clean journals, approvals, and every approval switch of the iOS and Mazad families (the matrix
 * is `SWITCHES` in account-preflight.ts). Anything missing, malformed or ambiguous refuses.
 *
 * Passing the guard is a statement that every condition holds right now. It is not a permit: it
 * can be asked again for every action and is never cached.
 */
export class AccountActionNotAuthorized extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountActionNotAuthorized';
  }
}

/** What a caller passes to say which kind of run an action belongs to. */
export interface ActionAuthorization {
  kind: AccountRunKind;
  chainId?: OtpChainId;
  /** Selfchecks pass their own context; real runs leave it out (the real one is used). */
  ctx?: AccountRunContext;
}

export function authorizeAccountAction(
  auth: ActionAuthorization | undefined,
  allowedKinds: readonly AccountRunKind[],
  what: string,
  defaultContext: (chainId?: OtpChainId) => AccountRunContext,
): void {
  if (typeof auth !== 'object' || auth === null || typeof auth.kind !== 'string') {
    throw new AccountActionNotAuthorized(`${what} refused: no authorization was given.`);
  }
  if (!allowedKinds.includes(auth.kind)) {
    throw new AccountActionNotAuthorized(
      `${what} refused: run kind "${auth.kind}" is not allowed to do this (allowed: ${allowedKinds.join(', ')}).`,
    );
  }
  let problem: string | undefined;
  try {
    problem = accountRunProblem(auth.kind, auth.ctx ?? defaultContext(auth.chainId));
  } catch (error) {
    // An authorization check that cannot be completed is a refusal, never a pass.
    throw new AccountActionNotAuthorized(
      `${what} refused: the authorization could not be checked (${error instanceof Error ? error.message : 'unknown error'}).`,
    );
  }
  if (problem) throw new AccountActionNotAuthorized(`${what} refused: ${problem}`);
  if (auth.kind === 'login') requireBaselinePassword(auth, what, defaultContext);
}

/**
 * A dealer login uses the password from .env. That password is only the account's current
 * password after a reset to the baseline has completed, or when the owner has recorded that it is, so a login before that would be a wrong
 * password and could count toward an account lock. Checked when the login is made (not when the
 * spec loads), so a reset earlier in the same run counts. Fails closed.
 */
function requireBaselinePassword(
  auth: ActionAuthorization,
  what: string,
  defaultContext: (chainId?: OtpChainId) => AccountRunContext,
): void {
  let established: boolean;
  try {
    const ctx = auth.ctx ?? defaultContext(auth.chainId);
    const journal = ctx.journal;
    established =
      (typeof journal.baselineEstablished === 'function' && journal.baselineEstablished()) ||
      currentPasswordVerified(ctx.policy, ctx.now);
  } catch {
    established = false;
  }
  if (!established) {
    throw new AccountActionNotAuthorized(
      `${what} refused: the account's baseline password is not established (no completed reset to the baseline is on record, and the owner has not recorded that the .env password is the account's current password); a login with a password that may not be set could count toward an account lock.`,
    );
  }
}
