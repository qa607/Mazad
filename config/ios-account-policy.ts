import fs from 'node:fs';
import path from 'node:path';
import { OTP_CHAINS, type OtpChainId } from '../src/mobile/ios/account/otp-chain';

/**
 * What must be on record before ANY iOS account test (login, unregistered-number submissions,
 * OTP chains, password reset) may run. Everything below is empty (`null`) on purpose: the
 * backend's behavior is NOT known or approved yet, and no default, threshold or assumption is
 * invented for any of it. `null`, a missing field, an invalid value, an unexplained "unknown" or
 * an unapproved record all keep every account test blocked.
 *
 * Only the QA owner fills this in, in code review, from the backend team's written answer. Every
 * required value is a record of its own: the value, where it comes from (`source`), who approved
 * it (`approval.by`) and when (`approval.on`, YYYY-MM-DD, not in the future). A backend fact that
 * is a plain yes or no is recorded as true or false, so "the backend does not do this" is still a
 * recorded, approved fact; "we do not know" is `null`.
 *
 * While anything is missing, `accountPolicyProblem()` names it and every account test is skipped
 * when its spec file loads (no hook, no fixture, no app action).
 */
export interface Approval {
  /** Who approved it (name or role), non-empty. */
  by: string;
  /** Date of the approval, YYYY-MM-DD. */
  on: string;
}

export interface Provenance {
  /** Where the value comes from (e.g. the backend team's written answer), non-empty. */
  source: string;
  approval: Approval;
}

/** One required value with its source and approval. */
export type Fact<T> = Provenance & { value: T };

/** Whether a limit applies to a scope; `not-applicable` when the scope does not exist. */
export type ScopeFlag = boolean | 'not-applicable';

export interface LimitScope {
  perAccount: ScopeFlag;
  perIp: ScopeFlag;
  perDevice: ScopeFlag;
  perUnregisteredNumber: ScopeFlag;
}

export interface OtpPolicy {
  /** Most OTP requests allowed within `windowMinutes`. */
  maxRequests: Fact<number> | null;
  windowMinutes: Fact<number> | null;
  /** Minimum interval between two requests, in seconds (0 = no minimum interval). */
  cooldownSeconds: Fact<number> | null;
  /** What the request limit is counted per (account, IP, device, unregistered number). */
  limitScope: Fact<LimitScope> | null;
  /** Verification attempts allowed per OTP code. */
  /** Attempts allowed per code, or 'unlimited' when the backend states there is no limit. */
  verificationAttemptsPerCode: Fact<number | 'unlimited'> | null;
  /** Whether one incorrect attempt invalidates the code. */
  incorrectOtpInvalidatesCode: Fact<boolean> | null;
  /** How long an OTP code stays valid, in seconds. */
  lifetimeSeconds: Fact<number> | null;
  /** Whether the fixed staging OTP (OTP_CODE) follows the same rules as a real code. */
  fixedOtpFollowsSameRules: Fact<boolean> | null;
  /** Whether staging really sends an SMS (a real person could receive it). */
  stagingSendsRealSms: Fact<boolean> | null;
}

export interface LoginPolicy {
  /** Failed login attempts that trigger a lock. */
  /** Failed logins that trigger a lock, or 'none' when failed logins never lock. */
  failureThreshold: Fact<number | 'none'> | null;
  /** The window those failures are counted in, in minutes. */
  countingWindowMinutes: Fact<number> | null;
  /** How long an account stays locked, in minutes, or `until-manual-unlock`. */
  lockDuration: Fact<number | 'until-manual-unlock'> | null;
  /** Whether wrong OTP attempts count toward an account lock. */
  wrongOtpCountsTowardLock: Fact<boolean> | null;
}

export interface RecoveryPolicy {
  /** The approved recovery and unlock procedure: an existing docs/*.md file. */
  procedure: Fact<{ documentedIn: string }> | null;
}

/** Evidence that the account is synthetic and dedicated; every item must be true. */
export interface TestAccountConfirmations {
  /** The back-office record was checked (ID, role, status, created date). */
  backOfficeRecordChecked: boolean;
  /** The phone number is a QA-controlled line: an OTP cannot reach a real person. */
  phoneIsQaControlled: boolean;
  /** No real person, company, KYC document, bid, payment or auction is linked to it. */
  noRealCustomerData: boolean;
  /** Only iOS automation uses it (never shared in parallel with other suites). */
  usedOnlyByAutomation: boolean;
  /** The recovery route (see `recovery.procedure`) was confirmed for this account. */
  recoveryRouteConfirmed: boolean;
}

