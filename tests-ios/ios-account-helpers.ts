import {
  type AccountRunKind,
  accountRunBlockers,
  accountRunProblem,
  type Blocker,
  effectiveChain,
} from '@mobile/ios/account/account-preflight';
import { type ChainPlan, planWithScreenText } from '@mobile/ios/account/chain-plan';
import { ACCOUNT_TEST_POLICY, currentPasswordVerified } from '@config/ios-account-policy';
import {
  accountContext,
  accountJournal,
  appStateMarker,
  RUN_ID,
} from '@mobile/ios/account/account-context';
import {
  issueOtpRequestPermit,
  type OtpRequestPermit,
  recordValidOtpEntered,
} from '@mobile/ios/account/otp-permit';
import type { Causes } from '@utils/test-category';
import {
  cleanupAfterAccountTest,
  type GuestStateDeps,
  guestStateAtStart,
} from '@mobile/ios/account/guest-state';
import {
  appendOtpLedger,
  chainDefinition,
  OtpChain,
  type OtpChainId,
} from '@mobile/ios/account/otp-chain';
import { guardPasswordAttempts } from '@mobile/ios/account/attempt-guard';
import { ACCOUNT_STATE_DIR } from '@mobile/ios/account/recovery-journal';
import type { IosConfig } from '@mobile/ios/ios.config';
import { type AppRestarter, restartIosApp } from '@mobile/ios/ios.session';
import type { IosAccountScreen } from '@mobile/ios/screens/account.screen';
import type { IosAppShellScreen } from '@mobile/ios/screens/app-shell.screen';
import { iosAppText } from '@test-data/ios-app.data';
import { LOGOUT_BLOCKED } from '@utils/account-actions';
import { HOME_TABS, MORE_TABS } from './ios-test-helpers';

/**
 * Glue for the iOS account tests (real files, real switches). Nothing here sends an OTP, logs
 * in, signs out or resets a password by itself: the specs do, inside their gated tests, and
 * the cleanup below can only return the app to guest state (and only when signing out is
 * authorized). Not a spec file: no tests here.
 */

/** The Individual account is excluded from iOS automation (QA owner's decision). */
export const INDIVIDUAL_EXCLUDED_REASON =
  'The Individual account is excluded from iOS automation by the QA owner; no Individual test is run.';

export { RUN_ID, accountJournal, appStateMarker, accountContext };

/** Whether the .env password is known to be the account's current one (see action-guard.ts). */
export const baselineEstablishedNow = () =>
  accountJournal.baselineEstablished() || currentPasswordVerified(ACCOUNT_TEST_POLICY);

/** Why each kind of account test is blocked now (undefined = every precondition holds). */
export const UNREGISTERED_LOGIN_PROBLEM = accountRunProblem('unregistered-login', accountContext());
export const UNREGISTERED_OTP_PROBLEM = accountRunProblem(
  'unregistered-otp-request',
  accountContext(),
);
export const LOGIN_PROBLEM = accountRunProblem('login', accountContext());

/**
 * The part of a chain that the recorded policy allows (see effectiveChain), minus the steps that need iOS
 * OTP-screen text nobody has recorded yet (see chain-plan.ts). Those stay declared as pending tests.
 */
export function chainEffective(id: OtpChainId): ChainPlan {
  return planWithScreenText(effectiveChain(id), chainDefinition(id).language);
}
export const chainProblem = (id: OtpChainId) =>
  accountRunProblem(chainEffective(id).kind, accountContext(id));

/** The blockers of a run kind, as report causes (policy and authorization). */
export function runCauses(kind: AccountRunKind, chainId?: OtpChainId): Causes {
  return causesOf(accountRunBlockers(kind, accountContext(chainId)));
}
export function causesOf(blockers: readonly Blocker[]): Causes {
  const join = (category: Blocker['category']) => {
    const messages = blockers.filter((b) => b.category === category).map((b) => b.message);
    return messages.length ? messages.join(' | ') : undefined;
  };
  return { policy: join('policy-blocked'), authorization: join('authorization-blocked') };
}

/**
 * The single-use permit for ONE OTP-path request (see otp-permit.ts). Throws unless every
 * authorization for the run kind holds right now. Call it inside the test, just before the request.
 */
export function issueOtpPermit(
  kind: AccountRunKind,
  scenario: string,
  phone: string,
  chainId?: OtpChainId,
): OtpRequestPermit {
  return issueOtpRequestPermit({
    kind,
    scenario,
    phone,
    target: kind === 'unregistered-otp-request' ? 'unregistered' : 'registered',
    deps: { ctx: accountContext(chainId), ledgerDir: ACCOUNT_STATE_DIR, runId: RUN_ID },
  });
}

/** The app accepted the chain's valid OTP: resets the count of requests made without one. */
export function markValidOtpEntered(chainId: OtpChainId): void {
  recordValidOtpEntered({
    scenario: chainId,
    target: 'registered',
    deps: { ledgerDir: ACCOUNT_STATE_DIR, runId: RUN_ID },
  });
}

