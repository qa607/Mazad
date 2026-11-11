import fs from 'node:fs';
import path from 'node:path';
import { effectiveChain } from '../../src/mobile/ios/account/account-preflight';
import { planWithScreenText, STEP_SCREEN_TEXT } from '../../src/mobile/ios/account/chain-plan';
import { STEP } from '../../src/mobile/ios/account/otp-chain';
import { IosOtpScreen } from '../../src/mobile/ios/screens/otp.screen';
import { GUEST_FORM_TEST_TITLES } from '../../test-data/ios-verified-text';
import { attachScreenEvidence, maskedInventory } from '../../tests-ios/ios-test-helpers';
import { completePolicy, fact, FIXTURE_NOW } from '../support/ios/account-policy-fixture';
import { expect, test } from '../support/fixtures';

/**
 * Guards around the extra Forgot Password steps, written after an independent review: the pending-text plan,
 * an ALLOWLIST of what the read-only steps may call, each password submission bound to its intent, the narrow
 * (guest) tests kept free of anything that submits, the placement of the evidence captures, the masking of
 * digits in evidence, and the exact selectors of the resend view. Offline only (fake drivers, no device).
 */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SPEC = () => stripComments(read('tests-ios/forgot-password.spec.ts'));

/** The body of one declared chain step: from its declaration to the next declaration (or the end of the chains). */
const bodyOf = (step: keyof typeof STEP) => {
  const source = SPEC();
  const start = source.search(new RegExp(`declareStep\\(\\s*STEP\\.${step}\\b`));
  expect(start, step).toBeGreaterThan(0);
  const next = source.indexOf('declareStep(', start + 12);
  const end = source.indexOf('eslint-enable', start);
  const stop = [next, end].filter((i) => i > 0);
  return source.slice(start, stop.length ? Math.min(...stop) : undefined);
};

test.describe('iOS Forgot Password guards: pending screen text (selfcheck)', () => {
  const recordedPolicy = structuredClone(completePolicy);
  recordedPolicy.otp.cooldownSeconds = fact(60);
  recordedPolicy.otp.lifetimeSeconds = fact(600);
  const effective = (id: 'dealer-ar-flow' | 'dealer-en-reset') =>
    effectiveChain(id, recordedPolicy, fs.existsSync, FIXTURE_NOW);

  test('a step needing unrecorded screen text becomes pending and is left out of the chain', () => {
    const base = effective('dealer-ar-flow');
    expect(base.steps).toContain(STEP.resendBlocked);
    const plan = planWithScreenText(base, 'ar');
    expect(plan.steps).not.toContain(STEP.resendBlocked);
    expect(plan.steps).not.toContain(STEP.resendOffered);
    expect(plan.pending.map((p) => p.step)).toEqual([STEP.resendBlocked, STEP.resendOffered]);
    for (const entry of plan.pending) expect(entry.reason).toMatch(/not recorded \(ar\)/);
    // Everything else keeps its order, and the kind is unchanged.
    expect(plan.steps).toEqual(
      base.steps.filter((s) => s !== STEP.resendBlocked && s !== STEP.resendOffered),
    );
    expect(plan.kind).toBe(base.kind);
    expect(plan.excluded).toEqual(base.excluded);
  });

  test('once the text is recorded the steps return, and only those two steps ever depend on it', () => {
    const record = {
      en: { resendControl: null },
      ar: { resendControl: 'a recorded label' },
    };
    const base = effective('dealer-ar-flow');
    const arabic = planWithScreenText(base, 'ar', record);
    expect(arabic.steps).toEqual(base.steps);
    expect(arabic.pending).toEqual([]);
    // The record is per language: English is still pending.
    expect(planWithScreenText(effective('dealer-en-reset'), 'en', record).pending).toHaveLength(2);
    expect(Object.keys(STEP_SCREEN_TEXT).sort()).toEqual(
      [STEP.resendBlocked, STEP.resendOffered].sort(),
    );
  });
});

