import fs from 'node:fs';
import path from 'node:path';
import { IOS_ACCESSIBILITY_IDS } from '../../src/mobile/ios/ios-selectors';
import { classifyScreen, unlabeledButtons } from '../../src/mobile/ios/ios-inspection';
import type { IosDriver } from '../../src/mobile/ios/ios.session';
import { parseIosSource } from '../../src/mobile/ios/page-source';
import { IosAppShellScreen } from '../../src/mobile/ios/screens/app-shell.screen';
import { IosForgotPasswordScreen } from '../../src/mobile/ios/screens/forgot-password.screen';
import { IosLoginScreen } from '../../src/mobile/ios/screens/login.screen';
import { iosAppText } from '../../test-data/ios-app.data';
import { PASSWORD_TOGGLE_PENDING, pendingDetails } from '../../tests-ios/ios-test-helpers';
import type { Language } from '../../src/types';
import { expect, test } from '../support/fixtures';

/** Offline: a fake app and driver. Nothing is launched or contacted. */
const HOME = { en: iosAppText('en').tabs.home, ar: iosAppText('ar').tabs.home };
const MORE = { en: iosAppText('en').tabs.more, ar: iosAppText('ar').tabs.more };
const OPTION = { en: iosAppText('en').languageOption, ar: iosAppText('ar').languageOption };
const GUEST_PROMPT = { en: iosAppText('en').guestPrompt, ar: iosAppText('ar').guestPrompt };

/** Waits only briefly for a first match (the real default is 15 s). */
class FastShell extends IosAppShellScreen {
  protected override onlyTimeout = 20;
  protected override moreShownTimeout = 30;
}

/** A tiny model of the app's tab bar and More language list, behind the WebdriverIO calls used. */
function fakeApp(start: {
  language: Language | null;
  screen?: 'home' | 'more';
  options?: boolean;
  /** The first tap on More does nothing (the app showed More as selected but not its content). */
  ignoreFirstMoreTap?: boolean;
  /** Labels that match MORE than one element (ambiguity), by label. */
  duplicates?: Record<string, number>;
}) {
  const state = { language: start.language, screen: start.screen ?? 'home', moreTaps: 0 };
  const clicks: string[] = [];
  const selectors: string[] = [];
  const labelOf = (selector: string): string | null => {
    const m = selector.match(/label == ("(?:[^"\\]|\\.)*")/);
    return m ? (JSON.parse(m[1]) as string) : null;
  };
  const displayed = (selector: string): boolean => {
    const label = labelOf(selector);
    if (label === null || state.language === null) return false;
    // The tab bar is always there.
    if (label === HOME[state.language] || label === MORE[state.language]) return true;
    // The guest prompt and the language options exist only on More (the options only when offered).
    if (state.screen !== 'more') return false;
    if (label === GUEST_PROMPT[state.language]) return true;
    return (start.options ?? true) && Object.values(OPTION).includes(label);
  };
  const element = (selector: string) => ({
    isDisplayed: () => Promise.resolve(displayed(selector)),
    waitForDisplayed: (o?: { timeoutMsg?: string }) =>
      displayed(selector)
        ? Promise.resolve(true)
        : Promise.reject(new Error(o?.timeoutMsg ?? 'not displayed')),
    click: () => {
      const label = labelOf(selector) as string;
      clicks.push(label);
      if (state.language && label === MORE[state.language]) {
        state.moreTaps++;
        if (!(start.ignoreFirstMoreTap && state.moreTaps === 1)) state.screen = 'more';
      }
      if (state.language && label === HOME[state.language]) state.screen = 'home';
      for (const l of ['en', 'ar'] as const) {
        if (label === OPTION[l] && state.screen === 'more') {
          state.language = l;
          state.screen = 'home';
        }
      }
      return Promise.resolve();
    },
  });
  const driver = {
    $: (selector: string) => {
      selectors.push(selector);
      return element(selector);
    },
    $$: (selector: string) => {
      selectors.push(selector);
      const label = labelOf(selector);
      const copies = displayed(selector) ? (start.duplicates?.[label ?? ''] ?? 1) : 0;
      return {
        getElements: () => Promise.resolve(Array.from({ length: copies }, () => element(selector))),
      };
    },
    pause: () => Promise.resolve(),
    waitUntil: async (
      condition: () => Promise<boolean>,
      o: { timeout?: number; timeoutMsg?: string },
    ) => {
      const end = Date.now() + (o.timeout ?? 1000);
      for (;;) {
        if (await condition()) return true;
        if (Date.now() > end) throw new Error(o.timeoutMsg ?? 'timeout');
        await new Promise((r) => setTimeout(r, 5));
      }
    },
  } as unknown as IosDriver;
  return { state, clicks, selectors, shell: new FastShell(driver) };
}

