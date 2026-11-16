import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  ACCOUNT_TEST_POLICY,
  type AccountTestPolicy,
  accountPolicyProblems,
  currentPasswordVerified,
} from '../../config/ios-account-policy';
import {
  type AccountRunContext,
  type AccountRunKind,
  OTP_REQUEST_KINDS,
  SWITCHES,
} from '../../src/mobile/ios/account/account-preflight';
import {
  AccountActionNotAuthorized,
  authorizeAccountAction,
} from '../../src/mobile/ios/account/action-guard';
import {
  appendLedgerEntry,
  initializeLedger,
  LEDGER_FILE,
  LEDGER_HEADER,
  LOCK_FILE,
  readLedger,
  TECHNICAL_LIMITS,
  technicalLimitProblem,
  VALID_OTP_MARKER_KIND,
} from '../../src/mobile/ios/account/otp-ledger';
import {
  issueOtpRequestPermit,
  OtpAuthorizationError,
  OtpRequestPermit,
  PERMIT_LIFETIME_MS,
  recordValidOtpEntered,
} from '../../src/mobile/ios/account/otp-permit';
import { AppStateMarker, RecoveryJournal } from '../../src/mobile/ios/account/recovery-journal';
import { IosForgotPasswordScreen } from '../../src/mobile/ios/screens/forgot-password.screen';
import { IosLoginScreen } from '../../src/mobile/ios/screens/login.screen';
import { IosNewPasswordScreen } from '../../src/mobile/ios/screens/new-password.screen';
import { IosOtpScreen } from '../../src/mobile/ios/screens/otp.screen';
import { IosRegistrationScreen } from '../../src/mobile/ios/screens/registration.screen';
import { expect, test } from '../support/fixtures';
import {
  completePolicy,
  emptyPolicy,
  fact,
  FIXTURE_NOW,
} from '../support/ios/account-policy-fixture';

/**
 * Offline security tests for the account authorization layer. No device, Appium, staging, .env or
 * OTP: screens run against a fake driver that only records what it was asked to do, and the ledger
 * lives in temporary folders. Child processes load a copy of the ledger source to prove the
 * behaviour across processes.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const exec = promisify(execFile);

const SWITCH_NAMES = [
  'IOS_ALLOW_ACCOUNT_ACTIONS',
  'IOS_ALLOW_PASSWORD_RESET',
  'MAZAD_ALLOW_OTP_REQUESTS',
  'MAZAD_ALLOW_PASSWORD_RESET',
  'MAZAD_ALLOW_LOGOUT',
] as const;
const ALL_ON = Object.fromEntries(SWITCH_NAMES.map((n) => [n, 'true'])) as Record<string, string>;
const PHONE = '0509999999';
const OTHER_PHONE = '0509999998';

const clone = (): AccountTestPolicy => structuredClone(completePolicy);

const withDir = async <T>(fn: (dir: string) => T | Promise<T>): Promise<T> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-authz-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** A journal that records a COMPLETED reset to the baseline (what a dealer login needs). */
function journalWithBaseline(dir: string): RecoveryJournal {
  const journal = new RecoveryJournal(dir);
  journal.begin('seed-run', '0*******00');
  journal.mark('seed-run', 'restored');
  return journal;
}

function context(dir: string, over: Partial<AccountRunContext> = {}): AccountRunContext {
  return {
    env: ALL_ON,
    policy: completePolicy,
    missingLocalEnv: () => [],
    journal: over.journal ?? journalWithBaseline(dir),
    marker: new AppStateMarker(dir),
    chainId: 'dealer-ar-flow',
    now: FIXTURE_NOW,
    ...over,
  };
}

/** A driver that records every type and tap; every lookup finds exactly one element. */
function fakeDriver() {
  const events: string[] = [];
  const element = (selector: string) => ({
    click: () => Promise.resolve(void events.push(`click ${selector}`)),
    setValue: () => Promise.resolve(void events.push(`type ${selector}`)),
    isDisplayed: () => Promise.resolve(true),
    isEnabled: () => Promise.resolve(true),
    isExisting: () => Promise.resolve(true),
    getLocation: () => Promise.resolve({ x: 0, y: 0 }),
    getSize: () => Promise.resolve({ width: 1, height: 1 }),
    getAttribute: () => Promise.resolve(null),
  });
  const driver = {
    $$: (selector: string) => ({ getElements: () => Promise.resolve([element(selector)]) }),
    $: (selector: string) => element(selector),
    isKeyboardShown: () => Promise.resolve(false),
    hideKeyboard: () => Promise.resolve(),
    pause: () => Promise.resolve(),
    // Supports tapAtCenterOf's coordinate tap (new-password.screen.ts's Save/Login button).
    action: () => {
      const chain = {
        move: () => chain,
        down: () => chain,
        up: () => chain,
        pause: () => chain,
        perform: () => Promise.resolve(void events.push('click pointer-action')),
      };
      return chain;
    },
  };
  return { driver: driver as never, events };
}
const tapped = (events: string[]) => events.some((e) => e.startsWith('click'));

let counter = 0;
const unique = (prefix: string) => `${prefix}-${counter++}`;

/** The six account operations, each driven through the real screen method with the given context. */
interface Operation {
  name: string;
  kind: AccountRunKind;
  run: (ctx: AccountRunContext, dir: string) => Promise<string[]>;
}
const OPERATIONS: Operation[] = [
  {
    name: 'unregistered login',
    kind: 'unregistered-login',
    run: async (ctx) => {
      const { driver, events } = fakeDriver();
      await new IosLoginScreen(driver)
        .login(PHONE, 'Not-The-Password-1', { kind: 'unregistered-login', ctx })
        .catch(() => undefined);
      return events;
    },
  },
  {
    name: 'dealer login',
    kind: 'login',
    run: async (ctx) => {
      const { driver, events } = fakeDriver();
      await new IosLoginScreen(driver)
        .login(PHONE, 'Not-The-Password-1', { kind: 'login', ctx })
        .catch(() => undefined);
      return events;
    },
  },
  {
    name: 'unregistered OTP request',
    kind: 'unregistered-otp-request',
    run: async (ctx, dir) => {
      initializeLedger(dir);
      const { driver, events } = fakeDriver();
      try {
        const permit = issueOtpRequestPermit({
          kind: 'unregistered-otp-request',
          scenario: unique('matrix-otp'),
          phone: PHONE,
          target: 'unregistered',
          deps: { ctx, ledgerDir: dir, runId: unique('run'), now: () => FIXTURE_NOW },
        });
        await new IosForgotPasswordScreen(driver).requestPasswordReset(PHONE, permit);
      } catch {
        // Refused: the fake driver recorded nothing.
      }
      return events;
    },
  },
  {
    name: 'OTP validation',
    kind: 'otp-flow-chain',
    run: async (ctx) => {
      const { driver, events } = fakeDriver();
      await new IosOtpScreen(driver)
        .verifyOtp('1234', 'Verify', { kind: 'otp-flow-chain', chainId: 'dealer-ar-flow', ctx })
        .catch(() => undefined);
      return events;
    },
  },
  {
    name: 'OTP negative scenario',
    kind: 'negative-chain',
    run: async (ctx) => {
      const { driver, events } = fakeDriver();
      await new IosOtpScreen(driver)
        .verifyOtp('9999', 'Verify', {
          kind: 'negative-chain',
          chainId: 'dealer-ar-incorrect-otp',
          ctx,
        })
        .catch(() => undefined);
      return events;
    },
  },
  {
    name: 'password reset',
    kind: 'otp-reset-chain',
    run: async (ctx) => {
      const { driver, events } = fakeDriver();
      await new IosNewPasswordScreen(driver)
        .setNewPassword(
          'Baseline-1!',
          'Save',
          { kind: 'otp-reset-chain', chainId: 'dealer-en-reset', ctx },
          'save',
        )
        .catch(() => undefined);
      return events;
    },
  },
];

