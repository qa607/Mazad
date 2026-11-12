import {
  type AccountTestPolicy,
  accountPolicyProblem,
  accountPolicyProblems,
  ACCOUNT_TEST_POLICY,
  currentPasswordVerified,
  type PolicySet,
  REUSE_FACT_NAME,
} from '../../../../config/ios-account-policy';
import { type OtpChainId, chainDefinition, STEP } from './otp-chain';
import { AppStateMarker, RecoveryJournal } from './recovery-journal';

/**
 * Whether an iOS account test may run. Evaluated when a spec file loads, so a blocked test runs
 * no hook, no fixture and no app action. Nothing here enables a switch, reads a secret value,
 * sends an OTP, logs in or resets a password.
 *
 * A run kind needs the UNION of the policy fact sets that apply to it (RUN_KIND_SETS) AND its
 * explicit approval switches (SWITCHES). Policy facts being recorded is never an authorization:
 * only the switches, which the QA owner sets by hand for a run, authorize an action.
 *
 * Order (the first problem is returned):
 * 1. the applicable backend facts, recovery process and test account are recorded and approved;
 * 2. the account's variables exist in .env (names only are checked and reported);
 * 3. no recovery journal entry is open and the app is not marked "not guest";
 * 4. chain and negative-test approvals (OTP chains only);
 * 5. the explicit approval switches for exactly this kind of run are on.
 */
export type AccountRunKind =
  | 'unregistered-login'
  | 'unregistered-otp-request'
  | 'login'
  | 'otp-flow-chain'
  | 'otp-reset-chain'
  | 'negative-chain'
  // The three kinds below belong only to the one-time registration -> forgot password -> login
  // journey (its own QA-owner switch, IOS_ALLOW_REGISTRATION_E2E_JOURNEY). They are deliberately
  // NOT unioned with 'otp-request'/'otp-validation': those backend facts (config/ios-account-policy.ts)
  // are unrecorded (null) and that file is kept unchanged, so requiring them would make this journey
  // permanently unrunnable. The journey only ever sends one OTP and enters it once immediately (no
  // cooldown/resend/attempt-limit assertions), so those facts would not gate anything this journey does.
  | 'registration-otp-request'
  | 'registration-password-reset'
  | 'registration-login';

/** Why a run is blocked, by the category the test report uses. */
export type BlockerCategory = 'policy-blocked' | 'authorization-blocked';
export interface Blocker {
  category: BlockerCategory;
  message: string;
}

export interface AccountRunContext {
  /** Approval switches (process.env). Credentials are never read from here. */
  env: NodeJS.ProcessEnv;
  policy: AccountTestPolicy;
  /** Names of the given .env variables that are missing. Values never leave .env. */
  missingLocalEnv: (names: readonly string[]) => string[];
  journal: RecoveryJournal;
  marker: AppStateMarker;
  chainId?: OtpChainId;
  exists?: (file: string) => boolean;
  /** The current time (approval dates must not be in the future); selfchecks pass their own. */
  now?: Date;
}

const DEALER_VARIABLES = [
  'IOS_TEST_DEALER_ID',
  'IOS_TEST_DEALER_PHONE',
  'IOS_TEST_DEALER_PASSWORD',
] as const;

/**
 * The independent policy fact sets each kind requires (union). Inspection of the code behind each
 * kind (this commit): a login is phone + password + Log In on every platform (no OTP step), so its
 * applicable backend facts are the lock rules (login set) and the recovery procedure (always).
 * An action the app shows after a login that this code does not handle (for example an updated-terms
 * gate) is never accepted automatically: the test fails instead.
 */
export const RUN_KIND_SETS: Record<AccountRunKind, readonly PolicySet[]> = {
  'unregistered-login': ['always', 'login'],
  'unregistered-otp-request': ['always', 'otp-request'],
  login: ['always', 'login'],
  'otp-flow-chain': ['always', 'otp-request', 'otp-validation'],
  'negative-chain': ['always', 'otp-request', 'otp-validation', 'otp-negative', 'login'],
  'otp-reset-chain': ['always', 'otp-request', 'otp-validation', 'login', 'password-reset'],
  'registration-otp-request': ['always'],
  'registration-password-reset': ['always'],
  'registration-login': ['always', 'login'],
};

