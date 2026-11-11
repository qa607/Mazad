import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACCOUNT_TEST_POLICY,
  type AccountTestPolicy,
  type PolicySet,
} from '../../config/ios-account-policy';
import {
  type AccountRunContext,
  type AccountRunKind,
  accountRunBlockers,
  accountRunProblem,
  effectiveChain,
  OTP_REQUEST_KINDS,
  RUN_KIND_SETS,
  SWITCHES,
} from '../../src/mobile/ios/account/account-preflight';
import { STEP } from '../../src/mobile/ios/account/otp-chain';
import { AppStateMarker, RecoveryJournal } from '../../src/mobile/ios/account/recovery-journal';
import {
  categoryAnnotations,
  primaryCategory,
  secondaryTags,
  TEST_CATEGORIES,
} from '../../src/utils/test-category';
import { expect, test } from '../support/fixtures';
import { completePolicy, fact, FIXTURE_NOW } from '../support/ios/account-policy-fixture';

/** Offline: nothing here reads .env, contacts a backend, touches a device or sends an OTP. */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const clone = (): AccountTestPolicy => structuredClone(completePolicy);
const ALL_SWITCHES = {
  IOS_ALLOW_ACCOUNT_ACTIONS: 'true',
  IOS_ALLOW_PASSWORD_RESET: 'true',
  MAZAD_ALLOW_OTP_REQUESTS: 'true',
  MAZAD_ALLOW_PASSWORD_RESET: 'true',
  MAZAD_ALLOW_LOGOUT: 'true',
};

function context(
  dir: string,
  over: Partial<AccountRunContext> & { policy?: AccountTestPolicy } = {},
): AccountRunContext {
  return {
    env: ALL_SWITCHES,
    policy: completePolicy,
    missingLocalEnv: () => [],
    journal: new RecoveryJournal(dir),
    marker: new AppStateMarker(dir),
    chainId: 'dealer-ar-flow',
    now: FIXTURE_NOW,
    ...over,
  };
}

const withDir = <T>(fn: (dir: string) => T): T => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-readiness-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** Removes ONE recorded fact of the given set from a complete policy. */
const CLEAR: Record<PolicySet, (p: AccountTestPolicy) => void> = {
  always: (p) => (p.testAccount = null),
  login: (p) => (p.login.failureThreshold = null),
  'otp-request': (p) => (p.otp.maxRequests = null),
  'otp-validation': (p) => (p.otp.lifetimeSeconds = null),
  'otp-negative': (p) => (p.otp.incorrectOtpInvalidatesCode = null),
  'password-boundary': (p) => (p.passwordRules.minLength = null),
  'password-examples': (p) => (p.passwordRules.rejectedExamples = null),
  'password-reset': (p) => (p.passwordReset.signsInAutomatically = null),
};