test.describe('iOS five-switch matrix: every operation enforces its own switches (selfcheck)', () => {
  test('the required switches of each operation are exactly the approved matrix', () => {
    expect(Object.fromEntries(OPERATIONS.map((o) => [o.name, SWITCHES[o.kind]]))).toEqual({
      'unregistered login': ['IOS_ALLOW_ACCOUNT_ACTIONS'],
      'dealer login': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_LOGOUT'],
      'unregistered OTP request': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
      'OTP validation': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
      'OTP negative scenario': ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
      'password reset': [
        'IOS_ALLOW_ACCOUNT_ACTIONS',
        'MAZAD_ALLOW_OTP_REQUESTS',
        'IOS_ALLOW_PASSWORD_RESET',
        'MAZAD_ALLOW_PASSWORD_RESET',
        'MAZAD_ALLOW_LOGOUT',
      ],
    });
  });

  test('over all 32 switch combinations an action happens exactly when all of its switches are on', async () => {
    for (const operation of OPERATIONS) {
      const required = SWITCHES[operation.kind];
      for (let mask = 0; mask < 32; mask++) {
        const env: Record<string, string> = {};
        SWITCH_NAMES.forEach((name, i) => {
          // Alternate between "false" and "unset" for an off switch: both must refuse.
          if (mask & (1 << i)) env[name] = 'true';
          else if (mask % 2) env[name] = 'false';
        });
        const allRequiredOn = required.every((name) => env[name] === 'true');
        const events = await withDir((dir) => operation.run(context(dir, { env }), dir));
        expect(tapped(events), `${operation.name} mask ${mask}`).toBe(allRequiredOn);
        if (!allRequiredOn) expect(events, `${operation.name} mask ${mask}`).toEqual([]);
      }
    }
  });

  test('a switch must be exactly "true": other truthy-looking values do not count', async () => {
    for (const operation of OPERATIONS) {
      for (const value of ['TRUE', '1', 'yes', ' true', 'true ', '']) {
        const env = Object.fromEntries(SWITCH_NAMES.map((n) => [n, value]));
        const events = await withDir((dir) => operation.run(context(dir, { env }), dir));
        expect(events, `${operation.name} "${value}"`).toEqual([]);
      }
    }
  });

  test('with the real policy (empty), no operation acts even with every switch on', async () => {
    for (const operation of OPERATIONS) {
      const events = await withDir((dir) =>
        operation.run(context(dir, { policy: emptyPolicy, env: ALL_ON }), dir),
      );
      expect(events, operation.name).toEqual([]);
    }
  });

  test('every operation also needs the confirmed synthetic account and its own policy facts', async () => {
    for (const operation of OPERATIONS) {
      const noAccount: AccountTestPolicy = { ...completePolicy, testAccount: null };
      expect(
        await withDir((dir) => operation.run(context(dir, { policy: noAccount }), dir)),
        `${operation.name} without the account`,
      ).toEqual([]);
      // The recovery procedure (Q12) is about an OTP block: the OTP operations need it, a Login/Logout does not.
      const noRecovery = structuredClone(completePolicy);
      noRecovery.recovery.procedure = null;
      const withoutRecovery = await withDir((dir) =>
        operation.run(context(dir, { policy: noRecovery }), dir),
      );
      if (OTP_REQUEST_KINDS.includes(operation.kind)) {
        expect(withoutRecovery, `${operation.name} without the recovery procedure`).toEqual([]);
      } else {
        expect(tapped(withoutRecovery), `${operation.name} needs no recovery procedure`).toBe(true);
      }
      // The same completed policy and switches do act, so the refusals above are the cause.
      expect(tapped(await withDir((dir) => operation.run(context(dir), dir))), operation.name).toBe(
        true,
      );
    }
  });
});

test.describe('iOS dealer login needs an established baseline password (selfcheck)', () => {
  test('without a completed reset to the baseline on record a dealer login is refused and nothing is typed or tapped', async () => {
    await withDir(async (dir) => {
      const cases: [string, RecoveryJournal][] = [
        ['an empty journal', new RecoveryJournal(dir)],
        [
          'a fake journal without the method',
          { problem: () => undefined } as unknown as RecoveryJournal,
        ],
      ];
      for (const [name, journal] of cases) {
        const { driver, events } = fakeDriver();
        await expect(
          new IosLoginScreen(driver).login(PHONE, 'x', {
            kind: 'login',
            ctx: context(dir, { journal }),
          }),
          name,
        ).rejects.toThrow(/baseline password is not established/);
        expect(events, name).toEqual([]);
      }
      // A reset that is only pending or applied is not evidence.
      const open = new RecoveryJournal(dir);
      open.begin('run-open', '0*******00');
      for (const state of ['pending', 'applied'] as const) {
        if (state === 'applied') open.mark('run-open', 'applied');
        expect(open.baselineEstablished(), state).toBe(false);
      }
      open.mark('run-open', 'restored');
      expect(open.baselineEstablished()).toBe(true);
      const { driver, events } = fakeDriver();
      await new IosLoginScreen(driver).login(PHONE, 'x', {
        kind: 'login',
        ctx: context(dir, { journal: open }),
      });
      expect(events.some((e) => e.startsWith('click'))).toBe(true);
    });
  });

  test('a recorded owner statement that the .env password is the current one also allows the login; nothing weaker does', async () => {
    await withDir(async (dir) => {
      const withStatement = (value: unknown): AccountTestPolicy => {
        const policy = clone();
        (policy.testAccount as unknown as Record<string, unknown>).currentPasswordVerified = value;
        return policy;
      };
      const login = async (policy: AccountTestPolicy) => {
        const { driver, events } = fakeDriver();
        const outcome = await new IosLoginScreen(driver)
          .login(PHONE, 'x', {
            kind: 'login',
            ctx: context(dir, { policy, journal: new RecoveryJournal(dir) }),
          })
          .then(() => 'allowed')
          .catch(() => 'refused');
        return { outcome, tapped: events.some((e) => e.startsWith('click')) };
      };
      // A valid, approved statement: allowed with an EMPTY journal.
      expect(await login(withStatement(fact(true)))).toEqual({ outcome: 'allowed', tapped: true });
      // Missing, false, malformed, placeholder, unapproved or future-dated statements: refused, nothing tapped.
      const bad: unknown[] = [
        undefined,
        fact(false),
        true,
        'yes',
        { value: true },
        { value: true, source: 'TBD', approval: { by: 'QA owner', on: '2026-11-09' } },
        { value: true, source: 'owner', approval: { by: '', on: '2026-11-09' } },
        { value: true, source: 'owner', approval: { by: 'QA owner', on: '2999-01-01' } },
      ];
      for (const value of bad) {
        expect(await login(withStatement(value)), JSON.stringify(value)).toEqual({
          outcome: 'refused',
          tapped: false,
        });
      }
      // No test account at all: no statement can exist.
      expect(await login({ ...clone(), testAccount: null })).toEqual({
        outcome: 'refused',
        tapped: false,
      });
      // The real policy holds no statement.
      expect(emptyPolicy.testAccount).toBeNull();
      expect(currentPasswordVerified(emptyPolicy)).toBe(false);
      expect(currentPasswordVerified(withStatement(fact(true)), FIXTURE_NOW)).toBe(true);
      expect(currentPasswordVerified(withStatement(fact(false)), FIXTURE_NOW)).toBe(false);
    });
  });

  test('an invalid recorded statement also blocks the policy itself, and an unrelated login kind is unaffected', () => {
    const policy = clone();
    (policy.testAccount as unknown as Record<string, unknown>).currentPasswordVerified = {
      value: 'yes',
    };
    expect(accountPolicyProblems(policy, fs.existsSync, FIXTURE_NOW).join(' | ')).toMatch(
      /current password verified/,
    );
    const ok = clone();
    (ok.testAccount as unknown as Record<string, unknown>).currentPasswordVerified = fact(true);
    expect(accountPolicyProblems(ok, fs.existsSync, FIXTURE_NOW)).toEqual([]);
  });

  test('an unregistered-number login does not need the baseline (it uses no account password)', async () => {
    await withDir(async (dir) => {
      const { driver, events } = fakeDriver();
      await new IosLoginScreen(driver).login(PHONE, 'x', {
        kind: 'unregistered-login',
        ctx: context(dir, { journal: new RecoveryJournal(dir) }),
      });
      expect(events.some((e) => e.startsWith('click'))).toBe(true);
    });
  });

  test('an unreadable journal file is no evidence', async () => {
    await withDir((dir) => {
      const journal = journalWithBaseline(dir);
      expect(journal.baselineEstablished()).toBe(true);
      const file = fs.readdirSync(dir).find((f) => f.endsWith('.json'));
      if (file) fs.writeFileSync(path.join(dir, file), '{ not json');
      expect(journal.baselineEstablished()).toBe(false);
      return Promise.resolve();
    });
  });

  test('the login spec skips explicitly when no reset is on record, and the guard checks at login time', () => {
    const spec = fs.readFileSync(path.join(ROOT, 'tests-ios/login.spec.ts'), 'utf8');
    expect(spec).toContain('baselineEstablishedNow()');
    expect(spec).toContain('Precondition not met: no completed reset to the baseline is on record');
    const guard = fs.readFileSync(
      path.join(ROOT, 'src/mobile/ios/account/action-guard.ts'),
      'utf8',
    );
    expect(guard).toContain("auth.kind === 'login'");
  });
});