/** The approval switches each kind needs (all must be exactly "true"). */
export const SWITCHES: Record<AccountRunKind, readonly string[]> = {
  'unregistered-login': ['IOS_ALLOW_ACCOUNT_ACTIONS'],
  // An OTP-path request is an OTP request wherever the number comes from.
  'unregistered-otp-request': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
  // A login ends signed in, so the run also needs the right to sign out again.
  login: ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_LOGOUT'],
  'otp-flow-chain': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
  'otp-reset-chain': [
    'IOS_ALLOW_ACCOUNT_ACTIONS',
    'MAZAD_ALLOW_OTP_REQUESTS',
    'IOS_ALLOW_PASSWORD_RESET',
    'MAZAD_ALLOW_PASSWORD_RESET',
    // The reset may sign the app in; cleanup must be allowed to sign it out again.
    'MAZAD_ALLOW_LOGOUT',
  ],
  'negative-chain': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
  // The registration E2E journey: one dedicated switch, separate from every permit above, scoped
  // only to the account this journey creates for itself.
  'registration-otp-request': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'IOS_ALLOW_REGISTRATION_E2E_JOURNEY'],
  'registration-password-reset': [
    'IOS_ALLOW_ACCOUNT_ACTIONS',
    'IOS_ALLOW_REGISTRATION_E2E_JOURNEY',
  ],
  'registration-login': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'IOS_ALLOW_REGISTRATION_E2E_JOURNEY'],
};

/** The kinds allowed to submit a login (the Log In button): see action-guard.ts. */
export const LOGIN_KINDS: readonly AccountRunKind[] = [
  'unregistered-login',
  'login',
  'registration-login',
];
/** The kinds allowed to submit an OTP for verification (the Verify button). */
export const OTP_VALIDATION_KINDS: readonly AccountRunKind[] = [
  'otp-flow-chain',
  'otp-reset-chain',
  'negative-chain',
  'registration-otp-request',
  'registration-password-reset',
];
/** An invalid new password may be tried by chains that stop before saving, or by a reset chain. */
export const PASSWORD_ATTEMPT_KINDS: readonly AccountRunKind[] = [
  'otp-flow-chain',
  'otp-reset-chain',
  'registration-password-reset',
];
/** Only a reset chain, or the registration journey's own reset step, may SAVE a new password. */
export const PASSWORD_SAVE_KINDS: readonly AccountRunKind[] = [
  'otp-reset-chain',
  'registration-password-reset',
];

/** The kinds that can send an OTP: only these may be issued an OTP request permit. */
export const OTP_REQUEST_KINDS: readonly AccountRunKind[] = [
  'unregistered-otp-request',
  'otp-flow-chain',
  'otp-reset-chain',
  'negative-chain',
  'registration-otp-request',
  'registration-password-reset',
];

/** The kind a chain is DECLARED as (all its steps). See effectiveChain for what can run. */
export function chainRunKind(chainId: OtpChainId): AccountRunKind {
  const def = chainDefinition(chainId);
  if (def.kind === 'negative') return 'negative-chain';
  return def.resetsPassword ? 'otp-reset-chain' : 'otp-flow-chain';
}

/**
 * How much longer than the cooldown the recorded OTP lifetime must be before the suite waits the cooldown
 * out on the OTP screen (so the code cannot lapse during the wait). A margin of THIS SUITE, not a backend value.
 */
export const RESEND_WAIT_MARGIN_SECONDS = 120;
/**
 * The shortest recorded cooldown this suite observes from the OTP screen (a suite value, not a backend one). The
 * observation runs a few steps after the request (page-source evidence, the heading wait, the layout check), so
 * a short cooldown could be over before it is read.
 */
export const RESEND_OBSERVE_MIN_SECONDS = 45;

/** What the "rejected password" scenario may try, or why it cannot run (nothing is guessed). */
export interface RejectedPasswordPlan {
  /**
   * Try the account's current password as the new one: only when reuse is CONFIRMED not allowed AND the QA owner
   * recorded that the .env password IS the account's current one. Otherwise the .env value is not necessarily the
   * current password, and typing it would not test reuse (it could simply be saved).
   */
  currentPassword: boolean;
  /** The new passwords the backend owner confirmed the backend rejects. */
  examples: readonly string[];
  /** Set when there is nothing to try; the scenario is then excluded with this reason. */
  problem?: string;
}