test.describe('iOS run kinds: independent policy fact sets (selfcheck)', () => {
  test('the sets and switches of every run kind are exactly the approved ones', () => {
    expect(RUN_KIND_SETS).toEqual({
      'unregistered-login': ['always', 'login'],
      'unregistered-otp-request': ['always', 'otp-request'],
      login: ['always', 'login'],
      'otp-flow-chain': ['always', 'otp-request', 'otp-validation'],
      'negative-chain': ['always', 'otp-request', 'otp-validation', 'otp-negative', 'login'],
      'otp-reset-chain': ['always', 'otp-request', 'otp-validation', 'login', 'password-reset'],
    });
    expect(SWITCHES['unregistered-login']).toEqual(['IOS_ALLOW_ACCOUNT_ACTIONS']);
    // Every kind that can send an OTP needs MAZAD_ALLOW_OTP_REQUESTS and the account-action switch.
    for (const kind of OTP_REQUEST_KINDS) {
      expect(SWITCHES[kind], kind).toEqual(
        expect.arrayContaining(['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS']),
      );
    }
    expect(SWITCHES['unregistered-otp-request']).toEqual([
      'IOS_ALLOW_ACCOUNT_ACTIONS',
      'MAZAD_ALLOW_OTP_REQUESTS',
    ]);
    // Kinds that cannot send an OTP do not carry the OTP switch.
    for (const kind of ['login', 'unregistered-login'] as const) {
      expect(SWITCHES[kind]).not.toContain('MAZAD_ALLOW_OTP_REQUESTS');
    }
    // A reset needs the password-reset switches of both families and the right to sign out.
    expect(SWITCHES['otp-reset-chain']).toEqual(
      expect.arrayContaining([
        'IOS_ALLOW_PASSWORD_RESET',
        'MAZAD_ALLOW_PASSWORD_RESET',
        'MAZAD_ALLOW_LOGOUT',
      ]),
    );
    expect(OTP_REQUEST_KINDS).not.toContain('login');
    expect(OTP_REQUEST_KINDS).not.toContain('unregistered-login');
  });

  test('every kind requires ALWAYS: the confirmed account', () => {
    for (const kind of Object.keys(RUN_KIND_SETS) as AccountRunKind[]) {
      expect(RUN_KIND_SETS[kind], kind).toContain('always');
      withDir((dir) => {
        const noAccount = { ...completePolicy, testAccount: null };
        expect(accountRunProblem(kind, context(dir, { policy: noAccount })), kind).toMatch(
          /test account is not confirmed/,
        );
      });
    }
  });

  test('the recovery procedure (Q12) is required by the OTP flows only, never by a Login/Logout run', () => {
    withDir((dir) => {
      const noRecovery = clone();
      noRecovery.recovery.procedure = null;
      for (const kind of Object.keys(RUN_KIND_SETS) as AccountRunKind[]) {
        const problem = accountRunProblem(kind, context(dir, { policy: noRecovery }));
        if (OTP_REQUEST_KINDS.includes(kind)) {
          expect(problem, kind).toMatch(/recovery and unlock procedure is not recorded/);
        } else {
          expect(problem, kind).toBeUndefined();
        }
      }
      // The Login/Logout kinds keep every login-specific requirement.
      for (const kind of ['login', 'unregistered-login'] as const) {
        const noThreshold = clone();
        noThreshold.login.failureThreshold = null;
        expect(accountRunProblem(kind, context(dir, { policy: noThreshold })), kind).toMatch(
          /login failure threshold is not recorded/,
        );
        expect(
          accountRunProblem(kind, context(dir, { policy: { ...clone(), testAccount: null } })),
          kind,
        ).toMatch(/test account is not confirmed/);
        expect(accountRunProblem(kind, context(dir, { env: {} })), kind).toMatch(/not approved/);
      }
    });
  });

  test('a kind is blocked by a missing fact of its own sets and by none of the others', () => {
    withDir((dir) => {
      for (const kind of Object.keys(RUN_KIND_SETS) as AccountRunKind[]) {
        for (const set of Object.keys(CLEAR) as PolicySet[]) {
          const policy = clone();
          CLEAR[set](policy);
          const problem = accountRunProblem(kind, context(dir, { policy }));
          if (RUN_KIND_SETS[kind].includes(set)) {
            expect(problem, `${kind} without ${set}`).toMatch(/not recorded|not confirmed/);
          } else {
            expect(problem, `${kind} without ${set}`).toBeUndefined();
          }
        }
      }
    });
  });

  test('a plain dealer login depends on the lock rules only, not on any OTP or password fact', () => {
    withDir((dir) => {
      const policy = clone();
      for (const set of ['otp-request', 'otp-validation', 'otp-negative'] as const) {
        CLEAR[set](policy);
      }
      policy.passwordRules = {
        minLength: null,
        reuseOfCurrentAllowed: null,
        violationShownOnSameScreen: null,
      };
      policy.passwordReset = { signsInAutomatically: null, resetLimitsEnforced: null };
      expect(accountRunProblem('login', context(dir, { policy }))).toBeUndefined();
      // But the lock rules and every other requirement still apply.
      for (const clear of [
        (p: AccountTestPolicy) => (p.login.failureThreshold = null),
        (p: AccountTestPolicy) => (p.login.countingWindowMinutes = null),
        (p: AccountTestPolicy) => (p.login.lockDuration = null),
      ]) {
        const blocked = structuredClone(policy);
        clear(blocked);
        expect(accountRunProblem('login', context(dir, { policy: blocked }))).toMatch(
          /not recorded/,
        );
      }
      expect(
        accountRunProblem('login', context(dir, { policy, env: { MAZAD_ALLOW_LOGOUT: 'true' } })),
      ).toMatch(/IOS_ALLOW_ACCOUNT_ACTIONS/);
      expect(
        accountRunProblem(
          'login',
          context(dir, { policy, env: { IOS_ALLOW_ACCOUNT_ACTIONS: 'true' } }),
        ),
      ).toMatch(/MAZAD_ALLOW_LOGOUT/);
      expect(
        accountRunProblem(
          'login',
          context(dir, { policy, missingLocalEnv: () => ['IOS_TEST_DEALER_PHONE'] }),
        ),
      ).toMatch(/IOS_TEST_DEALER_PHONE/);
    });
  });

  test('a complete policy never authorizes: without the switches every kind is still blocked', () => {
    withDir((dir) => {
      for (const kind of Object.keys(RUN_KIND_SETS) as AccountRunKind[]) {
        const blockers = accountRunBlockers(kind, context(dir, { env: {} }));
        expect(
          blockers.map((b) => b.category),
          kind,
        ).toEqual(['authorization-blocked']);
        expect(blockers[0].message, kind).toMatch(/not approved for this run/);
        // Each required switch, alone missing, blocks.
        for (const name of SWITCHES[kind]) {
          const env = { ...ALL_SWITCHES, [name]: 'false' };
          expect(accountRunProblem(kind, context(dir, { env })), `${kind} ${name}`).toContain(name);
          const unset = { ...ALL_SWITCHES } as Record<string, string | undefined>;
          delete unset[name];
          expect(
            accountRunProblem(kind, context(dir, { env: unset })),
            `${kind} ${name}`,
          ).toContain(name);
        }
        expect(accountRunProblem(kind, context(dir)), kind).toBeUndefined();
      }
    });
  });

  test('blockers carry a category: policy first, then authorization', () => {
    withDir((dir) => {
      const blockers = accountRunBlockers(
        'otp-flow-chain',
        context(dir, { policy: ACCOUNT_TEST_POLICY, env: {} }),
      );
      expect(blockers.map((b) => b.category)).toEqual([
        'policy-blocked',
        'authorization-blocked',
        'authorization-blocked',
      ]);
      // accountRunProblem is the first blocker, as before.
      expect(
        accountRunProblem('otp-flow-chain', context(dir, { policy: ACCOUNT_TEST_POLICY, env: {} })),
      ).toBe(blockers[0].message);
    });
  });

  test('the real policy accepts nothing as unrecorded and the two X blocks are empty', () => {
    expect(ACCOUNT_TEST_POLICY.acceptedUnrecordedFacts).toBeNull();
    // The test account is recorded as the QA owner's user-provided statements (see the policy selfchecks).
    expect(ACCOUNT_TEST_POLICY.testAccount?.approval.by).toBe('QA owner');
    const xValues: unknown[] = [
      ...(Object.values(ACCOUNT_TEST_POLICY.passwordRules) as unknown[]),
      ...(Object.values(ACCOUNT_TEST_POLICY.passwordReset) as unknown[]),
    ];
    for (const value of xValues) {
      expect(value).toBeNull();
    }
    expect(stripComments(read('config/ios-account-policy.ts'))).not.toMatch(
      /acceptedUnrecordedFacts:\s*\{/,
    );
  });
});

test.describe('iOS chains: steps follow the recorded policy (selfcheck)', () => {
  // The steps that depend on no recorded fact: the read-only layout checks sit between the base steps.
  const BASE = [
    STEP.otpStep,
    STEP.otpLayout,
    STEP.emptyOtp,
    STEP.correctOtp,
    STEP.newPasswordLayout,
    STEP.emptyPassword,
  ];
  // Steps that need their own facts and are left out of the complete selfcheck policy: the cooldown is 0
  // there, and it records neither a rejected example nor a ban on reusing the current password.
  const FIXTURE_EXCLUDED = [STEP.resendBlocked, STEP.resendOffered, STEP.rejectedPassword];
  const excludedSteps = (result: { excluded: { step: string }[] }) =>
    result.excluded.map((e) => e.step);

  test('with the real (empty) policy the chains keep only the base steps and never the X1 steps', () => {
    const en = effectiveChain('dealer-en-reset');
    expect(en.steps).toEqual(BASE);
    expect(en.kind).toBe('otp-flow-chain');
    expect(en.excluded.map((e) => e.step)).toEqual([
      STEP.resendBlocked,
      STEP.resendOffered,
      STEP.shortPassword,
      STEP.rejectedPassword,
      STEP.completeReset,
    ]);
    expect(effectiveChain('dealer-ar-flow').steps).toEqual(BASE);
    expect(effectiveChain('dealer-ar-flow').excluded.map((e) => e.step)).toEqual([
      STEP.resendBlocked,
      STEP.resendOffered,
      STEP.shortPassword,
      STEP.rejectedPassword,
    ]);
    expect(effectiveChain('dealer-en-incorrect-otp')).toMatchObject({
      kind: 'negative-chain',
      steps: [STEP.incorrectOtp],
    });
    // Base steps never depend on X1: nothing about passwords appears in their requirements.
    expect(RUN_KIND_SETS['otp-flow-chain']).not.toContain('password-boundary');
    expect(RUN_KIND_SETS['otp-flow-chain']).not.toContain('password-reset');
  });

  test('each X step needs its own confirmed facts and the confirmed behaviour', () => {
    const run = (
      mutate: (p: AccountTestPolicy) => void,
      id: 'dealer-en-reset' | 'dealer-ar-flow' = 'dealer-en-reset',
    ) => {
      const policy = clone();
      mutate(policy);
      return effectiveChain(id, policy, fs.existsSync, FIXTURE_NOW);
    };
    const full = run(() => undefined);
    expect(full.steps).toEqual([...BASE, STEP.shortPassword, STEP.completeReset]);
    expect(full.kind).toBe('otp-reset-chain');
    expect(full.excluded.map((e) => e.step)).toEqual(FIXTURE_EXCLUDED);

    // Boundary step: needs the minimum, a usable value, and the confirmed behaviour.
    const reasonOf = (result: ReturnType<typeof run>, step: string) =>
      result.excluded.find((e) => e.step === step)?.reason;
    // Without the minimum both X1 steps are left out, and the reset (which does not need it) stays.
    expect(excludedSteps(run((p) => (p.passwordRules.minLength = null)))).toEqual([
      STEP.resendBlocked,
      STEP.resendOffered,
      STEP.shortPassword,
      STEP.rejectedPassword,
    ]);
    expect(
      reasonOf(
        run((p) => (p.passwordRules.minLength = fact(1))),
        STEP.shortPassword,
      ),
    ).toMatch(/no non-empty password/);
    expect(
      reasonOf(
        run((p) => (p.passwordRules.violationShownOnSameScreen = fact(false))),
        STEP.shortPassword,
      ),
    ).toMatch(/needs rewriting/);
    // Reset step: needs X1 reuse, X2 and X3, and reuse must be allowed (no different-password reset).
    for (const mutate of [
      (p: AccountTestPolicy) => (p.passwordReset.signsInAutomatically = null),
      (p: AccountTestPolicy) => (p.passwordReset.resetLimitsEnforced = null),
      (p: AccountTestPolicy) => (p.passwordRules.reuseOfCurrentAllowed = null),
    ]) {
      const result = run(mutate);
      expect(excludedSteps(result)).toEqual([
        STEP.resendBlocked,
        STEP.resendOffered,
        STEP.rejectedPassword,
        STEP.completeReset,
      ]);
      expect(result.kind).toBe('otp-flow-chain');
      expect(result.steps).toEqual([...BASE, STEP.shortPassword]);
    }
    const noReuse = run((p) => (p.passwordRules.reuseOfCurrentAllowed = fact(false)));
    expect(reasonOf(noReuse, STEP.completeReset)).toMatch(/may be reused/);
    expect(noReuse.steps).not.toContain(STEP.completeReset);
    // Reuse confirmed NOT allowed makes the current password a rejected password to try instead, but only
    // when the owner also recorded that the .env password IS the current one.
    expect(noReuse.steps).not.toContain(STEP.rejectedPassword);
    const verified = run((p) => {
      p.passwordRules.reuseOfCurrentAllowed = fact(false);
      if (p.testAccount) p.testAccount.currentPasswordVerified = fact(true);
    });
    expect(verified.steps).toContain(STEP.rejectedPassword);
    expect(excludedSteps(verified)).toEqual([
      STEP.resendBlocked,
      STEP.resendOffered,
      STEP.completeReset,
    ]);
    // The Arabic chain never saves a password, whatever is confirmed.
    expect(run(() => undefined, 'dealer-ar-flow').steps).toEqual([...BASE, STEP.shortPassword]);
  });

  test('the reset test derives its end state from X2(a) and the spec issues a permit before each request', () => {
    const source = stripComments(read('tests-ios/forgot-password.spec.ts'));
    expect(source).toContain('passwordReset.signsInAutomatically');
    expect(source).toContain('loginScreen.waitForForm()');
    expect(source).toMatch(
      /const permit = issueOtpPermit\(effective\.kind, id, iosDealerAccount\.phone, id\)/,
    );
    // Only ONE reset step title exists, and it matches what the test does.
    expect(read('src/mobile/ios/account/otp-chain.ts')).toContain(
      'Saving the baseline password completes the reset',
    );
    // A different-password reset is NOT implemented anywhere.
    for (const file of [
      'tests-ios/forgot-password.spec.ts',
      'tests-ios/ios-test-helpers.ts',
      'tests-ios/ios-account-helpers.ts',
    ]) {
      expect(stripComments(read(file)), file).not.toMatch(
        /generateTestPassword|differentPassword|restoreBaseline/,
      );
    }
  });
});

test.describe('iOS typed test categories and approval-switch documentation (selfcheck)', () => {
  test('precedence: excluded > fixme > pending > policy > authorization; the text gate never leads', () => {
    expect(TEST_CATEGORIES).toEqual([
      'excluded',
      'fixme',
      'pending-implementation',
      'policy-blocked',
      'authorization-blocked',
    ]);
    const all = categoryAnnotations({
      excluded: 'e',
      fixme: 'f',
      pending: 'p',
      policy: 'q',
      authorization: 'a',
      textGate: 't',
    });
    expect(primaryCategory(all)).toBe('excluded');
    expect(secondaryTags(all)).toEqual([
      'fixme',
      'pending-implementation',
      'policy-blocked',
      'authorization-blocked',
      'text-gate',
    ]);
    expect(primaryCategory(categoryAnnotations({ policy: 'q', authorization: 'a' }))).toBe(
      'policy-blocked',
    );
    expect(primaryCategory(categoryAnnotations({ pending: 'p', policy: 'q' }))).toBe(
      'pending-implementation',
    );
    expect(primaryCategory(categoryAnnotations({ authorization: 'a', textGate: 't' }))).toBe(
      'authorization-blocked',
    );
    // Only the text gate: still not a runnable test.
    expect(primaryCategory(categoryAnnotations({ textGate: 't' }))).toBe('pending-implementation');
    // Nothing blocks: no annotation at all.
    expect(categoryAnnotations({})).toEqual([]);
    expect(primaryCategory([])).toBeUndefined();
    // Long reasons are cut, never dropped.
    expect(categoryAnnotations({ fixme: 'x'.repeat(500) })[0].description.length).toBeLessThan(200);
  });

  test('every declared non-runnable test carries a typed category (source check)', () => {
    for (const file of [
      'tests-ios/login.spec.ts',
      'tests-ios/forgot-password.spec.ts',
      'tests-ios/dealer.spec.ts',
      'tests-ios/registration.spec.ts',
      'tests-ios/contact-us.spec.ts',
    ]) {
      const source = stripComments(read(file));
      // Every test.fixme / test.skip with a title, and every Individual placeholder, has an annotation.
      const bare =
        source.match(/test\.(?:fixme|skip)\(\s*(?:'[^']+'|STEP\.\w+|title)\s*,\s*\(\)\s*=>/g) ?? [];
      expect(bare, file).toEqual([]);
      expect(source, file).toContain('categoryAnnotations(');
    }
  });

  test('.env.example documents every switch by name, empty, with its purpose and run kinds', () => {
    const example = read('.env.example');
    const names = [
      'IOS_ALLOW_ACCOUNT_ACTIONS',
      'IOS_ALLOW_PASSWORD_RESET',
      'MAZAD_ALLOW_OTP_REQUESTS',
      'MAZAD_ALLOW_PASSWORD_RESET',
      'MAZAD_ALLOW_LOGOUT',
    ];
    const lines = example.split('\n');
    for (const name of names) {
      expect(lines, name).toContain(`${name}=`); // present and EMPTY: no switch is enabled
      expect(example, name).toMatch(new RegExp(`#\\s+${name}\\s+protects`));
    }
    for (const kind of Object.keys(SWITCHES))
      expect(example, kind).toContain(kind === 'login' ? 'login (dealer)' : kind);
    // The documentation matches the code: each kind line lists exactly its switches.
    for (const [kind, switches] of Object.entries(SWITCHES)) {
      const key = kind === 'login' ? 'login (dealer)' : kind;
      const start = example.indexOf(`#   ${key}`);
      expect(start, kind).toBeGreaterThan(0);
      const rest = example.slice(start + 5);
      const next = rest.search(/\n# {3}[a-z]/);
      const entry = example.slice(start, start + 5 + (next >= 0 ? next : rest.length));
      for (const name of switches) expect(entry, `${kind} ${name}`).toContain(name);
    }
    expect(lines.filter((l) => /^(IOS|MAZAD)_ALLOW_\w+=\S/.test(l))).toEqual([]);
  });

  test('the two unused duplicate exports are gone and nothing refers to them', () => {
    for (const dir of ['src', 'tests-ios', 'config', 'ui-tests']) {
      for (const file of fs
        .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts'))) {
        const full = path.join(dir, file);
        if (full === 'ui-tests/selfcheck/ios-readiness.selfcheck.spec.ts') continue;
        expect(read(full), full).not.toMatch(
          /IOS_ACCOUNT_ACTIONS_PROBLEM|IOS_PASSWORD_RESET_PROBLEM/,
        );
      }
    }
  });

  test('the category report script is offline: no device, Appium, staging or secrets', () => {
    const script = stripComments(read('scripts/ios-test-report.mjs'));
    expect(script).toContain("'--list'");
    expect(script).not.toMatch(/appium|webdriver|remote\(|fetch\(|https?:\/\/|\.env|process\.env/i);
    expect(script).toContain('not measured here');
  });
});