test.describe('iOS login authorization: no way to tap Log In unguarded (selfcheck)', () => {
  const noAuthCases: [string, unknown][] = [
    ['no authorization', undefined],
    ['null', null],
    ['a string', 'login'],
    ['an empty object', {}],
    ['a numeric kind', { kind: 5 }],
    ['an unknown kind', { kind: 'unregistered-number' }],
    ['an OTP kind', { kind: 'otp-flow-chain', chainId: 'dealer-ar-flow' }],
    ['a reset kind', { kind: 'otp-reset-chain', chainId: 'dealer-en-reset' }],
    ['an OTP request kind', { kind: 'unregistered-otp-request' }],
  ];

  test('a login without a valid authorization types and taps nothing', async () => {
    for (const [name, auth] of noAuthCases) {
      const { driver, events } = fakeDriver();
      await expect(
        new IosLoginScreen(driver).login(PHONE, 'x', auth as never),
        name,
      ).rejects.toBeInstanceOf(AccountActionNotAuthorized);
      expect(events, name).toEqual([]);
    }
  });

  test('a login whose authorization cannot be checked is refused, never allowed', async () => {
    await withDir(async (dir) => {
      const throwing = context(dir, {
        missingLocalEnv: () => {
          throw new Error('.env unreadable');
        },
      });
      const { driver, events } = fakeDriver();
      await expect(
        new IosLoginScreen(driver).login(PHONE, 'x', { kind: 'login', ctx: throwing }),
      ).rejects.toThrow(/could not be checked/);
      expect(events).toEqual([]);
    });
  });

  test('a missing account variable, an open journal entry or an app marker blocks the login', async () => {
    await withDir(async (dir) => {
      const cases: Partial<AccountRunContext>[] = [
        { missingLocalEnv: () => ['IOS_TEST_DEALER_PHONE'] },
        {
          journal: {
            problem: () => 'an unresolved password reset is open',
          } as unknown as RecoveryJournal,
        },
        { marker: { problem: () => 'the app is not in guest state' } as unknown as AppStateMarker },
      ];
      for (const over of cases) {
        const { driver, events } = fakeDriver();
        await expect(
          new IosLoginScreen(driver).login(PHONE, 'x', { kind: 'login', ctx: context(dir, over) }),
        ).rejects.toBeInstanceOf(AccountActionNotAuthorized);
        expect(events).toEqual([]);
      }
    });
  });

  test('the central guard is what every account-submitting screen method calls first', () => {
    for (const [file, call] of [
      [
        'src/mobile/ios/screens/login.screen.ts',
        "authorizeAccountAction(auth, LOGIN_KINDS, 'Login submission'",
      ],
      [
        'src/mobile/ios/screens/otp.screen.ts',
        "authorizeAccountAction(auth, OTP_VALIDATION_KINDS, 'OTP submission'",
      ],
      ['src/mobile/ios/screens/new-password.screen.ts', 'authorizeAccountAction('],
    ] as const) {
      const code = stripComments(read(file));
      const method = /async (login|verifyOtp|setNewPassword)\(/.exec(code);
      expect(method, file).not.toBeNull();
      const body = code.slice(method!.index);
      expect(body, file).toContain(call);
      // The guard comes before the first type or tap in the method.
      expect(body.indexOf('authorizeAccountAction('), file).toBeLessThan(
        Math.min(
          ...['setValue(', '.click()', 'enterPhone(', 'enterOtp('].map((s) =>
            body.includes(s) ? body.indexOf(s) : Infinity,
          ),
        ),
      );
    }
    // Screens use the real, production context unless a selfcheck injects one.
    expect(read('src/mobile/ios/screens/login.screen.ts')).toContain('accountContext');
    expect(read('src/mobile/ios/account/account-context.ts')).toContain('ACCOUNT_TEST_POLICY');
    expect(() =>
      authorizeAccountAction({ kind: 'login' }, ['login'], 'x', () => {
        throw new Error('no context');
      }),
    ).toThrow(AccountActionNotAuthorized);
  });

  test('the submit buttons are handed out read-only: no tap, no typing, from any caller', async () => {
    const { driver, events } = fakeDriver();
    const views = [
      await new IosLoginScreen(driver).loginButton(),
      await new IosForgotPasswordScreen(driver).sendButton(),
      await new IosOtpScreen(driver).verifyButton('Verify'),
      await new IosNewPasswordScreen(driver).saveAndLoginButton('Save'),
    ];
    for (const view of views) {
      expect(await view.isEnabled()).toBe(true);
      expect(Object.isFrozen(view)).toBe(true);
      for (const method of ['click', 'setValue', 'addValue', 'doubleClick', 'touchAction']) {
        expect(method in view, method).toBe(false);
        expect(() => (view as unknown as Record<string, () => void>)[method](), method).toThrow(
          TypeError,
        );
      }
    }
    expect(events).toEqual([]);
  });

  test('no other code reaches the raw submit buttons or the unlabeled-button selector', () => {
    const allowed = new Set([
      'src/mobile/ios/screens/ios.screen.ts',
      'src/mobile/ios/screens/login.screen.ts',
      'src/mobile/ios/screens/forgot-password.screen.ts',
      'src/mobile/ios/screens/otp.screen.ts',
      'src/mobile/ios/screens/new-password.screen.ts',
      // Selects one of the two unlabeled account-type buttons (local UI only: no submit button,
      // no account action, needs no guard). Still a screen object only, never a spec.
      'src/mobile/ios/screens/registration.screen.ts',
    ]);
    for (const dir of ['src', 'tests-ios', 'ui-tests', 'config']) {
      for (const file of fs
        .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts'))) {
        const full = path.join(dir, file);
        if (full === 'ui-tests/selfcheck/ios-authorization.selfcheck.spec.ts') continue;
        const code = stripComments(read(full));
        if (!allowed.has(full)) {
          expect(code, full).not.toMatch(
            /unlabeledButtonSelector|loginButtonElement|sendButtonElement|verifyButtonElement|saveButtonElement/,
          );
        }
        if (
          dir === 'tests-ios' ||
          full.startsWith('ui-tests/ios') ||
          full.startsWith('ui-tests/support/ios')
        ) {
          // The specs never use the raw driver to look elements up, and never tap a submit button.
          // The read-only inspection helper looks up navigation controls (prompt, welcome choice,
          // Close) with the raw driver; it never taps a submit button (checked below).
          if (
            full !== 'tests-ios/guest-screens.inspect.ts' &&
            full !== 'tests-ios/guest-extra.inspect.ts' &&
            full !== 'tests-ios/guest-notifications-favorites.inspect.ts' &&
            full !== 'tests-ios/signed-in.inspect.ts'
          ) {
            expect(code, full).not.toMatch(/driver\.\$\$?\(/);
          }
          expect(code, full).not.toMatch(
            /(?:loginButton|sendButton|verifyButton|saveAndLoginButton)\([^)]*\)\)?\.(?:click|setValue)/,
          );
          expect(code, full).not.toMatch(/XCUIElementTypeButton" AND \(label == nil/);
        }
      }
    }
    // Inside the screens each raw submit button is tapped exactly once, in its guarded method.
    // Log In has a second, separately approved one: submitFavouritesLogin (IOS_ALLOW_FAVOURITES,
    // QA owner 2026-11-14), checked to call iosFavouritesBlocked first (ios-interactions selfcheck).
    const taps = (file: string, name: string) =>
      (
        stripComments(read(file)).match(new RegExp(`${name}\\([^)]*\\)\\)\\.click\\(\\)`, 'g')) ??
        []
      ).length;
    expect(taps('src/mobile/ios/screens/login.screen.ts', 'loginButtonElement')).toBe(2);
    expect(taps('src/mobile/ios/screens/forgot-password.screen.ts', 'sendButtonElement')).toBe(1);
    expect(taps('src/mobile/ios/screens/otp.screen.ts', 'verifyButtonElement')).toBe(1);
    // new-password.screen.ts's Save/Login button is tapped by coordinate (tapAtCenterOf), not
    // .click(): a native click on it was observed (2026-11-11) not to register at all.
    const newPasswordScreen = stripComments(read('src/mobile/ios/screens/new-password.screen.ts'));
    // Its own definition, the read-only inspection method, and the one submitting call site.
    expect((newPasswordScreen.match(/saveButtonElement\(/g) ?? []).length).toBe(3);
    expect(newPasswordScreen).not.toMatch(/saveButtonElement\([^)]*\)\)\.click\(\)/);
    expect(newPasswordScreen).toContain('this.tapAtCenterOf(');
  });
});

