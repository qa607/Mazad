import {
  ACCOUNT_TEST_POLICY,
  type AccountTestPolicy,
  type Approval,
  type Fact,
} from '../../../config/ios-account-policy';

/**
 * A COMPLETE, valid account policy built only for the offline selfchecks. Every value is
 * made up for those tests and labeled as such; the real policy in config/ios-account-policy.ts
 * stays empty. Not used anywhere else.
 */
export const FIXTURE_NOW = new Date('2026-11-09T12:00:00Z');
export const fixtureApproval: Approval = { by: 'QA owner (selfcheck)', on: '2026-11-09' };

export function fact<T>(value: T): Fact<T> {
  return { value, source: 'selfcheck fixture, not backend data', approval: fixtureApproval };
}

export const completePolicy: AccountTestPolicy = {
  acceptedUnrecordedFacts: null,
  otp: {
    maxRequests: fact(11),
    windowMinutes: fact(13),
    cooldownSeconds: fact(0),
    limitScope: fact({
      perAccount: true,
      perIp: false,
      perDevice: 'not-applicable',
      perUnregisteredNumber: true,
    }),
    verificationAttemptsPerCode: fact(7),
    incorrectOtpInvalidatesCode: fact(false),
    lifetimeSeconds: fact(17),
    fixedOtpFollowsSameRules: fact(true),
    stagingSendsRealSms: fact(false),
  },
  login: {
    failureThreshold: fact(19),
    countingWindowMinutes: fact(23),
    lockDuration: fact('until-manual-unlock'),
    wrongOtpCountsTowardLock: fact(false),
  },
  recovery: { procedure: fact({ documentedIn: 'docs/ios-login-forgot-password-flow-plan.md' }) },
  passwordRules: {
    minLength: fact(9),
    reuseOfCurrentAllowed: fact(true),
    violationShownOnSameScreen: fact(true),
  },
  passwordReset: { signsInAutomatically: fact(true), resetLimitsEnforced: fact(false) },
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
    source: 'selfcheck fixture, not a real account',
    approval: fixtureApproval,
  },
  approvedOtpChains: {
    ids: [
      'dealer-en-reset',
      'dealer-ar-flow',
      'dealer-en-incorrect-otp',
      'dealer-ar-incorrect-otp',
    ],
    source: 'selfcheck fixture',
    approval: fixtureApproval,
  },
  negativeCredentialTests: fact(true),
};

/**
 * The real policy with its two recorded user-provided items removed: no test account and no login
 * failure threshold. Used to prove what is blocked while nothing is recorded; every other field is
 * the real one, so it also proves the rest of the real policy is still unrecorded.
 */
export const emptyPolicy: AccountTestPolicy = {
  ...structuredClone(ACCOUNT_TEST_POLICY),
  testAccount: null,
  login: { ...structuredClone(ACCOUNT_TEST_POLICY.login), failureThreshold: null },
};
