import fs from 'node:fs';
import path from 'node:path';
import { type AccountTestPolicy, accountPolicyProblems } from '../../config/ios-account-policy';
import {
  effectiveChain,
  RESEND_OBSERVE_MIN_SECONDS,
  RESEND_WAIT_MARGIN_SECONDS,
  RUN_KIND_SETS,
  rejectedPasswordPlan,
} from '../../src/mobile/ios/account/account-preflight';
import { chainDefinition, STEP } from '../../src/mobile/ios/account/otp-chain';
import { IosOtpScreen } from '../../src/mobile/ios/screens/otp.screen';
import { otpScreenTextProblem } from '../../test-data/ios-otp-screen.data';
import { completePolicy, fact, FIXTURE_NOW } from '../support/ios/account-policy-fixture';
import { expect, test } from '../support/fixtures';

/**
 * The extra Forgot Password steps (read-only layout and resend-cooldown checks, the rejected-password
 * attempts) and what they are allowed to do: which recorded facts and recorded text they need, that the spec
 * declares every chain step in the chain's own order, and that the read-only steps can neither type nor tap.
 * Offline only (fake driver, no device).
 */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const policyWith = (mutate: (p: AccountTestPolicy) => void): AccountTestPolicy => {
  const policy = structuredClone(completePolicy);
  mutate(policy);
  return policy;
};
const steps = (policy: AccountTestPolicy, id: 'dealer-en-reset' | 'dealer-ar-flow') =>
  effectiveChain(id, policy, fs.existsSync, FIXTURE_NOW);
const reasonOf = (result: ReturnType<typeof steps>, step: string) =>
  result.excluded.find((e) => e.step === step)?.reason;

