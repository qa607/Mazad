import { passwordBelowMinimum } from '../../tests-ios/ios-test-helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BackendAccount } from '../../config/credentials.config';
import {
  type AccountRunContext,
  type AccountRunKind,
  accountRunProblem,
  chainRunKind,
} from '../../src/mobile/ios/account/account-preflight';
import {
  cleanupAfterAccountTest,
  type GuestStateDeps,
  guestStateAtStart,
} from '../../src/mobile/ios/account/guest-state';
import {
  appendOtpLedger,
  chainDefinition,
  OTP_CHAINS,
  OtpChain,
  type OtpChainId,
  STEP,
} from '../../src/mobile/ios/account/otp-chain';
import {
  AppStateMarker,
  maskPhone,
  RecoveryJournal,
} from '../../src/mobile/ios/account/recovery-journal';
import { completePolicy, FIXTURE_NOW } from '../support/ios/account-policy-fixture';
import { expect, test } from '../support/fixtures';

/** Offline: temporary folders and fake apps. No device, no Appium, no OTP, no login. */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PHONE = '0551234567';

const allSwitches = {
  IOS_ALLOW_ACCOUNT_ACTIONS: 'true',
  MAZAD_ALLOW_OTP_REQUESTS: 'true',
  IOS_ALLOW_PASSWORD_RESET: 'true',
  MAZAD_ALLOW_PASSWORD_RESET: 'true',
  MAZAD_ALLOW_LOGOUT: 'true',
};

const dirs: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-account-'));
  dirs.push(dir);
  return dir;
};
test.afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function context(over: Partial<AccountRunContext> & { dir?: string } = {}): AccountRunContext {
  const dir = over.dir ?? tempDir();
  return {
    env: allSwitches,
    policy: completePolicy,
    now: FIXTURE_NOW,
    missingLocalEnv: () => [],
    journal: new RecoveryJournal(dir),
    marker: new AppStateMarker(dir),
    ...over,
  };
}

