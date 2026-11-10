import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IOS_TEST_DEALER_VARIABLES, parseIosDealerId } from '../../config/credentials.config';
import {
  ACCOUNT_TEST_POLICY,
  type AccountTestPolicy,
  accountPolicyProblem,
  accountPolicyProblems,
} from '../../config/ios-account-policy';
import {
  accountRunProblem,
  type AccountRunKind,
} from '../../src/mobile/ios/account/account-preflight';
import { AppStateMarker, RecoveryJournal } from '../../src/mobile/ios/account/recovery-journal';
import { IOS_ACCESSIBILITY_IDS } from '../../src/mobile/ios/ios-selectors';
import { expect, test } from '../support/fixtures';
import {
  completePolicy,
  emptyPolicy,
  fact,
  FIXTURE_NOW,
} from '../support/ios/account-policy-fixture';

/** Offline: nothing here reads .env, contacts a backend or touches a device. */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const problems = (policy: AccountTestPolicy) =>
  accountPolicyProblems(policy, fs.existsSync, FIXTURE_NOW);
const clone = (): AccountTestPolicy => structuredClone(completePolicy);

/** Every required fact: its place in the policy and the name used in the messages. */
const REQUIRED: [
  string,
  (p: AccountTestPolicy) => unknown,
  (p: AccountTestPolicy, v: unknown) => void,
][] = [
  ['OTP maximum requests', (p) => p.otp.maxRequests, (p, v) => (p.otp.maxRequests = v as never)],
  [
    'OTP request window (minutes)',
    (p) => p.otp.windowMinutes,
    (p, v) => (p.otp.windowMinutes = v as never),
  ],
  [
    'OTP cooldown between requests (seconds)',
    (p) => p.otp.cooldownSeconds,
    (p, v) => (p.otp.cooldownSeconds = v as never),
  ],
  ['OTP limit scope', (p) => p.otp.limitScope, (p, v) => (p.otp.limitScope = v as never)],
  [
    'OTP verification attempts per code',
    (p) => p.otp.verificationAttemptsPerCode,
    (p, v) => (p.otp.verificationAttemptsPerCode = v as never),
  ],
  [
    'incorrect OTP invalidates the code',
    (p) => p.otp.incorrectOtpInvalidatesCode,
    (p, v) => (p.otp.incorrectOtpInvalidatesCode = v as never),
  ],
  [
    'OTP lifetime (seconds)',
    (p) => p.otp.lifetimeSeconds,
    (p, v) => (p.otp.lifetimeSeconds = v as never),
  ],
  [
    'fixed staging OTP follows the same rules',
    (p) => p.otp.fixedOtpFollowsSameRules,
    (p, v) => (p.otp.fixedOtpFollowsSameRules = v as never),
  ],
  [
    'staging sends real SMS',
    (p) => p.otp.stagingSendsRealSms,
    (p, v) => (p.otp.stagingSendsRealSms = v as never),
  ],
  [
    'login failure threshold',
    (p) => p.login.failureThreshold,
    (p, v) => (p.login.failureThreshold = v as never),
  ],
  [
    'login failure counting window (minutes)',
    (p) => p.login.countingWindowMinutes,
    (p, v) => (p.login.countingWindowMinutes = v as never),
  ],
  [
    'account-lock duration',
    (p) => p.login.lockDuration,
    (p, v) => (p.login.lockDuration = v as never),
  ],
  [
    'wrong OTP attempts count toward account lock',
    (p) => p.login.wrongOtpCountsTowardLock,
    (p, v) => (p.login.wrongOtpCountsTowardLock = v as never),
  ],
  [
    'recovery and unlock procedure',
    (p) => p.recovery.procedure,
    (p, v) => (p.recovery.procedure = v as never),
  ],
];