export type TestAccountPolicy = Provenance & {
  role: 'dealer';
  confirmedSyntheticAndDedicated: boolean;
  confirmations: TestAccountConfirmations;
  /**
   * OPTIONAL. The QA owner's recorded statement that IOS_TEST_DEALER_PASSWORD in .env IS the account's
   * CURRENT password (verified by the owner, for example because it was set on the account). Without
   * it, a Dealer login is only allowed after a completed reset to the baseline is on record. Never
   * assumed, never inferred from a password the owner mentioned: it needs its own value, source and
   * approval. It does not change the account's password.
   */
  currentPasswordVerified?: Fact<boolean>;
};

/** The backend facts that may be recorded, or explicitly accepted as unrecorded by the QA owner. */
export const BACKEND_FACT_KEYS = [
  'otp.maxRequests',
  'otp.windowMinutes',
  'otp.cooldownSeconds',
  'otp.limitScope',
  'otp.verificationAttemptsPerCode',
  'otp.incorrectOtpInvalidatesCode',
  'otp.lifetimeSeconds',
  'otp.fixedOtpFollowsSameRules',
  'otp.stagingSendsRealSms',
  'login.failureThreshold',
  'login.countingWindowMinutes',
  'login.lockDuration',
  'login.wrongOtpCountsTowardLock',
  'recovery.procedure',
] as const;
export type BackendFactKey = (typeof BACKEND_FACT_KEYS)[number];

/** Supplementary X1 facts (not among the 14 register items): the backend's new-password rules. */
export interface PasswordRulesPolicy {
  /** Minimum length of a new password, in characters (never taken from the website). */
  minLength: Fact<number> | null;
  /** Whether a new password may equal the account's current password. */
  reuseOfCurrentAllowed: Fact<boolean> | null;
  /** Whether a rule violation is shown on the same screen (the step is not left). */
  violationShownOnSameScreen: Fact<boolean> | null;
  /**
   * OPTIONAL. New passwords (besides the one below the minimum length) that the backend owner CONFIRMED the
   * backend rejects, each leaving the new-password step on screen with nothing saved. Test inputs only; never
   * guessed, never copied from another platform. Needs its own source and approval like every fact.
   */
  rejectedExamples?: Fact<readonly string[]> | null;
}

/** Supplementary X2 and X3 facts (not among the 14 register items), for the iOS app on staging. */
export interface PasswordResetPolicy {
  /** X2(a): whether the app is signed in automatically after a successful reset. */
  signsInAutomatically: Fact<boolean> | null;
  /** X3: whether resets are subject to limits beyond the OTP limits. */
  resetLimitsEnforced: Fact<boolean> | null;
}

export interface AccountTestPolicy {
  /**
   * ALWAYS `null`: no unknown fact is ever accepted as a risk (QA owner, 2026-11-09). Any other
   * value is itself a blocking problem, so the field cannot be used to skip a required fact.
   */
  acceptedUnrecordedFacts: null;
  otp: OtpPolicy;
  login: LoginPolicy;
  recovery: RecoveryPolicy;
  /** X1 (supplementary). Required only by the scenarios that rest on password rules. */
  passwordRules: PasswordRulesPolicy;
  /** X2 and X3 (supplementary). Required only by the password-reset scenario. */
  passwordReset: PasswordResetPolicy;
  /** The confirmed, dedicated, synthetic dealer test account, with the QA owner's approval. */
  testAccount: TestAccountPolicy | null;
  /** The OTP chains the QA owner approved, one OTP request each. `null` = none approved. */
  approvedOtpChains: (Provenance & { ids: readonly OtpChainId[] }) | null;
  /** Incorrect-OTP and wrong-password tests (account-lock risk). `null` = not approved. */
  negativeCredentialTests: Fact<boolean> | null;
}