test.describe('iOS Forgot Password steps: declaration order (selfcheck)', () => {
  test('the spec declares every chain step in exactly the order of the chain definition', () => {
    const source = stripComments(read('tests-ios/forgot-password.spec.ts'));
    const declared = [...source.matchAll(/declareStep\(\s*STEP\.(\w+)/g)].map(
      (m) => STEP[m[1] as keyof typeof STEP],
    );
    // The English reset chain is the longest: the shared flow, then the reset. The Arabic flow is the same
    // list without the reset, so one declaration list serves both languages.
    expect(declared).toEqual(chainDefinition('dealer-en-reset').steps);
    expect(declared.filter((step) => step !== STEP.completeReset)).toEqual(
      chainDefinition('dealer-ar-flow').steps,
    );
    expect(new Set(declared).size, 'no step is declared twice').toBe(declared.length);
    // A step missing from the spec would only fail after the OTP was spent.
    for (const id of ['dealer-en-reset', 'dealer-ar-flow'] as const) {
      for (const step of chainDefinition(id).steps)
        expect(declared, `${id}: ${step}`).toContain(step);
    }
  });
});

test.describe('iOS Forgot Password steps: what each one needs (selfcheck)', () => {
  test('the resend checks need the recorded cooldown, and the wait needs a recorded lifetime that outlasts it', () => {
    const recorded = policyWith((p) => {
      p.otp.cooldownSeconds = fact(60);
      p.otp.lifetimeSeconds = fact(60 + RESEND_WAIT_MARGIN_SECONDS);
    });
    for (const id of ['dealer-en-reset', 'dealer-ar-flow'] as const) {
      const result = steps(recorded, id);
      expect(result.steps, id).toContain(STEP.resendBlocked);
      expect(result.steps, id).toContain(STEP.resendOffered);
    }
    // A lifetime that does not outlast the cooldown by the margin: the wait is left out, the observation stays.
    const shortLived = steps(
      policyWith((p) => {
        p.otp.cooldownSeconds = fact(60);
        p.otp.lifetimeSeconds = fact(60 + RESEND_WAIT_MARGIN_SECONDS - 1);
      }),
      'dealer-ar-flow',
    );
    expect(shortLived.steps).toContain(STEP.resendBlocked);
    expect(shortLived.steps).not.toContain(STEP.resendOffered);
    expect(reasonOf(shortLived, STEP.resendOffered)).toMatch(/lifetime to exceed it/);
    // A cooldown too short to observe, or none: neither step runs.
    // The boundary itself is accepted (a loosened comparison would shift it).
    const atMinimum = steps(
      policyWith((p) => {
        p.otp.cooldownSeconds = fact(RESEND_OBSERVE_MIN_SECONDS);
        p.otp.lifetimeSeconds = fact(RESEND_OBSERVE_MIN_SECONDS + RESEND_WAIT_MARGIN_SECONDS);
      }),
      'dealer-ar-flow',
    );
    expect(atMinimum.steps).toContain(STEP.resendBlocked);
    expect(atMinimum.steps).toContain(STEP.resendOffered);
    for (const cooldown of [0, RESEND_OBSERVE_MIN_SECONDS - 1]) {
      const result = steps(
        policyWith((p) => (p.otp.cooldownSeconds = fact(cooldown))),
        'dealer-ar-flow',
      );
      expect(result.steps).not.toContain(STEP.resendBlocked);
      expect(result.steps).not.toContain(STEP.resendOffered);
      expect(reasonOf(result, STEP.resendBlocked)).toMatch(/shorter than the/);
    }
    // Nothing recorded: both are left out and the reason names what is missing.
    const unrecorded = steps(
      policyWith((p) => (p.otp.cooldownSeconds = null)),
      'dealer-ar-flow',
    );
    expect(reasonOf(unrecorded, STEP.resendBlocked)).toMatch(/not confirmed/);
    expect(reasonOf(unrecorded, STEP.resendOffered)).toMatch(/OTP cooldown/);
  });

  test('the rejected-password step tries only passwords the backend owner confirmed are rejected', () => {
    const none = rejectedPasswordPlan(completePolicy, fs.existsSync, FIXTURE_NOW);
    // Reuse is confirmed ALLOWED in the selfcheck policy and no example is recorded: nothing to try.
    expect(none.currentPassword).toBe(false);
    expect(none.examples).toEqual([]);
    expect(none.problem).toMatch(/no rejected password is confirmed/);

    // Reuse refused alone is not enough: the .env password must also be recorded as the CURRENT one.
    const unverified = rejectedPasswordPlan(
      policyWith((p) => (p.passwordRules.reuseOfCurrentAllowed = fact(false))),
      fs.existsSync,
      FIXTURE_NOW,
    );
    expect(unverified.currentPassword).toBe(false);
    expect(unverified.problem).toMatch(/not recorded as the current one/);
    const noReuse = rejectedPasswordPlan(
      policyWith((p) => {
        p.passwordRules.reuseOfCurrentAllowed = fact(false);
        if (p.testAccount) p.testAccount.currentPasswordVerified = fact(true);
      }),
      fs.existsSync,
      FIXTURE_NOW,
    );
    expect(noReuse).toEqual({ currentPassword: true, examples: [] });

    const examples = ['first-made-up-value', 'second-made-up-value'];
    const withExamples = rejectedPasswordPlan(
      policyWith((p) => (p.passwordRules.rejectedExamples = fact(examples))),
      fs.existsSync,
      FIXTURE_NOW,
    );
    expect(withExamples).toEqual({ currentPassword: false, examples });

    const both = rejectedPasswordPlan(
      policyWith((p) => {
        p.passwordRules.reuseOfCurrentAllowed = fact(false);
        if (p.testAccount) p.testAccount.currentPasswordVerified = fact(true);
        p.passwordRules.rejectedExamples = fact(examples);
      }),
      fs.existsSync,
      FIXTURE_NOW,
    );
    expect(both).toEqual({ currentPassword: true, examples });

    // The reuse fact alone decides the current password: X2 and X3 are not needed for this step.
    const reuseOnly = rejectedPasswordPlan(
      policyWith((p) => {
        p.passwordRules.reuseOfCurrentAllowed = fact(false);
        if (p.testAccount) p.testAccount.currentPasswordVerified = fact(true);
        p.passwordReset.signsInAutomatically = null;
        p.passwordReset.resetLimitsEnforced = null;
      }),
      fs.existsSync,
      FIXTURE_NOW,
    );
    expect(reuseOnly.currentPassword).toBe(true);

    // It rests on the X1 boundary facts and the confirmed behaviour (the step is not left).
    expect(
      rejectedPasswordPlan(
        policyWith((p) => {
          p.passwordRules.minLength = null;
          p.passwordRules.rejectedExamples = fact(examples);
        }),
        fs.existsSync,
        FIXTURE_NOW,
      ).problem,
    ).toMatch(/X1 is not confirmed/);
    expect(
      rejectedPasswordPlan(
        policyWith((p) => {
          p.passwordRules.violationShownOnSameScreen = fact(false);
          p.passwordRules.rejectedExamples = fact(examples);
        }),
        fs.existsSync,
        FIXTURE_NOW,
      ).problem,
    ).toMatch(/needs rewriting/);

    // The chain keeps the step exactly when the plan has something to try, and excludes it otherwise.
    expect(steps(completePolicy, 'dealer-ar-flow').steps).not.toContain(STEP.rejectedPassword);
    expect(steps(completePolicy, 'dealer-ar-flow').excluded.map((e) => e.step)).toContain(
      STEP.rejectedPassword,
    );
    const kept = steps(
      policyWith((p) => (p.passwordRules.rejectedExamples = fact(examples))),
      'dealer-ar-flow',
    );
    expect(kept.steps).toContain(STEP.rejectedPassword);
    // Placed after the below-minimum step and before any reset (the reset stays last).
    expect(chainDefinition('dealer-en-reset').steps.at(-1)).toBe(STEP.completeReset);
  });

  test('the optional rejected examples are validated like every fact: provenance and a usable list', () => {
    const problems = (value: unknown, extra: Partial<{ source: string }> = {}) =>
      accountPolicyProblems(
        policyWith((p) => {
          p.passwordRules.rejectedExamples = { ...fact(value), ...extra } as never;
        }),
        fs.existsSync,
        FIXTURE_NOW,
        ['password-examples'],
      );
    expect(problems(['one', 'two'])).toEqual([]);
    // The limits themselves are accepted: 10 examples, a 64-character example.
    expect(problems(Array.from({ length: 10 }, (_, i) => `value-${i}`))).toEqual([]);
    expect(problems(['x'.repeat(64)])).toEqual([]);
    expect(problems([])).toEqual([
      'X1 confirmed rejected new-password examples: must list 1 to 10 passwords',
    ]);
    expect(problems(Array.from({ length: 11 }, (_, i) => `value-${i}`))[0]).toMatch(/1 to 10/);
    expect(problems(['', 'ok'])[0]).toMatch(/non-empty string/);
    expect(problems([7, 'ok'])[0]).toMatch(/non-empty string/);
    expect(problems(['x'.repeat(65)])[0]).toMatch(/at most 64/);
    expect(problems(['same', 'same'])[0]).toMatch(/distinct/);
    expect(problems('not-a-list')[0]).toMatch(/1 to 10/);
    expect(problems(['ok'], { source: 'unknown' })[0]).toMatch(
      /source is missing or a placeholder/,
    );
    // Unrecorded is a problem of ITS set only: no run kind and no default set needs it.
    expect(
      accountPolicyProblems(completePolicy, fs.existsSync, FIXTURE_NOW, ['password-examples']),
    ).toEqual(['X1 confirmed rejected new-password examples is not recorded']);
    expect(accountPolicyProblems(completePolicy, fs.existsSync, FIXTURE_NOW)).toEqual([]);
    for (const sets of Object.values(RUN_KIND_SETS))
      expect(sets).not.toContain('password-examples');
  });

  test('the iOS OTP-screen text a step needs stays pending until it is recorded, never guessed', () => {
    const record = {
      en: { resendControl: null },
      ar: { resendControl: 'recorded label' },
    };
    expect(otpScreenTextProblem('en', ['resendControl'], record)).toMatch(
      /resendControl is not recorded \(en\)/,
    );
    expect(otpScreenTextProblem('en', ['resendControl'], record)).toMatch(/never guessed/);
    expect(otpScreenTextProblem('ar', ['resendControl'], record)).toBeUndefined();
    expect(
      otpScreenTextProblem('ar', ['resendControl'], { ...record, ar: { resendControl: '  ' } }),
    ).toMatch(/not recorded \(ar\)/);
    // The shipped record holds nothing: no label was copied from another platform.
    expect(otpScreenTextProblem('en', ['resendControl'])).toBeDefined();
    expect(otpScreenTextProblem('ar', ['resendControl'])).toBeDefined();
    expect(stripComments(read('test-data/ios-otp-screen.data.ts'))).not.toMatch(
      /resendControl:\s*['"`]/,
    );
  });
});

test.describe('iOS Forgot Password steps: read-only and bounded (selfcheck)', () => {
  /** The body of one declared step: from its declaration to the next declaration. */
  const bodyOf = (step: keyof typeof STEP) => {
    const source = stripComments(read('tests-ios/forgot-password.spec.ts'));
    const start = source.search(new RegExp(`declareStep\\(\\s*STEP\\.${step}\\b`));
    expect(start, step).toBeGreaterThan(0);
    const next = source.indexOf('declareStep(', start + 12);
    return source.slice(start, next > 0 ? next : undefined);
  };

  test('the layout and resend steps can neither type, tap nor send anything', () => {
    for (const step of [
      'otpLayout',
      'resendBlocked',
      'resendOffered',
      'newPasswordLayout',
    ] as const) {
      expect(bodyOf(step), step).not.toMatch(
        /\.click\(|\.setValue\(|\.addValue\(|verifyOtp|enterOtp|requestPasswordReset|setNewPassword|requestOtp|issueOtpPermit|\.logout\(/,
      );
    }
  });

  test('only the resend wait changes the test timeout, and it follows the recorded cooldown', () => {
    const source = stripComments(read('tests-ios/forgot-password.spec.ts'));
    // Exactly two steps may lengthen their test: the resend wait and the rejected-password confirmations.
    expect(source.match(/setTimeout\(/g) ?? []).toHaveLength(2);
    expect(bodyOf('rejectedPassword')).toContain('test.setTimeout(');
    expect(bodyOf('rejectedPassword')).toContain('ATTEMPT_CONFIRM_MS');
    expect(bodyOf('resendOffered')).toContain('test.setTimeout(');
    expect(bodyOf('resendOffered')).toContain('ACCOUNT_TEST_POLICY.otp.cooldownSeconds');
    expect(source).not.toMatch(/test\.setTimeout\(\s*\d/);
  });

  test('every invalid attempt is journaled first and confirmed as not saved before it counts as unchanged', () => {
    for (const step of ['shortPassword', 'rejectedPassword'] as const) {
      const body = bodyOf(step);
      expect(body, step).toContain("'invalid-attempt'");
      expect(body, step).not.toContain("'save'");
      expect(body, step).toContain('withPasswordAttemptJournal(');
      expect(body, step).toContain('confirmNotSaved(');
      // The journal and the final save are not touched directly from the step.
      expect(body, step).not.toMatch(/accountJournal|markResetRestored/);
      // The attempt sits inside the journal wrapper, and the confirmation sits inside it too.
      const wrap = body.indexOf('withPasswordAttemptJournal(');
      expect(body.indexOf('setNewPassword('), step).toBeGreaterThan(wrap);
      expect(body.indexOf('confirmNotSaved('), step).toBeGreaterThan(
        body.indexOf('setNewPassword('),
      );
    }
    expect(bodyOf('rejectedPassword')).toContain('rejectedPasswordPlan(ACCOUNT_TEST_POLICY)');
  });

  test('screen evidence is attached for the OTP screen, the new-password screen and right after each tap', () => {
    const source = stripComments(read('tests-ios/forgot-password.spec.ts'));
    for (const name of [
      'otp-screen',
      'new-password-screen',
      'after-send',
      'after-verify',
      'after-save',
    ]) {
      expect(source, name).toContain(`attachScreenEvidence(driver, testInfo, '${name}')`);
    }
  });
});

/** A fake driver whose lookups find a chosen number of enabled or disabled elements, by selector kind. */
function fakeResendDriver(options: { buttons?: boolean[]; texts?: number }) {
  const events: string[] = [];
  const element = (enabled: boolean) => ({
    click: () => Promise.resolve(void events.push('click')),
    setValue: () => Promise.resolve(void events.push('type')),
    isEnabled: () => Promise.resolve(enabled),
  });
  const driver = {
    $$: (selector: string) => ({
      getElements: () =>
        Promise.resolve(
          selector.includes('XCUIElementTypeButton')
            ? (options.buttons ?? []).map(element)
            : Array.from({ length: options.texts ?? 0 }, () => element(true)),
        ),
    }),
    pause: () => Promise.resolve(),
  };
  return { driver: driver as never, events };
}

test.describe('iOS OTP screen: resend control view (selfcheck, fake driver)', () => {
  const offered = async (options: Parameters<typeof fakeResendDriver>[0]) => {
    const { driver, events } = fakeResendDriver(options);
    const result = await new IosOtpScreen(driver)
      .resendOffered('a recorded label')
      .catch((e: Error) => e);
    expect(events, 'a read-only view never types or taps').toEqual([]);
    return result;
  };

  test('absent or disabled is not offered; one enabled button, or one text link, is offered', async () => {
    expect(await offered({})).toBe(false);
    expect(await offered({ buttons: [false] })).toBe(false);
    expect(await offered({ buttons: [true] })).toBe(true);
    // A button also carries its label as an inner text: the button decides, the text is not counted twice.
    expect(await offered({ buttons: [false], texts: 1 })).toBe(false);
    expect(await offered({ buttons: [true], texts: 1 })).toBe(true);
    expect(await offered({ texts: 1 })).toBe(true);
  });

  test('more than one match is an error, never a guess', async () => {
    expect(await offered({ buttons: [true, true] })).toBeInstanceOf(Error);
    expect(await offered({ texts: 2 })).toBeInstanceOf(Error);
  });
});