const chains = new Map<OtpChainId, OtpChain>();

/**
 * The one OtpChain object of this process for `id` (one OTP request per chain, ever). It holds
 * only the steps the recorded policy allows, so no OTP is spent on a step that cannot run.
 */
export function chainFor(id: OtpChainId): OtpChain {
  let chain = chains.get(id);
  if (!chain) {
    const effective = chainEffective(id);
    chain = new OtpChain(
      {
        ...chainDefinition(id),
        steps: effective.steps,
        resetsPassword: effective.kind === 'otp-reset-chain',
      },
      (def) => appendOtpLedger(ACCOUNT_STATE_DIR, def, RUN_ID, new Date()),
    );
    chains.set(id, chain);
  }
  return chain;
}

/**
 * After a resetting chain's cleanup confirmed the guest state: the reset (to the known baseline
 * password) is complete, so its journal entry is restored. Only an 'applied' entry of this run is
 * touched; a 'pending' one (the save may or may not have happened) stays open for the QA owner.
 */
export function markResetRestored(): void {
  const entry = accountJournal.openEntries().find((e) => e.runId === RUN_ID);
  if (entry?.state === 'applied') {
    accountJournal.mark(
      RUN_ID,
      'restored',
      'Guest state confirmed; the password is the baseline from .env.',
    );
  }
}

/**
 * Runs a series of INVALID password attempts under the recovery journal (see attempt-guard.ts): journaled
 * before the first one, closed as "unchanged" only after `run` proved nothing was saved, and left open
 * ("a password may have been saved") whenever it did not. The real journal and run id.
 */
export function withPasswordAttemptJournal(
  phone: string,
  what: string,
  run: () => Promise<void>,
): Promise<void> {
  return guardPasswordAttempts({ journal: accountJournal, runId: RUN_ID, phone, what, run });
}

/** Guest-state checks for the screens: More shows the guest prompt only while signed out. */
export function guestStateDeps(
  appShell: IosAppShellScreen,
  accountScreen: IosAccountScreen,
): GuestStateDeps {
  return {
    logoutAuthorized: !LOGOUT_BLOCKED,
    isGuest: async () => {
      const current = await appShell.waitUntilReady(HOME_TABS, 30_000);
      await appShell.openMore(MORE_TABS[current], HOME_TABS[current]);
      return appShell.waitUntilMoreDisplayed(iosAppText(current).guestPrompt, 8_000);
    },
    logout: async () => {
      const current = await appShell.waitUntilReady(HOME_TABS, 30_000);
      const text = iosAppText(current);
      await accountScreen.logout(text.logoutConfirm, text.logoutBack);
    },
  };
}

/** Start of an account test: the app must be in guest state (signs out only if authorized). */
export async function requireGuestAtStart(
  appShell: IosAppShellScreen,
  accountScreen: IosAccountScreen,
): Promise<void> {
  const result = await guestStateAtStart(guestStateDeps(appShell, accountScreen), appStateMarker);
  if (!result.ok) throw new Error(`Not in guest state (${result.reason}): ${result.detail}`);
}

/**
 * After an account test, pass or fail: relaunch the app and return it to guest state. A failure
 * writes the marker that blocks the next account run, and fails the test.
 */
export async function cleanupAccountState(
  driver: AppRestarter,
  iosConfig: IosConfig,
  appShell: IosAppShellScreen,
  accountScreen: IosAccountScreen,
  /** True only for a chain whose own reset signs the app in: then a signed-in app is expected. */
  options: { signInExpected?: boolean } = {},
): Promise<void> {
  await restartIosApp(driver, iosConfig);
  const result = await cleanupAfterAccountTest(
    guestStateDeps(appShell, accountScreen),
    appStateMarker,
  );
  // Stronger confirmation after invalid attempts, with no extra request: a save that came back LATE would have
  // signed the app in. Finding it signed in when no reset was expected is recorded as open evidence.
  const wasSignedIn =
    (result.ok && result.action === 'logged-out') ||
    (!result.ok && result.reason === 'not-guest-logout-not-authorized');
  if (wasSignedIn && !options.signInExpected) {
    try {
      accountJournal.recordLateSignIn(RUN_ID);
    } catch {
      // The marker (written by the cleanup) already blocks the next run when the sign-out was not allowed.
    }
  }
  if (!result.ok) throw new Error(`Cleanup failed (${result.reason}): ${result.detail}`);
}

/**
 * Whether the account is signed in right now: More shows no guest prompt. Opens More first, so it can be
 * called from any tab. Signed out = the guest prompt is shown (the verified signed-out state).
 */
export async function isSignedInNow(
  appShell: IosAppShellScreen,
  text: { tabs: { more: string; home: string }; guestPrompt: string },
): Promise<boolean> {
  await appShell.openMore(text.tabs.more, text.tabs.home);
  return !(await appShell.guestPrompt(text.guestPrompt).isExisting());
}