test.describe('iOS account policy schema: the real policy is empty (selfcheck)', () => {
  test('every field of the real policy is unrecorded: no default, no threshold, no assumption', () => {
    const leaves: [string, unknown][] = [];
    const walk = (value: unknown, at: string) => {
      if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) walk(child, `${at}.${key}`);
      } else leaves.push([at, value]);
    };
    walk(ACCOUNT_TEST_POLICY, 'policy');
    // The QA owner's decision is recorded as a risk acceptance, never as a backend value.
    const own = leaves.filter(([at]) => !at.startsWith('policy.acceptedUnrecordedFacts'));
    expect(own.length).toBeGreaterThanOrEqual(16);
    // Only two things are recorded (Q10 and the test account), both labeled as user-provided statements.
    const recorded = ['policy.login.failureThreshold', 'policy.testAccount'];
    for (const [at, value] of own) {
      if (recorded.some((r) => at.startsWith(r))) continue;
      expect(value, at).toBeNull();
    }
    const q10 = ACCOUNT_TEST_POLICY.login.failureThreshold;
    expect(q10?.value).toBe('none');
    expect(q10?.source).toMatch(/not a verified backend statement/);
    expect(q10?.source).not.toMatch(/backend team|per the backend|confirmed by/i);
    const account = ACCOUNT_TEST_POLICY.testAccount;
    expect(account?.source).toMatch(/not verified backend statements/);
    expect(account?.approval.by).toBe('QA owner');
    expect(account?.confirmations).toEqual({
      backOfficeRecordChecked: true,
      phoneIsQaControlled: true,
      noRealCustomerData: true,
      usedOnlyByAutomation: true,
      recoveryRouteConfirmed: true,
    });
    // The recovery confirmation is limited to Login/Logout; OTP recovery (Q12) is still not recorded.
    expect(account?.source).toMatch(/Q12.*unresolved/);
    expect(ACCOUNT_TEST_POLICY.recovery.procedure).toBeNull();
    expect(account?.currentPasswordVerified?.source).toMatch(/not a verified backend statement/);
    // The declaration (apart from that decision record) contains no number and no true/false.
    const source = read('config/ios-account-policy.ts');
    const start = source.indexOf('export const ACCOUNT_TEST_POLICY');
    const block = source.slice(start, source.indexOf('\n};', start) + 3);
    const rest = block.slice(block.indexOf('  otp: {'));
    expect(
      rest
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/failureThreshold: \{[\s\S]*?\n {4}\},\n/, '')
        .replace(/testAccount: \{[\s\S]*?\n {2}\},\n/, ''),
    ).not.toMatch(/\d|true|false/);
  });

  test('no unknown backend fact is accepted as a risk: all stay required', () => {
    expect(ACCOUNT_TEST_POLICY.acceptedUnrecordedFacts).toBeNull();
    const all = accountPolicyProblems(emptyPolicy, fs.existsSync, FIXTURE_NOW);
    // 14 backend facts plus the account confirmation (the shared items are counted once each).
    expect(all).toHaveLength(REQUIRED.length + 1);
    expect(all.some((m) => /not confirmed/.test(m))).toBe(true);
    expect(emptyPolicy.testAccount).toBeNull();
  });

  test('an accepted-unrecorded-facts record is itself a problem and lifts nothing', () => {
    for (const accepted of [
      { facts: ['otp.maxRequests'], source: 'x', approval: { by: 'QA owner', on: '2026-11-09' } },
      { facts: [], source: 'x', approval: { by: 'QA owner', on: '2026-11-09' } },
      true,
      {},
    ]) {
      const policy = { ...clone(), acceptedUnrecordedFacts: accepted as never };
      expect(problems(policy).join(' | ')).toMatch(/accepted unrecorded facts are not allowed/);
      // Still blocked on every unrecorded fact: nothing is skipped.
      const empty = { ...emptyPolicy, acceptedUnrecordedFacts: accepted as never };
      expect(problems(empty)).toHaveLength(REQUIRED.length + 2);
    }
    // A complete policy with the field set is blocked only by the field.
    expect(problems({ ...clone(), acceptedUnrecordedFacts: {} as never })).toHaveLength(1);
  });

  test('every required value is named when missing, and approvals that are optional are not', () => {
    const list = accountPolicyProblems(
      { ...emptyPolicy, acceptedUnrecordedFacts: null },
      fs.existsSync,
      FIXTURE_NOW,
    );
    expect(list).toHaveLength(REQUIRED.length + 1);
    for (const [name] of REQUIRED) expect(list, name).toContain(`${name} is not recorded`);
    expect(list).toContain('the dedicated synthetic dealer test account is not confirmed');
    // "None approved" for chains and negative tests is the default state, not a problem.
    expect(list.join(' ')).not.toMatch(/approved OTP chains|negative credential/);
    // The real policy records nothing, so the message names every missing backend fact and the account.
    expect(accountPolicyProblem(emptyPolicy)).toMatch(
      /^Account tests are blocked until config\/ios-account-policy\.ts records and approves: .*not confirmed\.$/,
    );
  });

  test('every account run kind stays blocked until the account is confirmed, whatever the switches', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-policy-'));
    try {
      const kinds: AccountRunKind[] = [
        'unregistered-login',
        'login',
        'otp-flow-chain',
        'otp-reset-chain',
        'negative-chain',
      ];
      for (const kind of kinds) {
        const blocked = accountRunProblem(kind, {
          env: {
            IOS_ALLOW_ACCOUNT_ACTIONS: 'true',
            MAZAD_ALLOW_OTP_REQUESTS: 'true',
            IOS_ALLOW_PASSWORD_RESET: 'true',
            MAZAD_ALLOW_PASSWORD_RESET: 'true',
            MAZAD_ALLOW_LOGOUT: 'true',
          },
          policy: emptyPolicy,
          missingLocalEnv: () => [],
          journal: new RecoveryJournal(dir),
          marker: new AppStateMarker(dir),
          chainId: 'dealer-ar-flow',
        });
        expect(blocked, kind).toMatch(
          /Account tests are blocked until config\/ios-account-policy\.ts/,
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('iOS account policy schema: a complete, approved policy (selfcheck)', () => {
  test('the selfcheck-only complete policy passes (and is not the real one)', () => {
    expect(problems(completePolicy)).toEqual([]);
    expect(accountPolicyProblem(completePolicy, fs.existsSync, FIXTURE_NOW)).toBeUndefined();
    expect(ACCOUNT_TEST_POLICY.otp.maxRequests).toBeNull();
  });

  test('removing any one required value blocks, naming exactly that value', () => {
    for (const [name, , set] of REQUIRED) {
      const policy = clone();
      set(policy, null);
      expect(problems(policy), name).toEqual([`${name} is not recorded`]);
    }
    for (const field of ['testAccount'] as const) {
      const policy = clone();
      policy[field] = null;
      expect(problems(policy)).toEqual([
        'the dedicated synthetic dealer test account is not confirmed',
      ]);
    }
  });

  test('values are validated: wrong type, zero, fraction, unknown word are all refused', () => {
    const badNumbers = [
      0,
      -1,
      1.5,
      '5',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null,
      undefined,
      true,
    ];
    for (const [name, get, set] of REQUIRED.filter(([n]) =>
      /maximum requests|window|attempts per code|lifetime|failure threshold|counting window/.test(
        n,
      ),
    )) {
      for (const bad of badNumbers) {
        const policy = clone();
        set(policy, { ...(get(policy) as object), value: bad });
        expect(problems(policy).join(' | '), `${name} = ${String(bad)}`).toContain(
          `${name}: must be a positive integer`,
        );
      }
    }
    // The cooldown may be 0 (no minimum interval is a recorded fact) but not negative or fractional.
    for (const bad of [-1, 1.5, '0', null]) {
      const policy = clone();
      policy.otp.cooldownSeconds = { ...fact(0), value: bad as never };
      expect(problems(policy).join(' | '), `cooldown ${String(bad)}`).toContain(
        'must be a non-negative integer',
      );
    }
    for (const bad of ['yes', 1, 0, null, undefined]) {
      for (const [name, get, set] of REQUIRED.filter(([n]) =>
        /invalidates|same rules|real SMS|toward account lock/.test(n),
      )) {
        const policy = clone();
        set(policy, { ...(get(policy) as object), value: bad });
        expect(problems(policy).join(' | '), `${name} = ${String(bad)}`).toContain(
          `${name}: must be true or false`,
        );
      }
    }
    // A plain "no" is a recorded fact: false is valid.
    const noSms = clone();
    noSms.otp.stagingSendsRealSms = fact(false);
    expect(problems(noSms)).toEqual([]);
    for (const bad of [0, -5, 1.5, 'forever', 'Until-Manual-Unlock', null]) {
      const policy = clone();
      policy.login.lockDuration = { ...fact(30), value: bad as never };
      expect(problems(policy).join(' | '), `lock ${String(bad)}`).toContain(
        'account-lock duration: must be a positive number of minutes',
      );
    }
    const timed = clone();
    timed.login.lockDuration = fact(30);
    expect(problems(timed)).toEqual([]);
  });

  test('the limit scope must record all four scopes explicitly, and apply to at least one', () => {
    const cases: [string, unknown, RegExp][] = [
      [
        'missing scope',
        { perAccount: true, perIp: false, perDevice: false },
        /perUnregisteredNumber must be true, false or "not-applicable"/,
      ],
      [
        'unknown word',
        { perAccount: true, perIp: 'unknown', perDevice: false, perUnregisteredNumber: false },
        /perIp must be true, false or "not-applicable"/,
      ],
      [
        'extra scope',
        {
          perAccount: true,
          perIp: false,
          perDevice: false,
          perUnregisteredNumber: false,
          perCountry: true,
        },
        /unknown scope\(s\) perCountry/,
      ],
      [
        'all false',
        { perAccount: false, perIp: false, perDevice: false, perUnregisteredNumber: false },
        /at least one scope/,
      ],
      [
        'all not applicable',
        {
          perAccount: 'not-applicable',
          perIp: 'not-applicable',
          perDevice: 'not-applicable',
          perUnregisteredNumber: 'not-applicable',
        },
        /at least one scope/,
      ],
      ['not an object', 'per account', /must record perAccount/],
    ];
    for (const [name, value, message] of cases) {
      const policy = clone();
      policy.otp.limitScope = { ...fact(value) } as never;
      expect(problems(policy).join(' | '), name).toMatch(message);
    }
  });

  test('the recovery procedure must be an existing docs/*.md file', () => {
    for (const documentedIn of [
      '../outside.md',
      'README.md',
      'docs/missing-file.md',
      'docs/x.txt',
      '',
      'docs/../README.md',
    ]) {
      const policy = clone();
      policy.recovery.procedure = fact({ documentedIn });
      expect(problems(policy).join(' | '), documentedIn).toContain(
        'documentedIn must be an existing docs/*.md file',
      );
    }
  });

  test('every value needs a real source, approver and approval date', () => {
    const edits: [string, (r: Record<string, unknown>) => void, RegExp][] = [
      ['empty source', (r) => (r.source = ' '), /source is missing or a placeholder/],
      ['placeholder source', (r) => (r.source = 'unknown'), /source is missing or a placeholder/],
      [
        'placeholder approver',
        (r) => (r.approval = { by: 'TBD', on: '2026-11-09' }),
        /approval\.by is missing/,
      ],
      [
        'empty approver',
        (r) => (r.approval = { by: '', on: '2026-11-09' }),
        /approval\.by is missing/,
      ],
      [
        'missing approval',
        (r) => delete r.approval,
        /approval\.by is missing[\s\S]*approval\.on must be a real date/,
      ],
      [
        'wrong date format',
        (r) => (r.approval = { by: 'QA owner', on: '09/11/2026' }),
        /approval\.on must be a real date/,
      ],
      [
        'impossible date',
        (r) => (r.approval = { by: 'QA owner', on: '2026-02-30' }),
        /approval\.on must be a real date/,
      ],
      [
        'future date',
        (r) => (r.approval = { by: 'QA owner', on: '2026-11-10' }),
        /approval\.on is in the future/,
      ],
      ['unknown extra field', (r) => (r.default = 3), /unknown field\(s\) default/],
    ];
    for (const [name, , set] of REQUIRED) {
      for (const [what, edit, message] of edits) {
        const policy = clone();
        const record = {
          ...(REQUIRED.find(([n]) => n === name)![1](policy) as Record<string, unknown>),
        };
        edit(record);
        set(policy, record);
        expect(problems(policy).join(' | '), `${name}: ${what}`).toMatch(message);
      }
    }
  });

  test('the test account needs every confirmation, and a real source and approval', () => {
    const keys = [
      'backOfficeRecordChecked',
      'phoneIsQaControlled',
      'noRealCustomerData',
      'usedOnlyByAutomation',
      'recoveryRouteConfirmed',
    ] as const;
    for (const key of keys) {
      for (const bad of [false, undefined]) {
        const policy = clone();
        (policy.testAccount!.confirmations as unknown as Record<string, unknown>)[key] = bad;
        expect(problems(policy).join(' | '), `${key}=${String(bad)}`).toContain(
          `test account: not confirmed: ${key}`,
        );
      }
    }
    const notConfirmed = clone();
    (
      notConfirmed.testAccount as { confirmedSyntheticAndDedicated: boolean }
    ).confirmedSyntheticAndDedicated = false;
    expect(problems(notConfirmed).join(' | ')).toContain(
      'must be confirmed synthetic and dedicated',
    );
    const individual = clone();
    (individual.testAccount as { role: string }).role = 'individual';
    expect(problems(individual).join(' | ')).toContain(
      'must be confirmed synthetic and dedicated (dealer)',
    );
    const noApproval = clone();
    noApproval.testAccount = {
      ...noApproval.testAccount!,
      source: '',
      approval: { by: '', on: '' },
    };
    expect(problems(noApproval).join(' | ')).toMatch(
      /test account: source is missing[\s\S]*approval\.by is missing[\s\S]*approval\.on must be a real date/,
    );
  });

  test('chain and negative-test approvals: none by default; a recorded one must be valid', () => {
    const none = clone();
    none.approvedOtpChains = null;
    none.negativeCredentialTests = null;
    expect(problems(none)).toEqual([]);
    for (const [name, ids] of [
      ['empty list', []],
      ['unknown chain', ['dealer-en-reset', 'individual-en-reset']],
      ['not a list', 'dealer-en-reset'],
    ] as const) {
      const policy = clone();
      policy.approvedOtpChains = { ...policy.approvedOtpChains!, ids: ids as never };
      expect(problems(policy).join(' | '), name).toContain(
        'approved OTP chains: ids must be a non-empty list of known chain ids',
      );
    }
    const noSource = clone();
    noSource.approvedOtpChains = { ...noSource.approvedOtpChains!, source: '' };
    expect(problems(noSource).join(' | ')).toContain('approved OTP chains: source is missing');
    // Explicitly "not approved" is a valid recorded fact.
    const declined = clone();
    declined.negativeCredentialTests = fact(false);
    expect(problems(declined)).toEqual([]);
    const badNegative = clone();
    badNegative.negativeCredentialTests = { ...fact(true), source: '' };
    expect(problems(badNegative).join(' | ')).toContain(
      'negative credential tests approval: source is missing',
    );
  });

  test('an incomplete or unapproved policy blocks every account run kind; a complete one lifts only that gate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-policy-'));
    try {
      const run = (kind: AccountRunKind, policy: AccountTestPolicy, chainId?: 'dealer-ar-flow') =>
        accountRunProblem(kind, {
          env: {
            IOS_ALLOW_ACCOUNT_ACTIONS: 'true',
            MAZAD_ALLOW_OTP_REQUESTS: 'true',
            MAZAD_ALLOW_LOGOUT: 'true',
            IOS_ALLOW_PASSWORD_RESET: 'true',
            MAZAD_ALLOW_PASSWORD_RESET: 'true',
          },
          policy,
          missingLocalEnv: () => [],
          journal: new RecoveryJournal(dir),
          marker: new AppStateMarker(dir),
          chainId,
          now: FIXTURE_NOW,
        });
      // Each kind is blocked by a missing fact of ITS OWN sets (and only those).
      const noCooldown = clone();
      noCooldown.otp.cooldownSeconds = null;
      for (const kind of [
        'unregistered-otp-request',
        'otp-flow-chain',
        'negative-chain',
        'otp-reset-chain',
      ] as const) {
        expect(run(kind, noCooldown, 'dealer-ar-flow'), kind).toContain(
          'OTP cooldown between requests (seconds) is not recorded',
        );
      }
      const noThreshold = clone();
      noThreshold.login.failureThreshold = null;
      for (const kind of [
        'unregistered-login',
        'login',
        'negative-chain',
        'otp-reset-chain',
      ] as const) {
        expect(run(kind, noThreshold, 'dealer-ar-flow'), kind).toContain(
          'login failure threshold is not recorded',
        );
      }
      // Login does not wait for OTP facts, and an OTP request does not wait for lock rules.
      expect(run('login', noCooldown)).toBeUndefined();
      expect(run('unregistered-otp-request', noThreshold)).toBeUndefined();
      expect(run('otp-flow-chain', completePolicy, 'dealer-ar-flow')).toBeUndefined();
      // Complete values do not approve a chain by themselves.
      const noChains = clone();
      noChains.approvedOtpChains = null;
      expect(run('otp-flow-chain', noChains, 'dealer-ar-flow')).toMatch(
        /OTP chain "dealer-ar-flow" is not approved/,
      );
      const declined = clone();
      declined.negativeCredentialTests = fact(false);
      expect(run('negative-chain', declined, 'dealer-ar-flow')).toMatch(
        /not approved \(negativeCredentialTests\)/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('iOS account policy: related restrictions stay in place (selfcheck)', () => {
  test('.env.example lists the two account variable NAMES only, with no value', () => {
    const lines = read('.env.example').split('\n');
    expect(lines).toContain('IOS_TEST_DEALER_ID=');
    expect(lines).toContain('IOS_TEST_DEALER_PHONE=');
    expect(lines).toContain('IOS_TEST_DEALER_PASSWORD=');
    expect(lines.filter((l) => /^IOS_TEST_DEALER_/.test(l))).toHaveLength(3);
  });

  test('the selector registry holds no proposed id: every id is still empty', () => {
    const ids = Object.values(IOS_ACCESSIBILITY_IDS).flatMap((group) => Object.values(group));
    expect(ids.length).toBeGreaterThan(15);
    expect(ids.filter((id) => id !== '')).toEqual([]);
  });

  test('the policy module never reads .env or the environment', () => {
    const code = read('config/ios-account-policy.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/process\.env|dotenv|\.env\b|credentials\.config/);
  });
});

test.describe('iOS account policy: recording "no limit" and "none" (selfcheck)', () => {
  test('unlimited attempts and a never-locking threshold are recordable facts; a threshold of none needs no window or lock duration', () => {
    const policy = clone();
    policy.otp.verificationAttemptsPerCode = fact('unlimited') as never;
    policy.login.failureThreshold = fact('none') as never;
    policy.login.countingWindowMinutes = null;
    policy.login.lockDuration = null;
    expect(problems(policy)).toEqual([]);
    // With a numeric threshold the window and the lock duration are required again.
    policy.login.failureThreshold = fact(5);
    expect(problems(policy)).toEqual([
      'login failure counting window (minutes) is not recorded',
      'account-lock duration is not recorded',
    ]);
    // Anything but a number or the exact word is refused.
    for (const bad of ['no limit', 'NONE', 0, -1, 2.5, true]) {
      const wrong = clone();
      wrong.otp.verificationAttemptsPerCode = fact(bad) as never;
      expect(problems(wrong).join(' | '), String(bad)).toMatch(
        /OTP verification attempts per code: must be a positive integer or "unlimited"/,
      );
    }
    for (const bad of ['unlimited', 'never', 0, -3]) {
      const wrong = clone();
      wrong.login.failureThreshold = fact(bad) as never;
      expect(problems(wrong).join(' | '), String(bad)).toMatch(
        /login failure threshold: must be a positive integer or "none"/,
      );
    }
    // This change records nothing: the real policy still holds no attempts limit.
    expect(ACCOUNT_TEST_POLICY.otp.verificationAttemptsPerCode).toBeNull();
  });
});

test.describe('iOS Dealer account configuration comes from .env only (selfcheck)', () => {
  test('the three account variables are the Dealer ID, phone and password, and are all required by the preflight', () => {
    expect([...IOS_TEST_DEALER_VARIABLES]).toEqual([
      'IOS_TEST_DEALER_ID',
      'IOS_TEST_DEALER_PHONE',
      'IOS_TEST_DEALER_PASSWORD',
    ]);
    const preflight = read('src/mobile/ios/account/account-preflight.ts');
    for (const name of IOS_TEST_DEALER_VARIABLES) expect(preflight, name).toContain(`'${name}'`);
    const config = read('config/credentials.config.ts');
    for (const name of IOS_TEST_DEALER_VARIABLES)
      expect(config, name).toContain(`localEnv.${name}`);
    expect(config).not.toMatch(/process\.env\.IOS_TEST_DEALER/);
  });

  test('an Dealer ID that is missing or not a plain account ID is rejected, so a bad configuration fails safely', () => {
    expect(parseIosDealerId('715')).toBe('715');
    expect(parseIosDealerId(' 42 ')).toBe('42');
    for (const bad of [
      undefined,
      '',
      '  ',
      '0',
      '007',
      '-5',
      '7 15',
      '71.5',
      '1e3',
      'abc',
      '71a',
      '1234567890',
      '715; drop',
      '０７',
    ]) {
      expect(parseIosDealerId(bad), String(bad)).toBeNull();
    }
  });

  test('no executable file holds a Dealer account ID, phone or password: the account is chosen in .env', () => {
    const roots = [
      'src',
      'tests-ios',
      'config',
      'scripts',
      'ui-tests',
      'playwright.ios.config.ts',
      'package.json',
    ];
    const files: string[] = [];
    const add = (rel: string) => {
      const full = path.join(ROOT, rel);
      if (!fs.existsSync(full)) return;
      if (fs.statSync(full).isDirectory()) {
        for (const f of fs.readdirSync(full, { recursive: true, encoding: 'utf8' })) {
          const child = path.join(rel, f);
          if (fs.statSync(path.join(ROOT, child)).isFile()) files.push(child);
        }
      } else files.push(rel);
    };
    roots.forEach(add);
    for (const file of files) {
      if (!/\.(ts|mjs|js|json|sh)$/.test(file) || file.includes('selfcheck')) continue;
      const code = read(file);
      expect(code, file).not.toMatch(/\b(715|1331|779)\b/);
      // No Saudi-style phone literal either.
      expect(code, file).not.toMatch(/['"`]\+?(966|0)5\d{8}['"`]/);
    }
  });
});