export function rejectedPasswordPlan(
  policy: AccountTestPolicy = ACCOUNT_TEST_POLICY,
  exists?: (file: string) => boolean,
  now?: Date,
): RejectedPasswordPlan {
  const none = (problem: string): RejectedPasswordPlan => ({
    currentPassword: false,
    examples: [],
    problem,
  });
  const boundary = accountPolicyProblems(policy, exists, now, ['password-boundary']);
  if (boundary.length) return none(`X1 is not confirmed: ${boundary.join('; ')}`);
  if (policy.passwordRules.violationShownOnSameScreen?.value !== true) {
    return none(
      'the confirmed violation behaviour is not "shown on the same screen"; the scenario needs rewriting',
    );
  }
  // Only the reuse fact matters here (not X2 or X3): reuse CONFIRMED not allowed makes the current password a
  // password the backend rejects.
  const reuseUnconfirmed = accountPolicyProblems(policy, exists, now, ['password-reset']).some(
    (problem) => problem.startsWith(REUSE_FACT_NAME),
  );
  const currentPassword =
    !reuseUnconfirmed &&
    policy.passwordRules.reuseOfCurrentAllowed?.value === false &&
    currentPasswordVerified(policy, now);
  const examplesRecorded =
    accountPolicyProblems(policy, exists, now, ['password-examples']).length === 0;
  const examples = examplesRecorded ? (policy.passwordRules.rejectedExamples?.value ?? []) : [];
  if (!currentPassword && examples.length === 0) {
    return none(
      'no rejected password is confirmed: the current password is not confirmed as rejected (reuse not confirmed as refused, or the .env password not recorded as the current one), and no rejected examples are recorded',
    );
  }
  return { currentPassword, examples };
}

export interface EffectiveChain {
  kind: AccountRunKind;
  /** The steps that may run, in order. */
  steps: readonly string[];
  /** Declared steps left out, with the reason (they are reported as policy-blocked). */
  excluded: { step: string; reason: string }[];
}

/**
 * The part of a chain that the recorded policy allows. The base steps (OTP step, empty OTP,
 * correct OTP, empty new password) never depend on the password rules. The below-minimum step
 * needs the X1 boundary facts and the reset step needs the X1 reuse, X2 and X3 facts; a step whose
 * facts are not recorded is left out (it stays a declared, blocked test) and the chain's OTP is not
 * spent on it. The reset step also needs `reuseOfCurrentAllowed` to be true: a reset to the
 * baseline password is only run when reuse is confirmed allowed (a different-password reset is a
 * separate future scenario that is not implemented).
 */
export function effectiveChain(
  chainId: OtpChainId,
  policy: AccountTestPolicy = ACCOUNT_TEST_POLICY,
  exists?: (file: string) => boolean,
  now?: Date,
): EffectiveChain {
  const def = chainDefinition(chainId);
  const excluded: EffectiveChain['excluded'] = [];
  const steps = def.steps.filter((step) => {
    if (step === STEP.shortPassword) {
      const missing = accountPolicyProblems(policy, exists, now, ['password-boundary']);
      const min = policy.passwordRules?.minLength?.value;
      const reason = missing.length
        ? `X1 is not confirmed: ${missing.join('; ')}`
        : typeof min !== 'number' || min < 2
          ? 'the confirmed minimum leaves no non-empty password below it to test'
          : policy.passwordRules.violationShownOnSameScreen?.value !== true
            ? 'the confirmed violation behaviour is not "shown on the same screen"; the scenario needs rewriting'
            : undefined;
      if (reason) excluded.push({ step, reason });
      return !reason;
    }
    if (step === STEP.resendBlocked || step === STEP.resendOffered) {
      // Reading the OTP screen while the cooldown runs, and after it: needs the recorded cooldown, and the
      // wait must not outlast the code. No OTP request is made by either step.
      const missing = accountPolicyProblems(policy, exists, now, ['otp-request', 'otp-validation']);
      const cooldown = policy.otp?.cooldownSeconds?.value;
      const lifetime = policy.otp?.lifetimeSeconds?.value;
      const reason = missing.length
        ? `the OTP cooldown and lifetime are not confirmed: ${missing.join('; ')}`
        : typeof cooldown !== 'number' || cooldown < RESEND_OBSERVE_MIN_SECONDS
          ? `the recorded OTP cooldown is shorter than the ${RESEND_OBSERVE_MIN_SECONDS} seconds this suite needs to observe it (a margin of this suite)`
          : step === STEP.resendOffered &&
              (typeof lifetime !== 'number' || lifetime < cooldown + RESEND_WAIT_MARGIN_SECONDS)
            ? `waiting out the cooldown needs the recorded OTP lifetime to exceed it by ${RESEND_WAIT_MARGIN_SECONDS} seconds (a margin of this suite), so the code cannot lapse`
            : undefined;
      if (reason) excluded.push({ step, reason });
      return !reason;
    }
    if (step === STEP.rejectedPassword) {
      const reason = rejectedPasswordPlan(policy, exists, now).problem;
      if (reason) excluded.push({ step, reason });
      return !reason;
    }
    if (step === STEP.completeReset) {
      const missing = accountPolicyProblems(policy, exists, now, ['password-reset']);
      const reason = missing.length
        ? `X1, X2 and X3 are not confirmed: ${missing.join('; ')}`
        : policy.passwordRules.reuseOfCurrentAllowed?.value !== true
          ? 'a reset to the baseline password needs the confirmed rule that the current password may be reused'
          : undefined;
      if (reason) excluded.push({ step, reason });
      return !reason;
    }
    return true;
  });
  const kind: AccountRunKind =
    def.kind === 'negative'
      ? 'negative-chain'
      : steps.includes(STEP.completeReset)
        ? 'otp-reset-chain'
        : 'otp-flow-chain';
  return { kind, steps, excluded };
}