test.describe('iOS Forgot Password guards: what each step may call (selfcheck)', () => {
  const READ_ONLY_MEMBER_CALLS = new Set([
    'step',
    'inputLayout',
    'push',
    'resendOffered',
    'passwordFieldCount',
    'otherTextFieldCount',
    'setTimeout',
    'poll',
    'toBe',
  ]);
  const READ_ONLY_BARE_CALLS = new Set(['declareStep', 'expect', 'String', 'Error']);
  const KEYWORDS = new Set([
    'async',
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function',
    'typeof',
  ]);

  test('the four read-only steps call nothing but an allowlist of reading methods', () => {
    for (const step of [
      'otpLayout',
      'resendBlocked',
      'resendOffered',
      'newPasswordLayout',
    ] as const) {
      // Text inside string literals is not code: blank it before looking for calls.
      const body = bodyOf(step).replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
      const members = [...body.matchAll(/\.(\w+)\s*\(/g)].map((m) => m[1]);
      for (const name of members) {
        expect(READ_ONLY_MEMBER_CALLS.has(name), `${step} calls .${name}(`).toBe(true);
      }
      const bare = [...body.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)]
        .map((m) => m[1])
        .filter((name) => !KEYWORDS.has(name));
      for (const name of bare) {
        expect(READ_ONLY_BARE_CALLS.has(name), `${step} calls ${name}(`).toBe(true);
      }
    }
  });

  test('each password submission uses the intent of its own step', () => {
    const count = (text: string, token: string) => text.split(token).length - 1;
    for (const [step, intent, other] of [
      ['shortPassword', "'invalid-attempt'", "'save'"],
      ['rejectedPassword', "'invalid-attempt'", "'save'"],
      ['completeReset', "'save'", "'invalid-attempt'"],
    ] as const) {
      const body = bodyOf(step);
      expect(count(body, 'setNewPassword('), `${step}: one submission`).toBe(1);
      expect(body, `${step}: intent`).toContain(intent);
      expect(body, `${step}: not the other intent`).not.toContain(other);
    }
  });

  test('the guest (narrow-gate) tests contain nothing that requests, enters or saves anything', () => {
    const source = SPEC();
    const start = source.indexOf('test.use({ language: lang });');
    const marker = source.indexOf(
      'test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM)',
      start,
    );
    expect(start).toBeGreaterThan(0);
    expect(marker).toBeGreaterThan(start);
    const region = source.slice(start, marker);
    expect(region).not.toMatch(
      /requestPasswordReset|issueOtpPermit|chainFor|declareOtpChain|enterOtp|verifyOtp|setNewPassword|requestOtp|iosDealerAccount|otpCode|\.logout\(/,
    );
    // The only typed values are the synthetic phone constants, never the dealer's number.
    const typed = [...source.matchAll(/enterPhone\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(typed.length).toBeGreaterThan(0);
    for (const argument of typed) {
      expect(argument, `enterPhone(${argument})`).toMatch(/^(value|typed|PHONE_INPUT\.\w+)$/);
    }
  });

  test('the narrow gate lists exactly the reviewed guest titles, the phone tests appended at the end', () => {
    expect(GUEST_FORM_TEST_TITLES).toHaveLength(25);
    expect(GUEST_FORM_TEST_TITLES.slice(22)).toEqual([
      'Help Center opens the Contact Form with its fields and labels',
      'Contact Form Name keeps letters only',
      'Contact Form Mobile Number ignores letters and stops at 10 digits',
    ]);
    expect(GUEST_FORM_TEST_TITLES.slice(16, 22)).toEqual([
      'Letters and Arabic-Indic digits are not accepted in the phone number',
      'Non-digit characters typed into the phone number are dropped',
      'The phone number is limited in length',
      'Clearing the phone number disables Send again',
      'A single digit already enables Send',
      'Reopening Forgot Password after Close shows an empty phone field',
    ]);
    expect(GUEST_FORM_TEST_TITLES[10]).toBe(
      'Dealer login signs in and logout returns to the guest state',
    );
  });
});

test.describe('iOS Forgot Password guards: evidence (selfcheck)', () => {
  test('the evidence captures sit where they were designed to', () => {
    const otp = bodyOf('otpStep');
    expect(otp.indexOf("'after-send'")).toBeGreaterThan(otp.indexOf('requestOtp('));
    expect(otp.indexOf("'after-send'")).toBeLessThan(otp.indexOf('waitForDisplayed'));
    expect(otp.indexOf("'otp-screen'")).toBeGreaterThan(otp.indexOf('waitForDisplayed'));
    const correct = bodyOf('correctOtp');
    expect(correct.indexOf("'after-verify'")).toBeGreaterThan(correct.indexOf('chain.enterOtp('));
    expect(correct.indexOf("'after-verify'")).toBeLessThan(correct.indexOf('waitForDisplayed'));
    expect(correct.indexOf("'new-password-screen'")).toBeGreaterThan(
      correct.indexOf('markValidOtpEntered('),
    );
    const reset = bodyOf('completeReset');
    expect(reset.indexOf("'after-save'")).toBeGreaterThan(reset.indexOf('setNewPassword('));
    expect(reset.indexOf("'after-save'")).toBeLessThan(reset.indexOf('signsInAutomatically'));
  });

  test('evidence keeps the words and the structure but never a run of 4 or more digits, nor a typed value', async () => {
    const xml =
      '<AppiumAUT>' +
      '<XCUIElementTypeStaticText type="XCUIElementTypeStaticText" label="Code sent to 12345678" name="Code sent to 12345678" visible="true" x="0" y="0" width="9" height="9"/>' +
      '<XCUIElementTypeStaticText type="XCUIElementTypeStaticText" label="2468" name="2468" visible="true" x="0" y="0" width="9" height="9"/>' +
      '<XCUIElementTypeTextField type="XCUIElementTypeTextField" value="typed-secret-value" placeholderValue="Enter the 13579 code" visible="true" x="0" y="0" width="9" height="9"/>' +
      '</AppiumAUT>';
    const attached: { name: string; body: string }[] = [];
    const info = {
      attach: (name: string, options: { body: string }) => {
        attached.push({ name, body: options.body });
        return Promise.resolve();
      },
    } as unknown as Parameters<typeof attachScreenEvidence>[1];
    const driver = { getPageSource: () => Promise.resolve(xml) } as unknown as Parameters<
      typeof attachScreenEvidence
    >[0];
    await attachScreenEvidence(driver, info, 'sample');
    expect(attached.map((a) => a.name)).toEqual(['sample.elements.json']);
    const body = attached[0].body;
    expect(body).toContain('Code sent to [digits]');
    expect(body).toContain('[digits]');
    for (const secret of ['12345678', '2468', '13579', 'typed-secret-value']) {
      expect(body, secret).not.toContain(secret);
    }
    expect(JSON.stringify(maskedInventory(xml))).not.toMatch(/\d{4,}/);
    // A page source that cannot be read attaches nothing and does not throw.
    const dead = {
      getPageSource: () => Promise.reject(new Error('gone')),
    } as unknown as Parameters<typeof attachScreenEvidence>[0];
    await attachScreenEvidence(dead, info, 'dead');
    expect(attached).toHaveLength(1);
  });
});

test.describe('iOS OTP screen: the resend view asks for the exact label (selfcheck, fake driver)', () => {
  test('both lookups are exact-label predicates of one element type, never positional', async () => {
    const asked: string[] = [];
    const driver = {
      $$: (selector: string) => {
        asked.push(selector);
        return { getElements: () => Promise.resolve([]) };
      },
    } as never;
    expect(await new IosOtpScreen(driver).resendOffered('a "quoted" label')).toBe(false);
    expect(asked).toEqual([
      '-ios predicate string:type == "XCUIElementTypeButton" AND label == "a \\"quoted\\" label"',
      '-ios predicate string:type == "XCUIElementTypeStaticText" AND label == "a \\"quoted\\" label"',
    ]);
    for (const selector of asked) expect(selector).not.toMatch(/\[\d+\]|index|xpath|parent::/i);
  });
});