export const ACCOUNT_TEST_POLICY: AccountTestPolicy = {
  // No unknown backend fact is accepted as a risk: every item below must be recorded, with its
  // source and approval, before an account test may run. (QA owner, 2026-11-09: unknown limits
  // are not to be marked as accepted risks.) The Web and Android suites record none of them either.
  acceptedUnrecordedFacts: null,
  otp: {
    maxRequests: null,
    windowMinutes: null,
    cooldownSeconds: null,
    limitScope: null,
    verificationAttemptsPerCode: null,
    incorrectOtpInvalidatesCode: null,
    lifetimeSeconds: null,
    fixedOtpFollowsSameRules: null,
    stagingSendsRealSms: null,
  },
  login: {
    // Q10, USER-PROVIDED by the QA owner (not a verified backend statement; no backend source, person or
    // date is claimed): failed logins never lock the account and there is no limit on login attempts.
    failureThreshold: {
      value: 'none',
      source:
        'User-provided answer from the QA owner, not a verified backend statement: failed login attempts never lock the account; no limit on login attempts',
      approval: { by: 'QA owner', on: '2026-11-09' },
    },
    countingWindowMinutes: null,
    lockDuration: null,
    wrongOtpCountsTowardLock: null,
  },
  recovery: { procedure: null },
  passwordRules: {
    minLength: null,
    reuseOfCurrentAllowed: null,
    violationShownOnSameScreen: null,
    rejectedExamples: null,
  },
  passwordReset: { signsInAutomatically: null, resetLimitsEnforced: null },
  // Dealer <selected-dealer-id>: recorded from the QA owner's OWN statements (user-provided; no backend source, person or
  // date other than the day they were given is claimed). The recovery-route confirmation covers the
  // Login/Logout milestone only (failed logins never lock, Q10); recovering from an OTP block (Q12) stays
  // unresolved and is NOT covered: the OTP flows still require the recovery procedure fact.
  testAccount: {
    role: 'dealer',
    confirmedSyntheticAndDedicated: true,
    confirmations: {
      backOfficeRecordChecked: true,
      phoneIsQaControlled: true,
      noRealCustomerData: true,
      usedOnlyByAutomation: true,
      recoveryRouteConfirmed: true,
    },
    source:
      'User-provided statements from the QA owner, not verified backend statements: the QA owner created Dealer <selected-dealer-id> specifically for testing, confirmed its phone is QA-controlled and intended for testing, and approved it for the staging iOS automation. Back-office record viewed read-only. Recovery route: Login/Logout only (OTP recovery, Q12, unresolved)',
    approval: { by: 'QA owner', on: '2026-11-09' },
    // The QA owner states that the password supplied for this account is its current password.
    currentPasswordVerified: {
      value: true,
      source:
        'User-provided statement from the QA owner, not a verified backend statement: the password supplied for Dealer <selected-dealer-id> is its current password',
      approval: { by: 'QA owner', on: '2026-11-09' },
    },
  },
  approvedOtpChains: null,
  negativeCredentialTests: null,
};

const ROOT = path.resolve(__dirname, '..');
/** Words that look like an answer but record none: they never count as a source or approver. */
const PLACEHOLDER = /^(unknown|tbd|todo|n\/?a|none|null|undefined|-+|\?+|\.+)$/i;
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !PLACEHOLDER.test(value.trim());
const isDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(Date.parse(`${value}T00:00:00Z`)).toISOString().startsWith(value);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function provenanceProblems(name: string, record: unknown, now: Date): string[] {
  const problems: string[] = [];
  const source = isObject(record) ? record.source : undefined;
  const approval = isObject(record) && isObject(record.approval) ? record.approval : undefined;
  if (!text(source)) problems.push(`${name}: source is missing or a placeholder`);
  if (!approval || !text(approval.by))
    problems.push(`${name}: approval.by is missing or a placeholder`);
  if (!approval || !isDate(approval.on)) {
    problems.push(`${name}: approval.on must be a real date, YYYY-MM-DD`);
  } else if (Date.parse(`${approval.on}T00:00:00Z`) > now.getTime()) {
    problems.push(`${name}: approval.on is in the future`);
  }
  return problems;
}

const positiveInt = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? undefined : 'must be a positive integer';
const nonNegativeInt = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0
    ? undefined
    : 'must be a non-negative integer';