test.describe('iOS OTP request permit: single use, binding, expiry (selfcheck)', () => {
  // A clock that moves 70 seconds on every reading, so consecutive requests in one ledger respect
  // the suite's own 60-second spacing (a technical limit) unless a test sets its own clock.
  let tick = 0;
  const nextNow = () => new Date(FIXTURE_NOW.getTime() + tick++ * 70_000);
  const issue = (
    dir: string,
    over: {
      kind?: AccountRunKind;
      phone?: string;
      target?: 'registered' | 'unregistered';
      ctx?: Partial<AccountRunContext>;
      now?: () => Date;
      runId?: string;
      scenario?: string;
    } = {},
  ) =>
    issueOtpRequestPermit({
      kind: over.kind ?? 'unregistered-otp-request',
      scenario: over.scenario ?? unique('scenario'),
      phone: over.phone ?? PHONE,
      target: over.target ?? 'unregistered',
      deps: {
        ctx: context(dir, over.ctx),
        ledgerDir: dir,
        runId: over.runId ?? unique('run'),
        now: over.now ?? nextNow,
      },
    });

  test('issuing needs every authorization, an OTP-capable kind and a matching target', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      expect(issue(dir)).toBeInstanceOf(OtpRequestPermit);
      for (const kind of ['login', 'unregistered-login'] as const) {
        expect(() => issue(dir, { kind }), kind).toThrow(/not allowed to request an OTP/);
      }
      expect(() =>
        issue(dir, { ctx: { env: { ...ALL_ON, MAZAD_ALLOW_OTP_REQUESTS: 'false' } } }),
      ).toThrow(/MAZAD_ALLOW_OTP_REQUESTS/);
      expect(() => issue(dir, { ctx: { env: {} } })).toThrow(OtpAuthorizationError);
      expect(() => issue(dir, { ctx: { policy: ACCOUNT_TEST_POLICY } })).toThrow(/blocked until/);
      expect(() => issue(dir, { target: 'registered' })).toThrow(/unregistered number/);
      expect(() => issue(dir, { phone: 'abc' })).toThrow(/needs a phone number/);
      expect(() => issue(dir, { phone: undefined as never, scenario: 'x' })).not.toThrow();
      // A scenario name that could hold a phone number is refused, so none reaches the ledger.
      expect(() => issue(dir, { scenario: `call-${PHONE}` })).toThrow(/plain scenario name/);
      expect(() => issue(dir, { scenario: '  ' })).toThrow(/plain scenario name/);
      expect(() => issue(dir, { runId: 'a b' })).toThrow(/plain scenario name/);
    });
  });

  test('a permit is consumed once; a reuse is refused and the ledger holds one entry', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const permit = issue(dir);
      expect(permit.used).toBe(false);
      permit.consume(PHONE);
      expect(permit.used).toBe(true);
      expect(() => permit.consume(PHONE)).toThrow(/already used/);
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('concurrent consumption: exactly one of many simultaneous attempts succeeds', async () => {
    await withDir(async (dir) => {
      initializeLedger(dir);
      const permit = issue(dir);
      const outcomes = await Promise.allSettled(
        Array.from({ length: 12 }, () => Promise.resolve().then(() => permit.consume(PHONE))),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      for (const rejected of outcomes.filter(
        (o): o is PromiseRejectedResult => o.status === 'rejected',
      )) {
        expect(rejected.reason).toBeInstanceOf(OtpAuthorizationError);
      }
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('a failed first attempt spends the permit for good (wrong phone, lapsed, unauthorized, malformed)', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      // Wrong phone, then the right one: still spent.
      const wrongPhone = issue(dir);
      expect(() => wrongPhone.consume(OTHER_PHONE)).toThrow(/another number/);
      expect(wrongPhone.used).toBe(true);
      expect(() => wrongPhone.consume(PHONE)).toThrow(/already used/);
      // Malformed phone values.
      for (const bad of [undefined, null, 5, '', '   ', {}, []]) {
        const permit = issue(dir);
        expect(() => permit.consume(bad), JSON.stringify(bad)).toThrow(OtpAuthorizationError);
        expect(permit.used).toBe(true);
        expect(() => permit.consume(PHONE)).toThrow(/already used/);
      }
      // Authorization lost between issue and use, then restored: still spent.
      const env: Record<string, string | undefined> = { ...ALL_ON };
      const lost = issue(dir, { ctx: { env } });
      env.MAZAD_ALLOW_OTP_REQUESTS = undefined;
      expect(() => lost.consume(PHONE)).toThrow(/refused at send time/);
      env.MAZAD_ALLOW_OTP_REQUESTS = 'true';
      expect(() => lost.consume(PHONE)).toThrow(/already used/);
      expect(readLedger(dir)).toHaveLength(0);
    });
  });

  test('invalid, forged and malformed permits are refused', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const forged = Object.create(OtpRequestPermit.prototype) as OtpRequestPermit;
      expect(() => forged.consume(PHONE)).toThrow(/Invalid OTP request permit/);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called with an explicit, foreign `this`
      const consume = OtpRequestPermit.prototype.consume;
      for (const fake of [{}, null, undefined, 'permit', { used: false }]) {
        expect(() => consume.call(fake as never, PHONE)).toThrow(OtpAuthorizationError);
      }
      const Forge = OtpRequestPermit as unknown as new (...args: unknown[]) => OtpRequestPermit;
      expect(
        () => new Forge(Symbol('x'), 'login', 's', 'registered', 'd', FIXTURE_NOW, {}),
      ).toThrow(/can only be issued/);
      expect(() => new Forge(undefined)).toThrow(/can only be issued/);
      expect(readLedger(dir)).toHaveLength(0);
    });
  });

  test('a permit lapses: at the limit it works, one millisecond later it does not', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      let clock = FIXTURE_NOW;
      const fresh = issue(dir, { now: () => clock });
      clock = new Date(FIXTURE_NOW.getTime() + PERMIT_LIFETIME_MS);
      expect(() => fresh.consume(PHONE)).not.toThrow();
      // 70 seconds later (past the suite's own 60-second spacing), a second permit lapses.
      clock = new Date(clock.getTime() + 70_000);
      const lapsed = issue(dir, { now: () => clock });
      clock = new Date(clock.getTime() + PERMIT_LIFETIME_MS + 1);
      expect(() => lapsed.consume(PHONE)).toThrow(/has lapsed/);
      expect(lapsed.used).toBe(true);
      expect(() => lapsed.consume(PHONE)).toThrow(/already used/);
    });
  });

  test('phone binding: the permit is only good for its own number, in any formatting of it', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const permit = issue(dir, { phone: '+966 50 999 9999' });
      expect(() => permit.consume('0509999999')).toThrow(/another number/); // another number
      const same = issue(dir, { phone: '0509999999' });
      expect(() => same.consume('050-999-9999')).not.toThrow(); // same digits, different format
    });
  });

  test('scenario binding: the permit records its own scenario, cannot be changed, one per scenario per run', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const permit = issue(dir, { scenario: 'forgot-unregistered-en', runId: 'run-fixed' });
      expect(() => {
        (permit as unknown as { scenario: string }).scenario = 'another-scenario';
      }).toThrow(TypeError);
      expect(Object.isFrozen(permit)).toBe(true);
      permit.consume(PHONE);
      expect(readLedger(dir)[0]).toMatchObject({
        scenario: 'forgot-unregistered-en',
        runId: 'run-fixed',
        kind: 'unregistered-otp-request',
        target: 'unregistered',
      });
      // The same scenario cannot ask again in this run, even with a new permit.
      expect(() => issue(dir, { scenario: 'forgot-unregistered-en', runId: 'run-fixed' })).toThrow(
        /already/,
      );
      // A different scenario of the same run is a different permit.
      expect(issue(dir, { scenario: 'forgot-unregistered-ar', runId: 'run-fixed' })).toBeInstanceOf(
        OtpRequestPermit,
      );
    });
  });

  test('the Send button is reachable only through requestPasswordReset, which needs a valid permit', async () => {
    await withDir(async (dir) => {
      initializeLedger(dir);
      const bad: unknown[] = [
        undefined,
        null,
        {},
        'permit',
        5,
        Object.create(OtpRequestPermit.prototype),
      ];
      for (const permit of bad) {
        const { driver, events } = fakeDriver();
        await expect(
          new IosForgotPasswordScreen(driver).requestPasswordReset(PHONE, permit as never),
        ).rejects.toThrow();
        expect(events, String(permit)).toEqual([]);
      }
      // A permit for another number, a reused permit, and one that lapsed: nothing typed or tapped.
      const other = issue(dir);
      const reused = issue(dir);
      reused.consume(PHONE);
      let clock = nextNow();
      const lapsing = issue(dir, { now: () => clock });
      clock = new Date(clock.getTime() + PERMIT_LIFETIME_MS + 1);
      for (const [permit, phone] of [
        [other, OTHER_PHONE],
        [reused, PHONE],
        [lapsing, PHONE],
      ] as const) {
        const { driver, events } = fakeDriver();
        await expect(
          new IosForgotPasswordScreen(driver).requestPasswordReset(phone, permit),
        ).rejects.toThrow(OtpAuthorizationError);
        expect(events).toEqual([]);
      }
      // A valid permit types and taps once.
      const valid = issue(dir);
      const { driver, events } = fakeDriver();
      await new IosForgotPasswordScreen(driver).requestPasswordReset(PHONE, valid);
      expect(events.filter((e) => e.startsWith('click'))).toHaveLength(1);
      await expect(
        new IosForgotPasswordScreen(driver).requestPasswordReset(PHONE, valid),
      ).rejects.toThrow(/already used/);
      expect(events.filter((e) => e.startsWith('click'))).toHaveLength(1);
    });
    // Nothing else taps Send: the only path is the guarded method (source level).
    const screen = stripComments(read('src/mobile/ios/screens/forgot-password.screen.ts'));
    const method = screen.slice(screen.indexOf('async requestPasswordReset('));
    expect(method.indexOf('permit.consume(phone)')).toBeGreaterThan(0);
    expect(method.indexOf('permit.consume(phone)')).toBeLessThan(method.indexOf('setValue(phone)'));
    expect(method.indexOf('permit.consume(phone)')).toBeLessThan(method.indexOf('.click()'));
  });

  test('the registration journey: Create Account is reachable only through submitCreateAccount, which needs a valid permit', async () => {
    await withDir(async (dir) => {
      initializeLedger(dir);
      const bad: unknown[] = [
        undefined,
        null,
        {},
        'permit',
        5,
        Object.create(OtpRequestPermit.prototype),
      ];
      for (const permit of bad) {
        await expect(
          new IosRegistrationScreen(fakeDriver().driver).submitCreateAccount(
            'Create Account',
            PHONE,
            permit as never,
          ),
        ).rejects.toThrow();
      }
      const valid = issueOtpRequestPermit({
        kind: 'registration-otp-request',
        scenario: unique('registration'),
        phone: PHONE,
        target: 'unregistered',
        deps: {
          ctx: context(dir, { env: { ...ALL_ON, IOS_ALLOW_REGISTRATION_E2E_JOURNEY: 'true' } }),
          ledgerDir: dir,
          runId: unique('run'),
          now: () => FIXTURE_NOW,
        },
      });
      // A bad permit never reaches the tap: consumed-but-wrong-number is refused before any UI call,
      // which this fake driver (no getPageSource) would otherwise throw on if reached.
      expect(() => valid.consume(OTHER_PHONE)).toThrow(/another number/);
      expect(valid.used).toBe(true);
    });
    // Nothing else taps Create Account: the only path is the guarded method (source level), and
    // the permit is consumed BEFORE the tap (never after, never unconditionally).
    const screen = stripComments(read('src/mobile/ios/screens/registration.screen.ts'));
    const method = screen.slice(screen.indexOf('async submitCreateAccount('));
    expect(method.indexOf('permit.consume(phone)')).toBeGreaterThan(0);
    expect(method.indexOf('permit.consume(phone)')).toBeLessThan(
      method.indexOf('tapButtonContainingText'),
    );
    expect(screen.match(/tapButtonContainingText\(createAccountLabel/g)).toHaveLength(1);
  });
});