test.describe('iOS language start and switch (selfcheck)', () => {
  test('waits for the Home tab of EITHER language and returns the one found', async () => {
    for (const language of ['en', 'ar'] as const) {
      const { shell } = fakeApp({ language });
      expect(await shell.waitUntilReady(HOME, 1_000)).toBe(language);
    }
  });

  test('fails clearly when neither Home tab appears', async () => {
    const { shell } = fakeApp({ language: null });
    await expect(shell.waitUntilReady(HOME, 200)).rejects.toThrow(
      /Neither the English nor the Arabic Home tab appeared/,
    );
  });

  test('already in the requested language: nothing is tapped', async () => {
    for (const language of ['en', 'ar'] as const) {
      const { shell, clicks } = fakeApp({ language });
      expect(await shell.setLanguage(language, OPTION, MORE, HOME)).toBe(language);
      expect(clicks).toEqual([]);
    }
  });

  test('another language: opens More with the CURRENT language label, taps the requested option', async () => {
    for (const [from, to] of [
      ['ar', 'en'],
      ['en', 'ar'],
    ] as const) {
      const { shell, clicks, state } = fakeApp({ language: from });
      expect(await shell.setLanguage(to, OPTION, MORE, HOME)).toBe(from);
      expect(clicks).toEqual([MORE[from], OPTION[to]]);
      expect(state.language).toBe(to);
    }
  });

  test('More counts as displayed only once its guest prompt is on screen', async () => {
    for (const language of ['en', 'ar'] as const) {
      const { shell, state } = fakeApp({ language });
      // Still on Home (the More tap has not rendered yet): not displayed, no exception.
      expect(await shell.waitUntilMoreDisplayed(GUEST_PROMPT[language], 100)).toBe(false);
      await shell.openMore(MORE[language], HOME[language]);
      expect(state.screen).toBe('more');
      expect(await shell.waitUntilMoreDisplayed(GUEST_PROMPT[language], 1_000)).toBe(true);
    }
  });

  test('opening More is verified: an ignored tap selects Home first, then taps More again', async () => {
    const { shell, clicks, state } = fakeApp({ language: 'ar', ignoreFirstMoreTap: true });
    await shell.openMore(MORE.ar, HOME.ar);
    expect(state.screen).toBe('more');
    // More (ignored), Home (to unstick the tab bar), More again.
    expect(clicks).toEqual([MORE.ar, HOME.ar, MORE.ar]);
    // And it gives up with a clear message when More never opens (not a silent pass).
    const never = fakeApp({ language: 'en', options: false });
    await expect(never.shell.openMore(MORE.en, HOME.en)).rejects.toThrow(
      /did not open the More screen after 3 attempts/,
    );
    expect(never.clicks.filter((c) => c === MORE.en)).toHaveLength(3);
  });

  test('a missing language option fails clearly instead of continuing', async () => {
    const { shell, state } = fakeApp({ language: 'ar', options: false });
    // More only counts as shown when its language options are there, so this fails at More.
    await expect(shell.setLanguage('en', OPTION, MORE, HOME)).rejects.toThrow(
      /did not open the More screen after 3 attempts/,
    );
    expect(state.language).toBe('ar');
  });

  test('the language is detected by label, never by a recorded accessibility id', async () => {
    const { shell, selectors } = fakeApp({ language: 'ar' });
    await shell.detectLanguage(HOME);
    expect(selectors.every((s) => s.includes('label ==') && !s.startsWith('~'))).toBe(true);
    expect(IOS_ACCESSIBILITY_IDS.appShell.homeTab).toBe(''); // and ids stay unrecorded
  });
});