/** Every reason the run is blocked, in the order of the checks (empty = nothing blocks it). */
export function accountRunBlockers(kind: AccountRunKind, ctx: AccountRunContext): Blocker[] {
  const blockers: Blocker[] = [];
  const add = (category: BlockerCategory, message: string | undefined) => {
    if (message) blockers.push({ category, message });
  };

  add('policy-blocked', accountPolicyProblem(ctx.policy, ctx.exists, ctx.now, RUN_KIND_SETS[kind]));

  const REGISTRATION_JOURNEY_KINDS: readonly AccountRunKind[] = [
    'registration-otp-request',
    'registration-password-reset',
    'registration-login',
  ];
  const needsDealer =
    kind !== 'unregistered-login' &&
    kind !== 'unregistered-otp-request' &&
    !REGISTRATION_JOURNEY_KINDS.includes(kind);
  const needsOtp = kind.endsWith('-chain');
  const missing = ctx.missingLocalEnv([
    ...(needsDealer ? DEALER_VARIABLES : []),
    ...(needsOtp ? (['OTP_CODE'] as const) : []),
  ]);
  if (missing.length) {
    add(
      'authorization-blocked',
      `Blocked: add ${missing.join(', ')} to the local .env file (credentials are read from .env only).`,
    );
  }

  add('authorization-blocked', ctx.journal.problem());
  add('authorization-blocked', ctx.marker.problem());

  if (needsOtp) {
    const chainId = ctx.chainId;
    if (!chainId) {
      add('authorization-blocked', 'Blocked: an OTP chain run needs its chain id.');
    } else {
      if (!ctx.policy.approvedOtpChains?.ids.includes(chainId)) {
        add(
          'authorization-blocked',
          `Blocked: OTP chain "${chainId}" is not approved (config/ios-account-policy.ts approvedOtpChains).`,
        );
      }
      if (kind === 'negative-chain' && ctx.policy.negativeCredentialTests?.value !== true) {
        add(
          'authorization-blocked',
          'Blocked: incorrect-OTP / wrong-password tests (account-lock risk) are not approved (negativeCredentialTests).',
        );
      }
    }
  }

  const off = SWITCHES[kind].filter((name) => ctx.env[name] !== 'true');
  if (off.length) {
    add(
      'authorization-blocked',
      `Blocked: not approved for this run: ${off.join(', ')}. Ask the QA owner first.`,
    );
  }
  return blockers;
}

/** The first reason the run is blocked, or undefined when every precondition holds. */
export function accountRunProblem(
  kind: AccountRunKind,
  ctx: AccountRunContext,
): string | undefined {
  return accountRunBlockers(kind, ctx)[0]?.message;
}

export { ACCOUNT_TEST_POLICY };
