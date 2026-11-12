import fs from 'node:fs';
import path from 'node:path';
import {
  restrictDriver,
  SPEC_DRIVER_METHODS,
  SpecDriverDenied,
} from '../../src/mobile/ios/spec-driver';
import { expect, test } from '../support/fixtures';

/**
 * Source-level inventory of every iOS interaction that taps or types. A NEW tap or typed value
 * anywhere in the iOS code fails this test until it is added below and classified, so an
 * unguarded account-action path cannot appear unnoticed. This is a source check, not runtime
 * prevention: code that deliberately starts its own session with the real driver is stopped only
 * by this inventory and by review. Offline: nothing here touches a device or a backend.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);

function files(dir: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(dir, f));
}

/** `method.call` for every tap or typed value in a screen file, in order. */
function interactionsOf(file: string): string[] {
  const code = stripComments(read(file));
  const found: string[] = [];
  for (const match of code.matchAll(/\.(click|setValue|addValue)\(/g)) {
    const before = code.slice(0, match.index);
    const methods = [
      ...before.matchAll(/(?:async\s+|private\s+)*([A-Za-z_]\w*)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{/g),
    ]
      .map((m) => m[1])
      .filter((name) => !KEYWORDS.has(name));
    found.push(`${methods.at(-1) ?? '?'}.${match[1]}`);
  }
  return found;
}

/**
 * Every tap or typed value in the screen objects, by method. GUARDED ones submit an account action
 * and must call the central guard or consume a permit first (checked below); the others navigate or
 * only type into a field, and cannot submit (their submit buttons are not reachable).
 */
const SCREENS: Record<string, string[]> = {
  'src/mobile/ios/screens/account.screen.ts': [
    'openLogoutConfirmation.click',
    'confirmLogout.click',
  ], // logout by exact verified labels, only when signing out is authorized
  'src/mobile/ios/screens/app-shell.screen.ts': ['openMore.click', 'setLanguage.click'], // navigation
  'src/mobile/ios/screens/forgot-password.screen.ts': [
    'enterPhone.setValue', // typing only: Send cannot be tapped from here
    'close.click', // navigation: Close, back to Login
    'requestPasswordReset.setValue',
    'requestPasswordReset.click',
  ], // GUARDED: permit
  'src/mobile/ios/screens/login.screen.ts': [
    'openLoginForm.click', // navigation
    'openLoginForm.click',
    'enterPhone.setValue', // typing only
    'enterPassword.setValue',
    'login.click', // GUARDED: central guard
    'openForgotPassword.click', // navigation
  ],
  'src/mobile/ios/screens/guest-tabs.screen.ts': ['openTab.click', 'openHeaderIcon.click'], // navigation: a tab-bar button, a header icon
  'src/mobile/ios/screens/help-center.screen.ts': [
    'openHelpCenter.click', // navigation: More -> Help Center
    'openCategory.click', // navigation: a category by exact label
    'toggleQuestion.click', // display: a question by exact label shows or hides its answer
    'goBack.click', // navigation: top-bar Back by its observed accessible name (English only)
  ],
  'src/mobile/ios/screens/more.screen.ts': [
    'openRow.click', // navigation: an in-app row by exact label (Change Environment and Rate us refused)
    'goBack.click', // navigation: the page's Back button
  ],
  'src/mobile/ios/screens/contact-form.screen.ts': [
    'openHelpCenter.click', // navigation: More -> Help Center
    'openCategory.click', // navigation: a category
    'openContactUs.click', // navigation: the Contact Us link
    'enter.setValue', // typing only: Send is read-only and id-only, so nothing can be sent
  ],
  'src/mobile/ios/screens/registration.screen.ts': [
    'openFromGuestPrompt.click', // navigation: guest prompt, then the registration choice
    'openFromGuestPrompt.click',
  ],
  'src/mobile/ios/screens/new-password.screen.ts': [
    'setNewPassword.setValue', // GUARDED: central guard
    'setNewPassword.click',
    'dismissPromptIfPresent.click', // a prompt button by exact label
  ],
  'src/mobile/ios/screens/otp.screen.ts': [
    'enterOtp.setValue',
    'enterOtp.setValue',
    'verifyOtp.click',
  ], // verifyOtp GUARDED
};

/** Taps and typing in specs, helpers, fixtures and simulator UI tests, by file (counts). */
const OUTSIDE: Record<string, number> = {
  'tests-ios/forgot-password.spec.ts': 2, // Close (navigation) and typing a made-up number, never submitted
  'tests-ios/login.spec.ts': 2, // the pending password-visibility test (navigation)
  'tests-ios/guest-screens.inspect.ts': 3, // read-only inspection: prompt, welcome choice, Close
  'tests-ios/forgot-password-phone.inspect.ts': 1, // read-only inspection: typing synthetic values into the Forgot Password phone field to read the local validation (Send is never tapped)
  'tests-ios/guest-notifications-favorites.inspect.ts': 1, // read-only inspection: one touch per run on a header icon located by its exact accessible name (never a submit)
  'tests-ios/signed-in.inspect.ts': 2, // authorized signed-in inspection: logout item and its confirmation, exact known label only
  'tests-ios/guest-extra.inspect.ts': 5, // read-only inspection: tabs, prompt, registration choice, field focus, show/hide, Close (never a submit)
  'ui-tests/ios/login-flow.ios.ui.spec.ts': 3, // simulator UI tests: field focus and Close
};

test.describe('iOS interaction inventory: no new tap or typing path without review (selfcheck)', () => {
  test('every tap and typed value in the screen objects is in the inventory', () => {
    const actual: Record<string, string[]> = {};
    for (const file of files('src/mobile/ios/screens')) {
      if (interactionsOf(file).length) actual[file] = interactionsOf(file);
    }
    expect(actual).toEqual(SCREENS);
  });

  test('the GUARDED methods call the guard or consume a permit before they type or tap', () => {
    const guarded: [string, string, string][] = [
      ['src/mobile/ios/screens/login.screen.ts', 'login', 'authorizeAccountAction('],
      ['src/mobile/ios/screens/otp.screen.ts', 'verifyOtp', 'authorizeAccountAction('],
      [
        'src/mobile/ios/screens/new-password.screen.ts',
        'setNewPassword',
        'authorizeAccountAction(',
      ],
      [
        'src/mobile/ios/screens/forgot-password.screen.ts',
        'requestPasswordReset',
        'permit.consume(',
      ],
    ];
    for (const [file, method, guard] of guarded) {
      const code = stripComments(read(file));
      const at = code.indexOf(`async ${method}(`);
      expect(at, `${file}#${method}`).toBeGreaterThan(0);
      const body = code.slice(at, code.indexOf('\n  }\n', at));
      const firstAction = Math.min(
        ...['.setValue(', '.click(', 'enterPhone(', 'enterPassword(', 'enterOtp('].map((s) =>
          body.includes(s) ? body.indexOf(s) : Infinity,
        ),
      );
      expect(body.indexOf(guard), `${file}#${method} guard`).toBeGreaterThan(-1);
      expect(body.indexOf(guard), `${file}#${method} before the first action`).toBeLessThan(
        firstAction,
      );
    }
  });

  test('specs, helpers, fixtures and UI tests tap or type only where the inventory says', () => {
    const actual: Record<string, number> = {};
    for (const dir of ['tests-ios', 'ui-tests/ios', 'ui-tests/support/ios', 'src/fixtures']) {
      for (const file of files(dir)) {
        if (file.includes('selfcheck') || (dir === 'src/fixtures' && !/ios/.test(file))) continue;
        const count = (stripComments(read(file)).match(/\.(click|setValue|addValue)\(/g) ?? [])
          .length;
        if (count) actual[file] = count;
      }
    }
    expect(actual).toEqual(OUTSIDE);
  });

  test('no other code can type or tap through raw driver commands', () => {
    const allowed = new Set([
      'src/mobile/ios/ios.session.ts', // restartIosApp
      'src/mobile/ios/spec-driver.ts', // the two restart scripts
      'src/mobile/ios/guarded-launch.runner.ts', // the guarded launch (accounts switches off)
      'src/mobile/ios/screens/app-shell.screen.ts', // keyboard and navigation only
      'tests-ios/guest-extra.inspect.ts', // read-only inspection: one touch on an unlabeled header icon
      'tests-ios/signed-in.inspect.ts', // signed-in inspection: logout taps by exact known label, only when authorized
    ]);
    const pattern =
      /\.(execute|executeScript|touchAction|performActions|elementClick|elementSendKeys|sendKeys)\(|\bdriver\.keys\(|mobile: (tap|swipe|type|keys|doubleTap|touchAndHold|dragFromToForDuration)/;
    for (const dir of [
      'src/mobile/ios',
      'src/fixtures',
      'tests-ios',
      'ui-tests/ios',
      'ui-tests/support/ios',
    ]) {
      for (const file of files(dir)) {
        if (file.includes('selfcheck') || allowed.has(file) || file.includes('/screens/')) continue;
        if (dir === 'src/fixtures' && !/ios/.test(file)) continue;
        expect(stripComments(read(file)), file).not.toMatch(pattern);
      }
    }
    // Sessions start only from the known places.
    const starters = ['src', 'tests-ios', 'ui-tests', 'config']
      .flatMap(files)
      .filter(
        (f) =>
          !f.includes('selfcheck') &&
          !/android/i.test(f) &&
          /startIosSession\(|\bremote\(/.test(stripComments(read(f))),
      );
    expect(starters.sort()).toEqual(
      [
        'src/fixtures/ios.fixture.ts',
        'src/mobile/ios/guarded-launch.runner.ts',
        'src/mobile/ios/ios.session.ts',
        'ui-tests/support/ios/ios-ui-fixtures.ts',
      ].sort(),
    );
  });

  test('specs get the restricted driver: restart, page source and pause only', async () => {
    const calls: string[] = [];
    const raw = {
      getPageSource: () => Promise.resolve('<xml/>'),
      pause: (ms: number) => Promise.resolve(void calls.push(`pause ${ms}`)),
      execute: (script: string) => Promise.resolve(void calls.push(script)),
      $: () => ({ click: () => calls.push('CLICK') }),
    };
    const spec = restrictDriver(raw as never);
    expect(Object.keys(spec).sort()).toEqual([...SPEC_DRIVER_METHODS].sort());
    expect(Object.isFrozen(spec)).toBe(true);
    await spec.execute('mobile: terminateApp', { bundleId: 'x' });
    await spec.execute('mobile: launchApp', { bundleId: 'x' });
    await spec.pause(5);
    expect(await spec.getPageSource()).toBe('<xml/>');
    for (const script of ['mobile: tap', 'mobile: type', 'mobile: activateApp', 'return 1', '']) {
      expect(() => spec.execute(script), script).toThrow(SpecDriverDenied);
    }
    for (const name of [
      '$',
      '$$',
      'findElement',
      'elementClick',
      'touchAction',
      'performActions',
      'keys',
    ]) {
      expect((spec as unknown as Record<string, unknown>)[name], name).toBeUndefined();
    }
    expect(calls).toEqual(['mobile: terminateApp', 'mobile: launchApp', 'pause 5']);
    // The fixture hands this to specs, and the real driver only to the screen objects.
    const fixture = stripComments(read('src/fixtures/ios.fixture.ts'));
    expect(fixture).toContain('restrictDriver(screenDriver)');
    expect(fixture.match(/new Ios\w+Screen\(screenDriver\)/g)).toHaveLength(11);
    expect(fixture).not.toMatch(/new Ios\w+Screen\(driver\)/);
    for (const file of files('tests-ios').filter((f) => !f.includes('.inspect.'))) {
      expect(stripComments(read(file)), file).not.toMatch(/screenDriver/);
    }
  });
});