test.describe('iOS OTP ledger: durable, fail-closed, no secrets (selfcheck)', () => {
  const seed = (dir: string, scenarios: string[], runId = 'seed-run', start = FIXTURE_NOW) => {
    initializeLedger(dir);
    scenarios.forEach((scenario, i) =>
      appendLedgerEntry(dir, {
        runId,
        kind: 'otp-flow-chain',
        scenario,
        target: 'registered',
        at: new Date(start.getTime() + i * 60_000),
      }),
    );
  };
  const file = (dir: string) => path.join(dir, LEDGER_FILE);
  const permitFor = (dir: string, ctxOver: Partial<AccountRunContext> = {}, offsetMs = 0) =>
    issueOtpRequestPermit({
      kind: 'unregistered-otp-request',
      scenario: unique('ledger'),
      phone: PHONE,
      target: 'unregistered',
      deps: {
        ctx: context(dir, ctxOver),
        ledgerDir: dir,
        runId: unique('run'),
        now: () => new Date(FIXTURE_NOW.getTime() + 24 * 3_600_000 + offsetMs),
      },
    });

  test('a MISSING ledger is never treated as empty: issuing and consuming both refuse', async () => {
    await withDir((dir) => {
      expect(() => readLedger(dir)).toThrow(/missing/);
      expect(() => permitFor(dir)).toThrow(/ledger is missing/);
      // A permit issued while the ledger existed, then the ledger is deleted: consuming refuses.
      initializeLedger(dir);
      const permit = permitFor(dir);
      fs.rmSync(file(dir));
      expect(() => permit.consume(PHONE)).toThrow(/ledger is missing/);
      expect(permit.used).toBe(true);
      expect(fs.existsSync(file(dir))).toBe(false); // not silently recreated
      expect(fs.existsSync(path.join(dir, LOCK_FILE))).toBe(false); // the lock was released
    });
  });

  test('the ledger is created on purpose, once, and never recreated', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      expect(fs.readFileSync(file(dir), 'utf8')).toBe(`${LEDGER_HEADER}\n`);
      expect(fs.statSync(file(dir)).mode & 0o777).toBe(0o600);
      expect(() => initializeLedger(dir)).toThrow(/already exists/);
      expect(readLedger(dir)).toEqual([]);
    });
  });

  test('CORRUPTED ledgers refuse, whatever the damage', async () => {
    const damage: [string, (lines: string[]) => string][] = [
      ['empty file', () => ''],
      ['no header', (l) => `${l.slice(1).join('\n')}\n`],
      ['wrong header', (l) => `${['{"ledger":"x","version":1}', ...l.slice(1)].join('\n')}\n`],
      ['cut-off last line', (l) => l.join('\n')],
      ['garbage line', (l) => `${[...l.slice(0, 2), 'not json', ...l.slice(2)].join('\n')}\n`],
      [
        'an edited middle line',
        (l) => `${[l[0], l[1].replace('s-1', 's-9'), ...l.slice(2)].join('\n')}\n`,
      ],
      ['a deleted middle line', (l) => `${[l[0], l[1], ...l.slice(3)].join('\n')}\n`],
      ['reordered lines', (l) => `${[l[0], l[2], l[1], ...l.slice(3)].join('\n')}\n`],
      ['a duplicated line', (l) => `${[...l, l[l.length - 1]].join('\n')}\n`],
      [
        'an extra field',
        (l) => `${[...l.slice(0, -1), l[l.length - 1].replace('}', ',"phone":"x"}')].join('\n')}\n`,
      ],
      [
        'a missing field',
        (l) =>
          `${[...l.slice(0, -1), l[l.length - 1].replace(/"target":"[a-z]+",/, '')].join('\n')}\n`,
      ],
      [
        'a bad target',
        (l) =>
          `${[...l.slice(0, -1), l[l.length - 1].replace('registered', 'someone')].join('\n')}\n`,
      ],
      [
        'a bad time',
        (l) =>
          `${[...l.slice(0, -1), l[l.length - 1].replace(/"at":"[^"]+"/, '"at":"soon"')].join('\n')}\n`,
      ],
      [
        'a phone number in a scenario',
        (l) =>
          `${[...l.slice(0, -1), l[l.length - 1].replace('s-3', 's-0509999999')].join('\n')}\n`,
      ],
      ['a JSON array line', (l) => `${[...l.slice(0, -1), '[]'].join('\n')}\n`],
    ];
    for (const [name, change] of damage) {
      await withDir((dir) => {
        seed(dir, ['s-1', 's-2', 's-3']);
        const permit = permitFor(dir);
        const lines = fs.readFileSync(file(dir), 'utf8').slice(0, -1).split('\n');
        fs.writeFileSync(file(dir), change(lines));
        expect(() => readLedger(dir), name).toThrow(/corrupted/);
        expect(() => permitFor(dir), name).toThrow(OtpAuthorizationError);
        expect(() => permit.consume(PHONE), name).toThrow(/corrupted/);
        expect(permit.used, name).toBe(true);
        expect(fs.existsSync(path.join(dir, LOCK_FILE)), name).toBe(false);
      });
    }
  });

  test('an unreadable ledger (a folder, or no read permission) refuses', async () => {
    await withDir((dir) => {
      fs.mkdirSync(file(dir));
      expect(() => readLedger(dir)).toThrow(/unreadable/);
    });
    if (process.getuid?.() !== 0) {
      await withDir((dir) => {
        seed(dir, ['s-1']);
        fs.chmodSync(file(dir), 0o000);
        expect(() => readLedger(dir)).toThrow(/unreadable/);
        fs.chmodSync(file(dir), 0o600);
      });
    }
  });

  test('stored data: no phone, password or OTP, only the six fields, file mode 0600', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const permit = permitFor(dir);
      permit.consume(PHONE);
      const text = fs.readFileSync(file(dir), 'utf8');
      expect(text).not.toContain(PHONE);
      expect(text).not.toMatch(/phone|password|otp"?:/i);
      const entry = readLedger(dir)[0];
      expect(Object.keys(entry).sort()).toEqual([
        'at',
        'kind',
        'prev',
        'runId',
        'scenario',
        'seq',
        'target',
      ]);
      expect(fs.statSync(file(dir)).mode & 0o777).toBe(0o600);
      // The ledger itself refuses an entry that could carry a phone number or a secret.
      for (const scenario of [`x-${PHONE}`, '1234567', 'has space', '', 'a'.repeat(121)]) {
        expect(() =>
          appendLedgerEntry(dir, {
            runId: 'r',
            kind: 'k',
            scenario,
            target: 'registered',
            at: new Date(),
          }),
        ).toThrow(/not valid/);
      }
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('technical safety limits and recorded backend limits are separate, and neither stands in for the other', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const policy = structuredClone(completePolicy);
      policy.otp.maxRequests = fact(1);
      policy.otp.windowMinutes = fact(60);
      policy.otp.cooldownSeconds = fact(0);
      // Both permits are issued while the ledger is empty; the second is refused, under the lock,
      // by the RECORDED backend limit (70 seconds later, so the technical spacing is not the cause).
      const first = permitFor(dir, { policy });
      const second = permitFor(dir, { policy }, 70_000);
      first.consume(PHONE);
      expect(() => second.consume(PHONE)).toThrow(/recorded backend limit: .*recorded maximum 1/);
      expect(readLedger(dir)).toHaveLength(1);
    });
    await withDir((dir) => {
      // The suite's own TECHNICAL limit: one run may make only TECHNICAL_LIMITS.maxRequestsPerRun.
      seed(
        dir,
        Array.from({ length: TECHNICAL_LIMITS.maxRequestsPerRun }, (_, i) => `t-${i}`),
        'busy-run',
      );
      expect(() =>
        issueOtpRequestPermit({
          kind: 'unregistered-otp-request',
          scenario: 'one-too-many',
          phone: PHONE,
          target: 'unregistered',
          deps: {
            ctx: context(dir),
            ledgerDir: dir,
            runId: 'busy-run',
            now: () => new Date(FIXTURE_NOW.getTime() + 24 * 3_600_000),
          },
        }),
      ).toThrow(/technical safety limit/);
    });
    // The technical numbers are not in the policy file, and recorded limits are never defaulted.
    expect(stripComments(read('config/ios-account-policy.ts'))).not.toMatch(
      /TECHNICAL_LIMITS|maxRequestsPerRun/,
    );
    expect(stripComments(read('src/mobile/ios/account/otp-permit.ts'))).toContain(
      "return 'the recorded OTP limits (maximum requests, window, cooldown) are missing'",
    );
  });

  test('the ledger lock is released after use, and a malformed lock is never removed', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      appendLedgerEntry(dir, {
        runId: 'r',
        kind: 'k',
        scenario: 's',
        target: 'registered',
        at: new Date(),
      });
      expect(fs.existsSync(path.join(dir, LOCK_FILE))).toBe(false);
      fs.writeFileSync(path.join(dir, LOCK_FILE), '99999:stale');
      expect(() =>
        appendLedgerEntry(dir, {
          runId: 'r',
          kind: 'k',
          scenario: 's2',
          target: 'registered',
          at: new Date(),
          lockWaitMs: 150,
        }),
      ).toThrow(/unreadable or malformed/);
      expect(fs.readFileSync(path.join(dir, LOCK_FILE), 'utf8')).toBe('99999:stale');
      expect(readLedger(dir)).toHaveLength(1);
      // A refusal by the check releases the lock and writes nothing.
      fs.rmSync(path.join(dir, LOCK_FILE));
      expect(() =>
        appendLedgerEntry(dir, {
          runId: 'r',
          kind: 'k',
          scenario: 's3',
          target: 'registered',
          at: new Date(),
          check: () => 'no',
        }),
      ).toThrow('no');
      expect(fs.existsSync(path.join(dir, LOCK_FILE))).toBe(false);
      expect(readLedger(dir)).toHaveLength(1);
    });
  });
});