test.describe('iOS account preflight (selfcheck)', () => {
  test('credentials: only names of missing .env variables are reported, never values', () => {
    const missing = accountRunProblem(
      'login',
      context({ missingLocalEnv: (names) => names.filter((n) => n.endsWith('PASSWORD')) }),
    );
    expect(missing).toBe(
      'Blocked: add IOS_TEST_DEALER_PASSWORD to the local .env file (credentials are read from .env only).',
    );
    // Chains also need the fixed staging OTP; the unregistered-number run needs no account.
    expect(
      accountRunProblem(
        'otp-flow-chain',
        context({ chainId: 'dealer-ar-flow', missingLocalEnv: (n) => [...n] }),
      ),
    ).toContain('OTP_CODE');
    expect(
      accountRunProblem('unregistered-login', context({ missingLocalEnv: (n) => [...n] })),
    ).toBeUndefined();
    const account = new BackendAccount(PHONE, 'a-secret-password');
    for (const printed of [String(account), JSON.stringify(account), JSON.stringify({ account })]) {
      expect(printed).not.toContain('a-secret-password');
      expect(printed).not.toContain(PHONE);
    }
  });

  test('each kind needs exactly its own switches, and nothing is enabled by the preflight', () => {
    const needs: [AccountRunKind, OtpChainId | undefined, string[]][] = [
      ['unregistered-login', undefined, ['IOS_ALLOW_ACCOUNT_ACTIONS']],
      ['login', undefined, ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_LOGOUT']],
      [
        'otp-flow-chain',
        'dealer-ar-flow',
        ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
      ],
      [
        'otp-reset-chain',
        'dealer-en-reset',
        [
          'IOS_ALLOW_ACCOUNT_ACTIONS',
          'MAZAD_ALLOW_OTP_REQUESTS',
          'IOS_ALLOW_PASSWORD_RESET',
          'MAZAD_ALLOW_PASSWORD_RESET',
          'MAZAD_ALLOW_LOGOUT',
        ],
      ],
      [
        'negative-chain',
        'dealer-en-incorrect-otp',
        ['IOS_ALLOW_ACCOUNT_ACTIONS', 'MAZAD_ALLOW_OTP_REQUESTS'],
      ],
    ];
    for (const [kind, chainId, switches] of needs) {
      expect(accountRunProblem(kind, context({ chainId })), kind).toBeUndefined();
      for (const off of switches) {
        const env = { ...allSwitches, [off]: undefined };
        expect(
          accountRunProblem(kind, context({ chainId, env })),
          `${kind} without ${off}`,
        ).toContain(off);
      }
      // With no switch at all, the run is blocked: nothing turns a switch on.
      expect(accountRunProblem(kind, context({ chainId, env: {} })), kind).toMatch(
        /not approved for this run/,
      );
    }
    // A flow chain needs neither the reset nor the logout switch; a login needs logout.
    expect(
      accountRunProblem(
        'otp-flow-chain',
        context({
          chainId: 'dealer-ar-flow',
          env: { IOS_ALLOW_ACCOUNT_ACTIONS: 'true', MAZAD_ALLOW_OTP_REQUESTS: 'true' },
        }),
      ),
    ).toBeUndefined();
  });

  test('a chain must be approved, and negative chains need their own approval', () => {
    expect(
      accountRunProblem(
        'otp-flow-chain',
        context({
          chainId: 'dealer-ar-flow',
          policy: { ...completePolicy, approvedOtpChains: null },
        }),
      ),
    ).toMatch(/OTP chain "dealer-ar-flow" is not approved/);
    expect(
      accountRunProblem(
        'negative-chain',
        context({
          chainId: 'dealer-en-incorrect-otp',
          policy: { ...completePolicy, negativeCredentialTests: null },
        }),
      ),
    ).toMatch(/not approved \(negativeCredentialTests\)/);
    expect(chainRunKind('dealer-en-reset')).toBe('otp-reset-chain');
    expect(chainRunKind('dealer-ar-flow')).toBe('otp-flow-chain');
    expect(chainRunKind('dealer-ar-incorrect-otp')).toBe('negative-chain');
  });

  test('an open recovery journal, an unreadable one, or an app marker blocks the next account run', () => {
    const dir = tempDir();
    const journal = new RecoveryJournal(dir);
    journal.begin('run-open-001', maskPhone(PHONE));
    for (const kind of ['unregistered-login', 'login', 'otp-flow-chain'] as const) {
      const blocked = accountRunProblem(kind, context({ dir, chainId: 'dealer-ar-flow' }));
      expect(blocked, kind).toMatch(/recovery journal entry is open \(run run-open-001, pending/);
    }
    journal.closeByOwner('run-open-001', 'QA owner', 'checked the account');
    expect(accountRunProblem('unregistered-login', context({ dir }))).toBeUndefined();

    fs.writeFileSync(path.join(dir, 'journal-broken.json'), '{ not json');
    expect(accountRunProblem('unregistered-login', context({ dir }))).toMatch(
      /unreadable file\(s\) \(journal-broken\.json\)/,
    );
    fs.rmSync(path.join(dir, 'journal-broken.json'));

    new AppStateMarker(dir).write('test');
    expect(accountRunProblem('unregistered-login', context({ dir }))).toMatch(/not in guest state/);
  });
});

test.describe('iOS recovery journal (selfcheck)', () => {
  test('begin, applied, restored: no secret is ever stored; files are owner-only', () => {
    const dir = path.join(tempDir(), 'state');
    const journal = new RecoveryJournal(dir, () => new Date('2026-11-09T10:00:00Z'));
    const entry = journal.begin('run-restore-1', maskPhone(PHONE));
    expect(entry).toMatchObject({
      state: 'pending',
      maskedPhone: '0*******67',
      operation: 'password-reset-to-baseline',
    });
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    const file = path.join(dir, 'journal-run-restore-1.json');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toContain(PHONE);
    for (const key of Object.keys(JSON.parse(text) as object))
      expect(key).not.toMatch(/pass|otp|secret|token|code/i);

    expect(journal.problem()).toMatch(/entry is open/);
    journal.mark('run-restore-1', 'applied');
    expect(journal.problem()).toMatch(/applied/);
    journal.mark('run-restore-1', 'restored', 'guest state confirmed');
    expect(journal.problem()).toBeUndefined();
    expect(journal.openEntries()).toEqual([]);
  });

  test('only valid transitions; a second reset cannot begin while one is open; only the owner closes', () => {
    const journal = new RecoveryJournal(tempDir());
    journal.begin('run-trans-001', maskPhone(PHONE));
    expect(() => journal.begin('run-trans-002', maskPhone(PHONE))).toThrow(/entry is open/);
    expect(() => journal.mark('run-trans-001', 'restored')).not.toThrow();
    expect(() => journal.mark('run-trans-001', 'applied')).toThrow(/cannot change/);
    expect(() => journal.mark('no-such-run-1', 'applied')).toThrow(/No journal entry/);
    journal.begin('run-trans-003', maskPhone(PHONE));
    expect(() => journal.closeByOwner('run-trans-003', '  ')).toThrow(/QA owner/);
    expect(journal.closeByOwner('run-trans-003', 'QA owner')).toMatchObject({
      state: 'closed',
      closedBy: 'QA owner',
    });
    expect(() => new RecoveryJournal(tempDir()).begin('bad id', 'x')).toThrow(/run id/);
  });

  test('phone masking keeps only the first character and the last two digits', () => {
    expect(maskPhone(PHONE)).toBe('0*******67');
    expect(maskPhone('0 55 123 4567')).toBe('0*******67');
    expect(maskPhone('123')).toBe('[too short to mask]');
  });

  test('nothing closes a journal entry automatically: closeByOwner has no caller in the code', () => {
    const callers = ['src', 'tests-ios', 'config'].flatMap((dir) =>
      fs
        .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(dir, f))
        .filter(
          (f) =>
            stripComments(read(f)).includes('closeByOwner(') && !f.endsWith('recovery-journal.ts'),
        ),
    );
    expect(callers).toEqual([]);
  });
});

/** A fake app: signed in or guest, with a logout that can succeed or fail. */
function fakeApp(opts: {
  signedIn: boolean;
  authorized: boolean;
  logout?: 'works' | 'throws' | 'does-nothing';
  checkThrows?: boolean;
}) {
  const state = { signedIn: opts.signedIn, logouts: 0 };
  const deps: GuestStateDeps = {
    logoutAuthorized: opts.authorized,
    isGuest: () =>
      opts.checkThrows
        ? Promise.reject(new Error('More did not load'))
        : Promise.resolve(!state.signedIn),
    logout: () => {
      state.logouts++;
      if (opts.logout === 'throws') return Promise.reject(new Error('logout id not recorded'));
      if (opts.logout !== 'does-nothing') state.signedIn = false;
      return Promise.resolve();
    },
  };
  return { state, deps };
}

test.describe('iOS guest-state cleanup (selfcheck)', () => {
  test('successful cleanup: already guest does nothing; signed in and authorized signs out once', async () => {
    const marker = new AppStateMarker(tempDir());
    const guest = fakeApp({ signedIn: false, authorized: true });
    expect(await cleanupAfterAccountTest(guest.deps, marker)).toEqual({
      ok: true,
      action: 'already-guest',
    });
    expect(guest.state.logouts).toBe(0);

    const signedIn = fakeApp({ signedIn: true, authorized: true });
    expect(await cleanupAfterAccountTest(signedIn.deps, marker)).toEqual({
      ok: true,
      action: 'logged-out',
    });
    expect(signedIn.state.logouts).toBe(1);
    expect(marker.exists()).toBe(false);
  });

  test('failed cleanup writes the marker (logout fails, does nothing, check fails) and blocks the next run', async () => {
    const cases: [string, ReturnType<typeof fakeApp>, string][] = [
      [
        'logout throws',
        fakeApp({ signedIn: true, authorized: true, logout: 'throws' }),
        'logout-failed',
      ],
      [
        'logout does nothing',
        fakeApp({ signedIn: true, authorized: true, logout: 'does-nothing' }),
        'still-not-guest-after-logout',
      ],
      [
        'check throws',
        fakeApp({ signedIn: true, authorized: true, checkThrows: true }),
        'guest-check-failed',
      ],
    ];
    for (const [name, app, reason] of cases) {
      const dir = tempDir();
      const marker = new AppStateMarker(dir);
      const result = await cleanupAfterAccountTest(app.deps, marker);
      expect(result, name).toMatchObject({ ok: false, reason });
      expect(marker.exists(), name).toBe(true);
      expect(accountRunProblem('unregistered-login', context({ dir })), name).toMatch(
        /not in guest state/,
      );
      // Exactly one logout attempt at most: never retried.
      expect(app.state.logouts, name).toBeLessThanOrEqual(1);
    }
  });

  test('no automatic logout unless explicitly authorized', async () => {
    const marker = new AppStateMarker(tempDir());
    const app = fakeApp({ signedIn: true, authorized: false });
    const result = await cleanupAfterAccountTest(app.deps, marker);
    expect(result).toMatchObject({ ok: false, reason: 'not-guest-logout-not-authorized' });
    expect(app.state.logouts).toBe(0);
    expect(app.state.signedIn).toBe(true);
    expect(marker.exists()).toBe(true);
    // Same at the start of a run: it stops, it does not sign out.
    const start = await guestStateAtStart(app.deps, marker);
    expect(start.ok).toBe(false);
    expect(app.state.logouts).toBe(0);
    // The only iOS logout call sites: the guarded cleanup, its glue, and the (switch-gated) login
    // test. (The Web and Android code has its own, separately gated logout.)
    const callers = ['tests-ios', 'src/mobile/ios'].flatMap((dir) =>
      fs
        .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(dir, f))
        .filter((f) => /\.logout\(/.test(stripComments(read(f)))),
    );
    expect(callers.sort()).toEqual([
      'src/mobile/ios/account/guest-state.ts',
      'tests-ios/ios-account-helpers.ts',
      'tests-ios/login.spec.ts',
    ]);
  });

  test('the start check clears the marker only after the guest state is confirmed', async () => {
    const dir = tempDir();
    const marker = new AppStateMarker(dir);
    marker.write('left over');
    expect(
      (
        await guestStateAtStart(
          fakeApp({ signedIn: true, authorized: true, logout: 'does-nothing' }).deps,
          marker,
        )
      ).ok,
    ).toBe(false);
    expect(marker.exists()).toBe(true);
    expect(
      (await guestStateAtStart(fakeApp({ signedIn: true, authorized: true }).deps, marker)).ok,
    ).toBe(true);
    expect(marker.exists()).toBe(false);
  });

  test('cleanup can do nothing but check and sign out: no OTP, login or password reset', () => {
    const code = stripComments(read('src/mobile/ios/account/guest-state.ts'));
    expect(code).not.toMatch(/otp|password|requestPasswordReset|setNewPassword|login\(|verify/i);
    expect(Object.keys(fakeApp({ signedIn: false, authorized: false }).deps).sort()).toEqual([
      'isGuest',
      'logout',
      'logoutAuthorized',
    ]);
  });
});

test.describe('iOS interrupted execution (selfcheck)', () => {
  test('an interrupted reset leaves an open journal that blocks the next run until the owner closes it', () => {
    const dir = tempDir();
    // Run 1: the reset step recorded its journal, then the process died (no cleanup, no marker).
    new RecoveryJournal(dir).begin('run-crashed-1', maskPhone(PHONE));
    // Run 2 (a new process): its preflight sees the open entry and starts nothing.
    const blocked = accountRunProblem(
      'otp-reset-chain',
      context({ dir, chainId: 'dealer-en-reset' }),
    );
    expect(blocked).toMatch(/run run-crashed-1, pending/);
    expect(blocked).toContain('0*******67');
    expect(blocked).not.toContain(PHONE);
    // Marking it applied or restored by the run's own code is not possible from the new run.
    new RecoveryJournal(dir).closeByOwner(
      'run-crashed-1',
      'QA owner',
      'password verified as baseline',
    );
    expect(
      accountRunProblem('otp-reset-chain', context({ dir, chainId: 'dealer-en-reset' })),
    ).toBeUndefined();
  });

  test('an app left signed in by an interrupted run: the next start signs out only if authorized', async () => {
    const marker = new AppStateMarker(tempDir());
    const notAuthorized = fakeApp({ signedIn: true, authorized: false });
    expect((await guestStateAtStart(notAuthorized.deps, marker)).ok).toBe(false);
    expect(notAuthorized.state).toMatchObject({ signedIn: true, logouts: 0 });
    const authorized = fakeApp({ signedIn: true, authorized: true });
    expect(await guestStateAtStart(authorized.deps, marker)).toEqual({
      ok: true,
      action: 'logged-out',
    });
  });
});

test.describe('iOS OTP chains (selfcheck)', () => {
  const noop = () => Promise.resolve();

  test('exactly four chains, one OTP request each, English and Arabic separate, dealer only', () => {
    expect(OTP_CHAINS.map((c) => c.id)).toEqual([
      'dealer-en-reset',
      'dealer-ar-flow',
      'dealer-en-incorrect-otp',
      'dealer-ar-incorrect-otp',
    ]);
    for (const chain of OTP_CHAINS) {
      expect(chain.otpRequests, chain.id).toBe(1);
      expect(chain.id, chain.id).toContain(`-${chain.language}-`);
      expect(chain.id, chain.id).toMatch(/^dealer-/);
    }
    const bySteps = (language: 'en' | 'ar') =>
      OTP_CHAINS.filter((c) => c.language === language).flatMap((c) => c.steps);
    // English covers every test once; Arabic every test except the final password save.
    expect(bySteps('en').sort()).toEqual(Object.values(STEP).sort());
    expect(bySteps('ar').sort()).toEqual(
      Object.values(STEP)
        .filter((t) => t !== STEP.completeReset)
        .sort(),
    );
    expect(chainDefinition('dealer-en-reset').steps.at(-1)).toBe(STEP.completeReset);
    expect(chainDefinition('dealer-en-incorrect-otp').steps).toEqual([STEP.incorrectOtp]);
  });

  test('each OTP request covers exactly the tests listed in the plan document', () => {
    const doc = read('docs/ios-login-forgot-password-flow-plan.md');
    for (const chain of OTP_CHAINS) {
      expect(doc, chain.id).toContain(`\`${chain.id}\``);
      for (const step of chain.steps) expect(doc, `${chain.id}: ${step}`).toContain(step);
    }
  });

  test('one OTP request per chain: a second request, or one from a later step, is refused', async () => {
    const chain = new OtpChain(chainDefinition('dealer-ar-flow'));
    let sent = 0;
    chain.startStep(STEP.otpStep);
    await chain.requestOtp(() => (sent++, noop()));
    await expect(chain.requestOtp(() => (sent++, noop()))).rejects.toThrow(/already requested/);
    expect(sent).toBe(1);
    expect(chain.otpRequestCount).toBe(1);

    const late = new OtpChain(chainDefinition('dealer-ar-flow'));
    late.startStep(STEP.otpStep);
    late.completeStep(STEP.otpStep);
    await expect(late.requestOtp(noop)).rejects.toThrow(/first step only/);

    // A failure while sending still counts as the request: no second attempt.
    const failing = new OtpChain(chainDefinition('dealer-en-reset'));
    failing.startStep(STEP.otpStep);
    await expect(
      failing.requestOtp(() => Promise.reject(new Error('Send did not respond'))),
    ).rejects.toThrow();
    await expect(failing.requestOtp(noop)).rejects.toThrow(/already requested/);
  });

  test('an OTP is entered once and never reused', async () => {
    const chain = new OtpChain(chainDefinition('dealer-en-reset'));
    await expect(chain.enterOtp(noop)).rejects.toThrow(/no OTP was requested/);
    chain.startStep(STEP.otpStep);
    await chain.requestOtp(noop);
    await chain.enterOtp(noop);
    await expect(chain.enterOtp(noop)).rejects.toThrow(/never reused/);
    const failing = new OtpChain(chainDefinition('dealer-ar-incorrect-otp'));
    failing.startStep(STEP.incorrectOtp);
    await failing.requestOtp(noop);
    await expect(
      failing.enterOtp(() => Promise.reject(new Error('typing failed'))),
    ).rejects.toThrow();
    await expect(failing.enterOtp(noop)).rejects.toThrow(/never reused/);
  });

  test('steps run in order; after a failure the chain stops and nothing is retried', async () => {
    const chain = new OtpChain(chainDefinition('dealer-ar-flow'));
    expect(() => chain.startStep(STEP.emptyOtp)).toThrow(
      /expected step "A registered phone opens the OTP step" next/,
    );
    await chain.step(STEP.otpStep, noop);
    // The step after the OTP step is the read-only layout check: a failing step stops the chain there.
    const boom = new Error('The layout is not supported');
    await expect(chain.step(STEP.otpLayout, () => Promise.reject(boom))).rejects.toBe(boom);
    expect(chain.failure).toContain(STEP.otpLayout);
    expect(chain.ended).toBe(true);
    // The same step again (a retry) and the next step are both refused.
    await expect(chain.step(STEP.otpLayout, noop)).rejects.toThrow(/stopped after a failure/);
    await expect(chain.step(STEP.emptyOtp, noop)).rejects.toThrow(/stopped after a failure/);
  });

  test('a complete chain ends; nothing more may run in it', async () => {
    const chain = new OtpChain(chainDefinition('dealer-en-incorrect-otp'));
    expect(chain.ended).toBe(false);
    await chain.step(STEP.incorrectOtp, noop);
    expect(chain.ended).toBe(true);
    expect(chain.failure).toBeUndefined();
    await expect(chain.step(STEP.incorrectOtp, noop)).rejects.toThrow(/is complete/);
  });

  test('the audit ledger holds timestamps and chain ids only: no phone, no OTP', () => {
    const dir = path.join(tempDir(), 'ledger');
    appendOtpLedger(
      dir,
      chainDefinition('dealer-ar-flow'),
      'run-ledger-1',
      new Date('2026-11-09T10:00:00Z'),
    );
    const file = path.join(dir, 'otp-requests.jsonl');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const line = JSON.parse(fs.readFileSync(file, 'utf8').trim()) as Record<string, string>;
    expect(Object.keys(line).sort()).toEqual(['at', 'chain', 'runId']);
  });
});

test.describe('iOS account specs: structure and exclusions (selfcheck)', () => {
  const forgot = () => read('tests-ios/forgot-password.spec.ts');

  test('serial only, no retries, the chains are declared per language', () => {
    const config = read('playwright.ios.config.ts');
    expect(config).toMatch(/retries:\s*0/);
    expect(config).toMatch(/workers:\s*1/);
    expect(config).toMatch(/fullyParallel:\s*false/);
    expect(forgot()).toContain("test.describe.configure({ mode: 'serial', retries: 0 })");
    for (const id of OTP_CHAINS.map((c) => c.id)) expect(forgot(), id).toContain(`'${id}'`);
    // 1 definition + 2 call sites (the flow chain and the incorrect-OTP chain), each per language.
    expect(forgot().match(/declareOtpChain\(/g)).toHaveLength(3);
  });

  test('every OTP is requested and entered only through its chain or a permit', () => {
    const source = stripComments(forgot());
    const requests = source.match(/requestPasswordReset\(/g) ?? [];
    const chained =
      source.match(
        /chain\.requestOtp\(\(\) =>\s*forgotPasswordScreen\.requestPasswordReset\(iosDealerAccount\.phone, permit\)/g,
      ) ?? [];
    // The flow chain's first step and the incorrect-OTP chain; the unregistered-number OTP test is excluded.
    expect(requests).toHaveLength(2);
    expect(chained).toHaveLength(2);
    // Every one of them is preceded by a permit issued for that request.
    expect(source.match(/issueOtpPermit\(/g) ?? []).toHaveLength(2);
    const entries = source.match(/verifyOtp\(/g) ?? [];
    expect(entries).toHaveLength(2);
    expect(source.match(/chain\.enterOtp\(\(\) =>\s*otpScreen\.verifyOtp\(/g) ?? []).toHaveLength(
      2,
    );
    // Nothing outside the specs sends an OTP or resets a password.
    for (const file of [
      'tests-ios/ios-account-helpers.ts',
      'tests-ios/ios-test-helpers.ts',
      'src/fixtures/ios.fixture.ts',
      'tests-ios/guest-screens.inspect.ts',
    ]) {
      expect(stripComments(read(file)), file).not.toMatch(
        /requestPasswordReset|setNewPassword|verifyOtp/,
      );
    }
  });

  test('the below-minimum password comes from the confirmed X1 minimum, never from the website', () => {
    expect(passwordBelowMinimum(2)).toHaveLength(1);
    expect(passwordBelowMinimum(9)).toHaveLength(8);
    expect(passwordBelowMinimum(80)).toHaveLength(79);
    for (const bad of [1, 0, -3, 2.5, Number.NaN]) {
      expect(() => passwordBelowMinimum(bad), String(bad)).toThrow(/no non-empty password/);
    }
    const sample = passwordBelowMinimum(12);
    expect(
      /[a-z]/.test(sample) &&
        /[A-Z]/.test(sample) &&
        /\d/.test(sample) &&
        /[^A-Za-z0-9]/.test(sample),
    ).toBe(true);
    // No website-derived constant or message is used by the iOS tests.
    const source = stripComments(forgot());
    expect(source).not.toMatch(/tooShortPassword|BOUNDARY_TOO_SHORT_PASSWORD|passwordTooShort/);
    expect(stripComments(read('tests-ios/ios-test-helpers.ts'))).not.toMatch(
      /BOUNDARY_TOO_SHORT_PASSWORD|= 'Ab1!c'/,
    );
    // The below-minimum step reads the recorded minimum.
    expect(source).toContain('passwordRules.minLength');
  });

  test('the password is saved only by the reset step: the .env baseline, journaled first, expected state from X2(a)', () => {
    const source = stripComments(forgot());
    const saves = source.match(/setNewPassword\(/g) ?? [];
    // The below-minimum attempt, the rejected-password attempts and the final save.
    expect(saves).toHaveLength(3);
    // Exactly ONE call saves; every other call is an invalid attempt that must leave the step on screen.
    expect(source.match(/'save'/g) ?? []).toHaveLength(1);
    expect(source.match(/'invalid-attempt'/g) ?? []).toHaveLength(2);
    const finalSave = source.search(/setNewPassword\(\s*iosDealerAccount\.password/);
    expect(finalSave).toBeGreaterThan(0);
    expect(source.lastIndexOf('accountJournal.begin(', finalSave)).toBeGreaterThan(
      source.lastIndexOf('chain.step(STEP.completeReset', finalSave),
    );
    expect(source).not.toMatch(/generateTestPassword/);
    expect(source).toContain('if (chainDefinition(id).resetsPassword) {');
    // The post-reset state is taken from the recorded fact, and no Android prompt is dismissed.
    expect(source).toContain('passwordReset.signsInAutomatically');
    expect(source).not.toMatch(/dismissPromptIfPresent|fingerprintPromptDismiss/);
    // The title says what the step does.
    expect(STEP.completeReset).toBe(
      'Saving the baseline password completes the reset and shows the confirmed post-reset state',
    );
    expect(STEP.completeReset).not.toMatch(/login with it/i);
  });

  test('the Individual account is excluded everywhere', () => {
    for (const file of ['tests-ios/login.spec.ts', 'tests-ios/forgot-password.spec.ts']) {
      const source = read(file);
      expect(source, file).toContain('INDIVIDUAL_EXCLUDED_REASON');
      expect(stripComments(source), file).not.toMatch(
        /iosIndividualAccount|findTestAccount|individualAccount/,
      );
    }
    const fixture = stripComments(read('src/fixtures/ios.fixture.ts'));
    expect(fixture).not.toMatch(/Individual|findTestAccount|getDevRootAccount/);
    expect(OTP_CHAINS.every((c) => c.id.startsWith('dealer-'))).toBe(true);
    expect(read('config/ios-account-policy.ts')).not.toMatch(/individual/i);
  });

  test('credentials come from .env only and never from shell variables or the back office', () => {
    for (const dir of ['src', 'tests-ios', 'config']) {
      for (const file of fs
        .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts'))) {
        const code = stripComments(read(path.join(dir, file)));
        expect(code, `${dir}/${file}`).not.toMatch(/process\.env\.(IOS_TEST_DEALER|OTP_CODE)/);
      }
    }
    expect(read('config/credentials.config.ts')).toContain('localEnv.IOS_TEST_DEALER_PHONE');
    expect(stripComments(read('src/fixtures/ios.fixture.ts'))).toContain('getIosTestDealer()');
  });

  test('declared ids and titles: 64 iOS tests keep every title; chain steps use the shared constants', () => {
    const source = forgot();
    for (const step of Object.keys(STEP)) expect(source, step).toContain(`STEP.${step}`);
    expect(source).toContain('dealer account (OTP-dependent)');
    expect(source).toContain('individual account (OTP-dependent)');
  });
});

test.describe('iOS account state files stay out of git (selfcheck)', () => {
  test('the journal, marker and ledger live in the git-ignored reports/ folder', () => {
    expect(read('.gitignore')).toMatch(/^\/reports\/$/m);
    expect(read('src/mobile/ios/account/recovery-journal.ts')).toContain("'reports',");
    expect(read('src/mobile/ios/account/recovery-journal.ts')).toContain("'ios-account-state',");
  });
});