const bool = (v: unknown) => (typeof v === 'boolean' ? undefined : 'must be true or false');
const SCOPES = ['perAccount', 'perIp', 'perDevice', 'perUnregisteredNumber'] as const;
const scope = (v: unknown) => {
  if (!isObject(v)) return 'must record perAccount, perIp, perDevice and perUnregisteredNumber';
  const extra = Object.keys(v).filter((k) => !(SCOPES as readonly string[]).includes(k));
  if (extra.length) return `unknown scope(s) ${extra.join(', ')}`;
  const bad = SCOPES.filter((k) => !(v[k] === true || v[k] === false || v[k] === 'not-applicable'));
  if (bad.length) return `${bad.join(', ')} must be true, false or "not-applicable"`;
  return SCOPES.some((k) => v[k] === true)
    ? undefined
    : 'the limit must apply to at least one scope';
};
const positiveIntOr = (word: string) => (v: unknown) =>
  v === word ? undefined : positiveInt(v) ? `must be a positive integer or "${word}"` : undefined;
const rejectedExampleList = (v: unknown) => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 10) return 'must list 1 to 10 passwords';
  if (v.some((x) => typeof x !== 'string' || x.length === 0 || x.length > 64)) {
    return 'every example must be a non-empty string of at most 64 characters';
  }
  return new Set(v).size === v.length ? undefined : 'the examples must be distinct';
};
const lockDuration = (v: unknown) =>
  v === 'until-manual-unlock' || (typeof v === 'number' && Number.isInteger(v) && v > 0)
    ? undefined
    : 'must be a positive number of minutes or "until-manual-unlock"';

/** Problems of one required fact (missing, unknown fields, invalid value, missing provenance). */
function factProblems(
  name: string,
  fact: unknown,
  validate: (value: unknown) => string | undefined,
  now: Date,
): string[] {
  if (fact === null || fact === undefined) return [`${name} is not recorded`];
  if (!isObject(fact)) return [`${name}: not a valid record`];
  const problems: string[] = [];
  const extra = Object.keys(fact).filter((k) => !['value', 'source', 'approval'].includes(k));
  if (extra.length) problems.push(`${name}: unknown field(s) ${extra.join(', ')}`);
  const invalid = validate(fact.value);
  if (invalid) problems.push(`${name}: ${invalid}`);
  problems.push(...provenanceProblems(name, fact, now));
  return problems;
}

/**
 * The independent policy fact sets. A scenario requires the UNION of the sets that apply to it
 * (see `RUN_KIND_SETS` in src/mobile/ios/account/account-preflight.ts); passing a set never
 * authorizes an action (switches and the QA owner's run approval are separate, see the preflight).
 *
 * - always: the confirmed dedicated account and the valid approvals.
 * - login: failed-login lock rules (a login attempt can fail and count toward a lock).
 * - otp-request: what asking for an OTP is limited by, whether staging sends a real SMS, and how an OTP block
 *   is recovered (Q12; not needed by a Login/Logout run).
 * - otp-validation: what entering the OTP is limited by (validity, attempts, the fixed OTP).
 * - otp-negative: what a WRONG code does (cancels the code, counts toward a lock).
 * - password-boundary: X1 facts the below-minimum password scenario rests on.
 * - password-examples: the OPTIONAL confirmed rejected new-password examples (the rejected-password scenario).
 * - password-reset: X1 reuse, X2 post-reset state and X3 limits, for the reset scenario.
 */
export type PolicySet =
  | 'always'
  | 'login'
  | 'otp-request'
  | 'otp-validation'
  | 'otp-negative'
  | 'password-boundary'
  | 'password-examples'
  | 'password-reset';

/** The 14 backend facts (register items) are exactly these sets together. */
export const BACKEND_POLICY_SETS: readonly PolicySet[] = [
  'always',
  'login',
  'otp-request',
  'otp-validation',
  'otp-negative',
];

interface FactSpec {
  set: PolicySet;
  name: string;
  get: (policy: AccountTestPolicy) => unknown;
  validate: (v: unknown) => string | undefined;
  /** The fact is required only when this holds (e.g. no lock window when failed logins never lock). */
  applies?: (policy: AccountTestPolicy) => boolean;
}

const recoveryDocument =
  (exists: (file: string) => boolean) =>
  (v: unknown): string | undefined => {
    const doc = isObject(v) ? v.documentedIn : undefined;
    return typeof doc === 'string' &&
      /^docs\/[A-Za-z0-9._/-]+\.md$/.test(doc) &&
      !doc.includes('..') &&
      exists(path.join(ROOT, doc))
      ? undefined
      : 'documentedIn must be an existing docs/*.md file';
  };