test.describe('iOS controls without accessibility ids (selfcheck)', () => {
  const noDriver = new Proxy(
    {},
    {
      get() {
        throw new Error('the driver must not be used while the id is missing');
      },
    },
  ) as unknown as IosDriver;

  test('the password visibility control is never located by position or text', () => {
    const login = new IosLoginScreen(noDriver);
    expect(() => login.passwordVisibilityToggle).toThrow(/password visibility control/);
    expect(() => login.passwordVisibilityToggle).toThrow(/not located by position or text/);
  });

  test('Log In and Send are the ONE Button without an accessible name, checked on every use', async () => {
    const asked: string[] = [];
    const element = { click: () => Promise.resolve(), isEnabled: () => Promise.resolve(false) };
    const driverWith = (count: number) =>
      ({
        $$: (selector: string) => {
          asked.push(selector);
          return {
            getElements: () => Promise.resolve(Array.from({ length: count }, () => element)),
          };
        },
        pause: () => Promise.resolve(),
      }) as unknown as IosDriver;
    class FastForgot extends IosForgotPasswordScreen {
      protected override onlyTimeout = 20;
    }
    const selector =
      '-ios predicate string:type == "XCUIElementTypeButton" AND (label == nil OR label == "") AND (name == nil OR name == "")';
    await new IosLoginScreen(driverWith(1)).loginButton();
    await new IosForgotPasswordScreen(driverWith(1)).sendButton();
    expect(asked).toEqual([selector, selector]);
    expect(asked.join(' ')).not.toMatch(/\[\d+\]|parent::|xpath/i);
    // Two or none: fail with a clear message, never the first.
    await expect(new IosLoginScreen(driverWith(2)).loginButton()).rejects.toThrow(
      /Login: the Log In button \(the only Button without an accessible name\): expected exactly 1 matching element, found 2/,
    );
    await expect(new FastForgot(driverWith(0)).sendButton()).rejects.toThrow(/found 0/);
  });

  test('Close is the ONE Button with the observed name, never found by position', async () => {
    const asked: string[] = [];
    const element = { click: () => Promise.resolve() };
    const driverWith = (count: number) =>
      ({
        $$: (selector: string) => {
          asked.push(selector);
          return {
            getElements: () => Promise.resolve(Array.from({ length: count }, () => element)),
          };
        },
        pause: () => Promise.resolve(),
      }) as unknown as IosDriver;
    await new IosForgotPasswordScreen(driverWith(1)).onlyCloseButton();
    expect(asked).toEqual([
      '-ios predicate string:type == "XCUIElementTypeButton" AND name == "navigationBarClose"',
    ]);
    await expect(new IosForgotPasswordScreen(driverWith(2)).onlyCloseButton()).rejects.toThrow(
      /Forgot Password: the Close button: expected exactly 1 matching element, found 2/,
    );
  });

  test('no screen object uses a positional or structural selector for those controls', () => {
    const dir = path.resolve(__dirname, '..', '..', 'src', 'mobile', 'ios', 'screens');
    for (const file of ['login.screen.ts', 'forgot-password.screen.ts']) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(text, file).not.toMatch(
        /parent::|XCUIElementTypeNavigationBar|XCUIElementTypeButton\[/,
      );
      expect(text, file).not.toMatch(/backButton/);
    }
    expect(Object.keys(IOS_ACCESSIBILITY_IDS.forgotPassword)).toEqual([
      'phoneInput',
      'sendButton',
      'closeButton',
    ]);
  });
});

test.describe('iOS inspection helpers for the new findings (selfcheck)', () => {
  const en = iosAppText('en');
  const xml = (...items: string[]) => `<AppiumAUT>${items.join('')}</AppiumAUT>`;
  const node = (type: string, label: string, name: string, enabled = true) =>
    `<XCUIElementType${type} type="XCUIElementType${type}" label="${label}" name="${name}" enabled="${enabled}" visible="true" x="0" y="0" width="100" height="40"/>`;

  test('unlabeled buttons (no id, no label) are reported, labeled ones are not', () => {
    const els = parseIosSource(
      xml(
        node('Button', '', '', false),
        node('Button', 'Log In', 'Log In'),
        node('Button', 'x', 'id'),
      ),
    );
    expect(unlabeledButtons(els)).toHaveLength(1);
    expect(unlabeledButtons(els)[0]).toMatchObject({ type: 'Button', enabled: false });
  });

  test('classifies where Close lands, from the screen content', () => {
    const forgot = parseIosSource(xml(node('StaticText', en.resetPasswordHeading, '')));
    const login = parseIosSource(
      xml(node('SecureTextField', '', ''), node('Button', en.forgotPassword, en.forgotPassword)),
    );
    const choice = parseIosSource(xml(node('Button', en.entryChoiceLogin, en.entryChoiceLogin)));
    const tabs = parseIosSource(xml(node('Button', en.tabs.home, en.tabs.home)));
    expect(classifyScreen(forgot, en).screen).toBe('forgot-password');
    expect(classifyScreen(login, en).screen).toBe('login');
    expect(classifyScreen(choice, en).screen).toBe('login-choice');
    expect(classifyScreen(tabs, en).screen).toBe('tab-bar');
    expect(classifyScreen(parseIosSource(xml(node('Other', '', ''))), en)).toEqual({
      screen: 'unknown',
      evidence: [],
    });
  });
});

test.describe('iOS pending tests for controls without ids (selfcheck)', () => {
  test('while an id is not recorded the dependent tests are pending, with the reason recorded', () => {
    for (const [reason, control] of [[PASSWORD_TOGGLE_PENDING, 'password visibility']] as const) {
      expect(reason, control).toMatch(/^Pending: .* has no recorded accessibility id/);
      expect(reason, control).toMatch(/not located by position or text/);
    }
    expect(IOS_ACCESSIBILITY_IDS.login.loginButton).toBe('');
    expect(pendingDetails(undefined)).toEqual({});
    expect(pendingDetails('why')).toEqual({
      annotation: [
        { type: 'pending-selector', description: 'why' },
        { type: 'category', description: 'pending-implementation: why' },
      ],
    });
    // With the full text gate as a further blocker it is recorded as a second cause.
    expect(pendingDetails('why', 'gate').annotation).toContainEqual({
      type: 'also',
      description: 'text-gate: gate',
    });
  });
});