/** Loads a copy of the ledger SOURCE as an ES module in a separate process. */
function childModule(dir: string): string {
  const copy = path.join(dir, 'otp-ledger.mts');
  fs.copyFileSync(path.join(ROOT, 'src/mobile/ios/account/otp-ledger.ts'), copy);
  return copy;
}

const runChild = async (script: string): Promise<string> => {
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  return stdout.trim();
};

test.describe('iOS OTP ledger across processes: restart and parallel workers (selfcheck)', () => {
  test.setTimeout(120_000);

  const appendScript = (
    mod: string,
    ledger: string,
    scenario: string,
    startAt: number,
    checkSource: string,
  ) => `
    const m = await import(${JSON.stringify(mod)});
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ${startAt} - Date.now()));
    try {
      const at = new Date();
      m.appendLedgerEntry(${JSON.stringify(ledger)}, {
        runId: 'run-parallel', kind: 'otp-flow-chain', scenario: ${JSON.stringify(scenario)},
        target: 'registered', at,
        check: (entries) => { ${checkSource} },
      });
      console.log('OK');
    } catch (error) { console.log('REFUSED: ' + error.message); }
  `;

  test('the record survives a process restart and still blocks a repeat or a burst', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      initializeLedger(dir);
      const technical = `return m.technicalLimitProblem(entries, 'run-restart', SCENARIO, new Date());`;
      const first = await runChild(
        appendScript(
          mod,
          dir,
          'scenario-a',
          0,
          technical.replace('SCENARIO', "'scenario-a'"),
        ).replace('run-parallel', 'run-restart'),
      );
      expect(first).toBe('OK');
      // This process (a "new" one) reads what the first process wrote.
      expect(readLedger(dir).map((e) => e.scenario)).toEqual(['scenario-a']);
      // A third process: the same scenario again is refused, from the file alone.
      const repeat = await runChild(
        appendScript(
          mod,
          dir,
          'scenario-a',
          0,
          technical.replace('SCENARIO', "'scenario-a'"),
        ).replace('run-parallel', 'run-restart'),
      );
      expect(repeat).toMatch(/REFUSED: "scenario-a" already made its OTP request in this run/);
      // A different scenario right away is refused by the technical spacing limit.
      const burst = await runChild(
        appendScript(
          mod,
          dir,
          'scenario-b',
          0,
          technical.replace('SCENARIO', "'scenario-b'"),
        ).replace('run-parallel', 'run-restart'),
      );
      expect(burst).toMatch(
        /REFUSED: technical safety limit: the last OTP-path request was less than 60 seconds ago/,
      );
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('parallel workers cannot bypass a limit: exactly the allowed number of requests get through', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      initializeLedger(dir);
      const startAt = Date.now() + 3_000;
      const WORKERS = 8;
      const ALLOWED = 3;
      const results = await Promise.all(
        Array.from({ length: WORKERS }, (_, i) =>
          runChild(
            appendScript(
              mod,
              dir,
              `worker-${i}`,
              startAt,
              `return entries.length >= ${ALLOWED} ? 'limit of ${ALLOWED} reached' : undefined;`,
            ),
          ),
        ),
      );
      expect(results.filter((r) => r === 'OK')).toHaveLength(ALLOWED);
      expect(results.filter((r) => r.startsWith('REFUSED: limit of 3 reached'))).toHaveLength(
        WORKERS - ALLOWED,
      );
      // The file is intact: a valid chain of exactly the allowed entries, no torn or lost write.
      const entries = readLedger(dir);
      expect(entries).toHaveLength(ALLOWED);
      expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
      expect(fs.existsSync(path.join(dir, LOCK_FILE))).toBe(false);
    });
  });

  test('parallel workers under the technical limits: only one request in a burst gets through', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      initializeLedger(dir);
      const startAt = Date.now() + 3_000;
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          runChild(
            appendScript(
              mod,
              dir,
              `burst-${i}`,
              startAt,
              `return m.technicalLimitProblem(entries, 'run-parallel', 'burst-${i}', new Date());`,
            ),
          ),
        ),
      );
      expect(results.filter((r) => r === 'OK')).toHaveLength(1);
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('a worker that finds the ledger missing or corrupted refuses and writes nothing', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      const script = appendScript(mod, dir, 'worker-x', 0, 'return undefined;');
      expect(await runChild(script)).toMatch(/REFUSED: The OTP request ledger is missing/);
      expect(fs.existsSync(path.join(dir, LEDGER_FILE))).toBe(false);
      initializeLedger(dir);
      fs.appendFileSync(path.join(dir, LEDGER_FILE), 'garbage\n');
      expect(await runChild(script)).toMatch(/REFUSED: The OTP request ledger is corrupted/);
    });
  });
});