/** The name (and message prefix) of the X1 reuse fact: the scenarios that read only this fact find it by it. */
export const REUSE_FACT_NAME = 'X1 new password may equal the current password';

/** One row per required fact, in the fixed reporting order. */
const factSpecs = (exists: (file: string) => boolean): FactSpec[] => [
  {
    set: 'otp-request',
    name: 'OTP maximum requests',
    get: (p) => p.otp?.maxRequests,
    validate: positiveInt,
  },
  {
    set: 'otp-request',
    name: 'OTP request window (minutes)',
    get: (p) => p.otp?.windowMinutes,
    validate: positiveInt,
  },
  {
    set: 'otp-request',
    name: 'OTP cooldown between requests (seconds)',
    get: (p) => p.otp?.cooldownSeconds,
    validate: nonNegativeInt,
  },
  { set: 'otp-request', name: 'OTP limit scope', get: (p) => p.otp?.limitScope, validate: scope },
  {
    set: 'otp-validation',
    name: 'OTP verification attempts per code',
    get: (p) => p.otp?.verificationAttemptsPerCode,
    validate: positiveIntOr('unlimited'),
  },
  {
    set: 'otp-negative',
    name: 'incorrect OTP invalidates the code',
    get: (p) => p.otp?.incorrectOtpInvalidatesCode,
    validate: bool,
  },
  {
    set: 'otp-validation',
    name: 'OTP lifetime (seconds)',
    get: (p) => p.otp?.lifetimeSeconds,
    validate: positiveInt,
  },
  {
    set: 'otp-validation',
    name: 'fixed staging OTP follows the same rules',
    get: (p) => p.otp?.fixedOtpFollowsSameRules,
    validate: bool,
  },
  {
    set: 'otp-request',
    name: 'staging sends real SMS',
    get: (p) => p.otp?.stagingSendsRealSms,
    validate: bool,
  },
  {
    set: 'login',
    name: 'login failure threshold',
    get: (p) => p.login?.failureThreshold,
    validate: positiveIntOr('none'),
  },
  {
    set: 'login',
    name: 'login failure counting window (minutes)',
    get: (p) => p.login?.countingWindowMinutes,
    applies: (p) => p.login?.failureThreshold?.value !== 'none',
    validate: positiveInt,
  },
  {
    set: 'login',
    name: 'account-lock duration',
    get: (p) => p.login?.lockDuration,
    applies: (p) => p.login?.failureThreshold?.value !== 'none',
    validate: lockDuration,
  },
  {
    set: 'otp-negative',
    name: 'wrong OTP attempts count toward account lock',
    get: (p) => p.login?.wrongOtpCountsTowardLock,
    validate: bool,
  },
  {
    // Q12 is about recovering from an OTP block, so it applies to the OTP flows only (QA owner decision
    // for the Login/Logout milestone). It stays unresolved and required for Forgot Password.
    set: 'otp-request',
    name: 'recovery and unlock procedure',
    get: (p) => p.recovery?.procedure,
    validate: recoveryDocument(exists),
  },
  {
    set: 'password-boundary',
    name: 'X1 minimum new-password length',
    get: (p) => p.passwordRules?.minLength,
    validate: positiveInt,
  },
  {
    set: 'password-boundary',
    name: 'X1 rule violation is shown on the same screen',
    get: (p) => p.passwordRules?.violationShownOnSameScreen,
    validate: bool,
  },
  {
    // Optional scenario input: only the "rejected password" step reads it (see effectiveChain).
    set: 'password-examples',
    name: 'X1 confirmed rejected new-password examples',
    get: (p) => p.passwordRules?.rejectedExamples,
    validate: rejectedExampleList,
  },
  {
    set: 'password-reset',
    name: REUSE_FACT_NAME,
    get: (p) => p.passwordRules?.reuseOfCurrentAllowed,
    validate: bool,
  },
  {
    set: 'password-reset',
    name: 'X2(a) app is signed in automatically after a reset (iOS)',
    get: (p) => p.passwordReset?.signsInAutomatically,
    validate: bool,
  },
  {
    set: 'password-reset',
    name: 'X3 password resets are subject to further limits',
    get: (p) => p.passwordReset?.resetLimitsEnforced,
    validate: bool,
  },
];

/**
 * Problems of the requested policy sets (default: the 14 backend facts and the account, as
 * before), in a fixed order. Empty = every requested item is recorded and approved. No fact can
 * be skipped: there is no accepted-risk route.
 */
export function accountPolicyProblems(
  policy: AccountTestPolicy = ACCOUNT_TEST_POLICY,
  exists: (file: string) => boolean = fs.existsSync,
  now: Date = new Date(),
  sets: readonly PolicySet[] = BACKEND_POLICY_SETS,
): string[] {
  const wanted = new Set<PolicySet>(sets);
  const problems: string[] = [];

  // Always, for every set: nothing may be recorded as an accepted unrecorded fact.
  if (policy.acceptedUnrecordedFacts !== null) {
    problems.push(
      'accepted unrecorded facts are not allowed: unknown backend facts are never accepted as a risk (acceptedUnrecordedFacts must be null)',
    );
  }

  for (const spec of factSpecs(exists)) {
    if (!wanted.has(spec.set)) continue;
    if (spec.applies && !spec.applies(policy)) continue;
    problems.push(...factProblems(spec.name, spec.get(policy), spec.validate, now));
  }

  if (wanted.has('always')) {
    const account = policy.testAccount;
    if (!account) {
      problems.push('the dedicated synthetic dealer test account is not confirmed');
    } else {
      if (account.role !== 'dealer' || account.confirmedSyntheticAndDedicated !== true) {
        problems.push('test account: must be confirmed synthetic and dedicated (dealer)');
      }
      const keys = [
        'backOfficeRecordChecked',
        'phoneIsQaControlled',
        'noRealCustomerData',
        'usedOnlyByAutomation',
        'recoveryRouteConfirmed',
      ] as const;
      const unconfirmed = keys.filter((k) => account.confirmations?.[k] !== true);
      if (unconfirmed.length) {
        problems.push(`test account: not confirmed: ${unconfirmed.join(', ')}`);
      }
      problems.push(...provenanceProblems('test account', account, now));
      if (account.currentPasswordVerified !== undefined) {
        problems.push(
          ...factProblems('current password verified', account.currentPasswordVerified, bool, now),
        );
      }
    }

    // Optional approvals: null means "none approved" and is not a problem by itself; a recorded
    // one must be valid, or it blocks everything.
    const chains = policy.approvedOtpChains;
    if (chains !== null && chains !== undefined) {
      const known = OTP_CHAINS.map((c) => c.id) as string[];
      const listed: readonly unknown[] = Array.isArray(chains.ids) ? chains.ids : [];
      const bad = listed.filter((id) => typeof id !== 'string' || !known.includes(id));
      if (!Array.isArray(chains.ids) || chains.ids.length === 0 || bad.length) {
        problems.push(
          `approved OTP chains: ids must be a non-empty list of known chain ids${bad.length ? ` (unknown: ${bad.map(String).join(', ')})` : ''}`,
        );
      }
      problems.push(...provenanceProblems('approved OTP chains', chains, now));
    }
    const negative = policy.negativeCredentialTests;
    if (negative !== null && negative !== undefined) {
      problems.push(...factProblems('negative credential tests approval', negative, bool, now));
    }
  }
  return problems;
}

/** One message, or undefined when the requested sets are complete. Never contains a secret. */
export function accountPolicyProblem(
  policy: AccountTestPolicy = ACCOUNT_TEST_POLICY,
  exists: (file: string) => boolean = fs.existsSync,
  now: Date = new Date(),
  sets: readonly PolicySet[] = BACKEND_POLICY_SETS,
): string | undefined {
  const problems = accountPolicyProblems(policy, exists, now, sets);
  return problems.length
    ? `Account tests are blocked until config/ios-account-policy.ts records and approves: ${problems.join('; ')}.`
    : undefined;
}

/**
 * Whether the policy holds a valid owner statement that the .env password is the account's current
 * password. False for a missing, malformed, unapproved or non-true record (fails closed).
 */
export function currentPasswordVerified(
  policy: AccountTestPolicy = ACCOUNT_TEST_POLICY,
  now: Date = new Date(),
): boolean {
  const record = policy.testAccount?.currentPasswordVerified;
  return (
    record !== undefined &&
    factProblems('current password verified', record, bool, now).length === 0 &&
    record.value === true
  );
}