test.describe('iOS authorization: the existing policy controls are untouched (selfcheck)', () => {
  test('the ledger init script is local-only and writes the same header as the ledger', () => {
    const script = stripComments(read('scripts/ios-otp-ledger-init.mjs'));
    expect(script).toContain(LEDGER_HEADER);
    expect(script).toContain("'wx'");
    expect(script).toContain('otp-path-requests.head');
    expect(script).not.toMatch(/appium|webdriver|fetch\(|https?:\/\/|\.env|process\.env/i);
  });

  test('policy and switches stay as they were', () => {
    expect(ACCOUNT_TEST_POLICY.acceptedUnrecordedFacts).toBeNull();
    // Recorded (user-provided, by the QA owner): the test account and the Q10 answer. Nothing else.
    expect(ACCOUNT_TEST_POLICY.testAccount?.approval.by).toBe('QA owner');
    expect(ACCOUNT_TEST_POLICY.login.failureThreshold?.value).toBe('none');
    const stillNull: unknown[] = [
      ...(Object.values(ACCOUNT_TEST_POLICY.otp) as unknown[]),
      ACCOUNT_TEST_POLICY.login.countingWindowMinutes,
      ACCOUNT_TEST_POLICY.login.lockDuration,
      ACCOUNT_TEST_POLICY.login.wrongOtpCountsTowardLock,
      ...(Object.values(ACCOUNT_TEST_POLICY.passwordRules) as unknown[]),
      ...(Object.values(ACCOUNT_TEST_POLICY.passwordReset) as unknown[]),
      ACCOUNT_TEST_POLICY.recovery.procedure,
      ACCOUNT_TEST_POLICY.approvedOtpChains,
      ACCOUNT_TEST_POLICY.negativeCredentialTests,
    ];
    for (const value of stillNull) expect(value).toBeNull();
    const example = read('.env.example').split('\n');
    for (const name of SWITCH_NAMES) expect(example).toContain(`${name}=`);
    expect(example.filter((l) => /^IOS_TEST_DEALER_\w+=\S/.test(l))).toEqual([]);
    // No switch is enabled anywhere in committed configuration.
    for (const file of [
      'playwright.ios.config.ts',
      'package.json',
      'config/ios-account-policy.ts',
    ]) {
      expect(read(file), file).not.toMatch(/(?:IOS|MAZAD)_ALLOW_\w+\s*[=:]\s*['"]?true/);
    }
  });
});

test.describe('iOS technical OTP limits follow the owner-reported rules (selfcheck)', () => {
  const NOW = new Date('2026-11-10T12:00:00Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  let n = 0;
  const request = (runId: string, at: Date) => ({
    seq: ++n,
    at: at.toISOString(),
    runId,
    kind: 'otp-flow-chain',
    scenario: `s-${n}`,
    target: 'registered' as const,
    prev: 'x',
  });
  const valid = (runId: string, at: Date) => ({
    ...request(runId, at),
    kind: VALID_OTP_MARKER_KIND,
  });

  test('at most 3 requests in a row without a valid OTP; a valid OTP resets the count; 60 seconds apart', () => {
    expect(TECHNICAL_LIMITS).toEqual({
      maxRequestsPerRun: 6,
      maxRequestsWithoutValidOtp: 3,
      minMillisBetweenRequests: 60_000,
    });
    const three = [30, 20, 10].map((m) => request('r1', ago(m * MIN)));
    expect(technicalLimitProblem(three, 'r2', 'a', NOW)).toMatch(
      /3 OTP-path request\(s\) were made since the last valid OTP entry/,
    );
    // A valid OTP entered after the third request resets the count: allowed again.
    const reset = [...three, valid('r1', ago(5 * MIN))];
    expect(technicalLimitProblem(reset, 'r2', 'a', NOW)).toBeUndefined();
    // Two requests then a valid one then three more: the three more block again.
    const mixed = [
      request('r1', ago(50 * MIN)),
      request('r1', ago(45 * MIN)),
      valid('r1', ago(40 * MIN)),
      request('r1', ago(30 * MIN)),
      request('r1', ago(20 * MIN)),
      request('r1', ago(10 * MIN)),
    ];
    expect(technicalLimitProblem(mixed, 'r2', 'a', NOW)).toMatch(/since the last valid OTP entry/);
    // Requests older than 24 hours no longer count.
    const old = [30, 28, 26].map((h) => request('r0', ago(h * HOUR)));
    expect(technicalLimitProblem(old, 'r2', 'a', NOW)).toBeUndefined();
    // Spacing: 59 seconds is too soon, 60 is fine. A valid marker is not a request for the spacing.
    expect(technicalLimitProblem([request('r', ago(59_000))], 'r2', 'a', NOW)).toMatch(
      /less than 60 seconds ago/,
    );
    expect(technicalLimitProblem([request('r', ago(60_000))], 'r2', 'a', NOW)).toBeUndefined();
    expect(
      technicalLimitProblem([request('r', ago(10 * MIN)), valid('r', ago(1_000))], 'r2', 'a', NOW),
    ).toBeUndefined();
    // The same scenario never asks twice in a run.
    const again = request('same', ago(10 * MIN));
    expect(technicalLimitProblem([again], 'same', again.scenario, NOW)).toMatch(
      /already made its OTP request/,
    );
    // Suite limits, not policy facts.
    expect(stripComments(read('config/ios-account-policy.ts'))).not.toMatch(
      /maxRequestsWithoutValidOtp/,
    );
  });

  test('the registration journey is exempt from the "without a valid OTP" count and its 24h window only; every other kind, and every other limit, still applies to it (selfcheck)', () => {
    const three = [30, 20, 10].map((m) => request('r1', ago(m * MIN)));
    // Unscoped (no kind passed) and every OTHER kind: still blocked, exactly as before.
    expect(technicalLimitProblem(three, 'r2', 'a', NOW)).toMatch(/since the last valid OTP entry/);
    for (const kind of [
      'unregistered-otp-request',
      'otp-flow-chain',
      'otp-reset-chain',
      'negative-chain',
    ]) {
      expect(technicalLimitProblem(three, 'r2', 'a', NOW, kind), kind).toMatch(
        /since the last valid OTP entry/,
      );
    }
    // The registration journey's own two kinds: the count/24h rule does not apply...
    for (const kind of ['registration-otp-request', 'registration-password-reset']) {
      expect(technicalLimitProblem(three, 'r2', 'a', NOW, kind), kind).toBeUndefined();
    }
    // ...but every other technical limit still does: the per-run cap...
    const six = Array.from({ length: TECHNICAL_LIMITS.maxRequestsPerRun }, (_, i) =>
      request('busy', ago((10 + i) * MIN)),
    );
    expect(technicalLimitProblem(six, 'busy', 'one-more', NOW, 'registration-otp-request')).toMatch(
      /already made \d+ OTP-path requests/,
    );
    // ...the 60-second spacing...
    expect(
      technicalLimitProblem(
        [request('r', ago(59_000))],
        'r2',
        'a',
        NOW,
        'registration-otp-request',
      ),
    ).toMatch(/less than 60 seconds ago/);
    // ...and one request per scenario per run.
    const again = request('same', ago(10 * MIN));
    expect(
      technicalLimitProblem([again], 'same', again.scenario, NOW, 'registration-otp-request'),
    ).toMatch(/already made its OTP request/);
    // This is this suite's own exemption only: the backend-recorded limit check (otp-permit.ts) is
    // untouched, still refuses when the recorded maximum is reached, and the exemption changes
    // nothing about config/ios-account-policy.ts.
    expect(stripComments(read('config/ios-account-policy.ts'))).not.toMatch(
      /registration-otp-request|registration-password-reset/,
    );
    expect(stripComments(read('src/mobile/ios/account/otp-permit.ts'))).toContain(
      "return 'the recorded OTP limits (maximum requests, window, cooldown) are missing'",
    );
  });

  test('a valid OTP entry is recorded in the ledger as a marker that is not a request', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      const at = new Date('2026-11-10T12:00:00Z');
      for (let i = 1; i <= 3; i++) {
        appendLedgerEntry(dir, {
          runId: 'run-a',
          kind: 'otp-flow-chain',
          scenario: `chain-${i}`,
          target: 'registered',
          at: new Date(at.getTime() + i * 2 * MIN),
        });
      }
      const later = new Date(at.getTime() + 20 * MIN);
      expect(technicalLimitProblem(readLedger(dir), 'run-a', 'chain-4', later)).toMatch(
        /valid OTP entry/,
      );
      recordValidOtpEntered({
        scenario: 'chain-3',
        target: 'registered',
        deps: { ledgerDir: dir, runId: 'run-a', now: () => new Date(at.getTime() + 10 * MIN) },
      });
      const entries = readLedger(dir);
      expect(entries.at(-1)?.kind).toBe(VALID_OTP_MARKER_KIND);
      expect(technicalLimitProblem(entries, 'run-a', 'chain-4', later)).toBeUndefined();
      expect(fs.readFileSync(path.join(dir, LEDGER_FILE), 'utf8')).not.toMatch(
        /phone|password|1111/i,
      );
      // A marker needs a plain name; a phone number is refused.
      expect(() =>
        recordValidOtpEntered({
          scenario: 'x-0509999999',
          target: 'registered',
          deps: { ledgerDir: dir, runId: 'run-a' },
        }),
      ).toThrow(/plain scenario name/);
    });
  });

  test('the chain records the marker only after the app accepted the valid OTP; the unregistered-number OTP test is excluded', () => {
    const forgot = stripComments(read('tests-ios/forgot-password.spec.ts'));
    const correct = forgot.slice(forgot.search(/declareStep\(\s*STEP\.correctOtp/));
    const marker = correct.indexOf('markValidOtpEntered(id)');
    expect(marker).toBeGreaterThan(0);
    expect(marker).toBeGreaterThan(correct.indexOf('newPasswordHeading).isDisplayed()'));
    expect(marker).toBeLessThan(correct.search(/declareStep\(\s*STEP\.emptyPassword/));
    expect(forgot).toContain('UNREGISTERED_OTP_EXCLUDED_REASON');
    expect(forgot).not.toMatch(/issueOtpPermit\(\s*'unregistered-otp-request'/);
  });
});
