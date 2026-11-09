import {
  APPROVED_IOS_BUILDS,
  iosCapabilities,
  iosLaunchArguments,
  readIosConfig,
} from '../../src/mobile/ios/ios.config';
import {
  checkTexts,
  guestScreenTexts,
  inspectScreen,
  NOT_INSPECTED_SELECTORS,
  NOT_INSPECTED_TEXTS,
  proposeAppShellSelectors,
  proposeForgotPasswordSelectors,
  proposeLoginSelectors,
} from '../../src/mobile/ios/ios-inspection';
import { IOS_ACCESSIBILITY_IDS, IOS_SELECTORS_VERIFIED } from '../../src/mobile/ios/ios-selectors';
import { restartIosApp } from '../../src/mobile/ios/ios.session';
import { parseIosSource, redactInputValues } from '../../src/mobile/ios/page-source';
import { iosAppText } from '../../test-data/ios-app.data';
import { expect, test } from '../support/fixtures';

/** Offline: iOS language data, selector registry and first-inspection rules. */
const ARABIC = /[؀-ۿ]/;
const el = (
  type: string,
  label: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
) =>
  `<XCUIElementType${type} type="XCUIElementType${type}" label="${label}" name="${name}" visible="true" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const doc = (...children: string[]) => `<AppiumAUT>${children.join('')}</AppiumAUT>`;

test.describe('iOS language data and selectors (selfcheck)', () => {
  test('every iOS text exists in English and Arabic, in the right script', () => {
    const en = iosAppText('en');
    const ar = iosAppText('ar');
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const flat = (t: ReturnType<typeof iosAppText>): [string, string][] => {
      const out: [string, string][] = [];
      for (const [k, v] of Object.entries(t)) {
        if (typeof v === 'string') out.push([k, v]);
        else
          for (const [k2, v2] of Object.entries(v as Record<string, string>))
            out.push([`${k}.${k2}`, v2]);
      }
      return out;
    };
    for (const [key, value] of flat(en)) {
      expect(value, `en ${key}`).toBeTruthy();
      expect(ARABIC.test(value), `en ${key} must not be Arabic`).toBe(false);
    }
    for (const [key, value] of flat(ar)) {
      expect(value, `ar ${key}`).toBeTruthy();
      expect(ARABIC.test(value), `ar ${key} must be Arabic`).toBe(true);
    }
  });

  test('the selector registry is consistent with its verified flag', () => {
    const ids = Object.values(IOS_ACCESSIBILITY_IDS).flatMap((group) => Object.values(group));
    expect(ids.every((id) => typeof id === 'string')).toBe(true);
    if (IOS_SELECTORS_VERIFIED) {
      expect(
        ids.filter((id) => !id),
        'every guest-screen id recorded once verified',
      ).toEqual([]);
    } else {
      expect(IOS_SELECTORS_VERIFIED).toBe(false);
    }
  });
});

test.describe('iOS first-inspection rules (selfcheck)', () => {
  const en = iosAppText('en');
  const ar = iosAppText('ar');

  test('login: proposes ids, reports elements without an id, finds the visibility toggle', () => {
    const els = parseIosSource(
      doc(
        el('TextField', '', 'login_phone', 16, 200, 398, 44),
        el('SecureTextField', '', 'login_password', 16, 270, 340, 44),
        el('Button', 'Show', 'login_password_toggle', 360, 275, 40, 34),
        el('StaticText', en.forgotPassword, en.forgotPassword, 16, 330, 200, 20),
        el('Button', en.loginButton, en.loginButton, 16, 400, 398, 48),
      ),
    );
    const byKey = Object.fromEntries(proposeLoginSelectors(els, en).map((p) => [p.key, p]));
    expect(byKey['login.phoneInput']).toMatchObject({
      found: true,
      accessibilityId: 'login_phone',
    });
    expect(byKey['login.passwordInput']).toMatchObject({
      found: true,
      accessibilityId: 'login_password',
    });
    expect(byKey['login.passwordVisibilityToggle']).toMatchObject({
      found: true,
      accessibilityId: 'login_password_toggle',
    });
    // Name equals label: the element has no accessibility identifier.
    expect(byKey['login.loginButton']).toMatchObject({
      found: true,
      accessibilityId: null,
      type: 'Button',
    });
    expect(byKey['login.forgotPasswordLink']).toMatchObject({ found: true, accessibilityId: null });
  });

  test('forgot password: Close is found by its name, never by position; Send needs its own id', () => {
    for (const lang of ['en', 'ar'] as const) {
      const t = lang === 'en' ? en : ar;
      const els = parseIosSource(
        doc(
          // Both sides of the bar hold a button: only the one NAMED like Close counts.
          el(
            'Button',
            'navigationBarClose',
            'navigationBarClose',
            lang === 'en' ? 380 : 8,
            61,
            44,
            44,
          ),
          el('Button', 'Help', 'nav_help', lang === 'en' ? 8 : 380, 61, 44, 44),
          el('TextField', '', 'forgot_phone', 16, 200, 398, 44),
          el('Button', t.sendButton, 'forgot_send', 16, 300, 398, 48),
        ),
      );
      const byKey = Object.fromEntries(
        proposeForgotPasswordSelectors(els, t).map((p) => [p.key, p]),
      );
      // name equals label: reported as having no separate accessibility id.
      expect(byKey['forgotPassword.closeButton'], lang).toMatchObject({
        found: true,
        accessibilityId: null,
        label: 'navigationBarClose',
        candidates: 1,
        ambiguous: false,
      });
      expect(byKey['forgotPassword.sendButton'], lang).toMatchObject({
        found: true,
        accessibilityId: 'forgot_send',
      });
      expect(byKey).not.toHaveProperty(['forgotPassword.backButton']);
    }
  });

  test('text check reports found and missing expected text', () => {
    const els = parseIosSource(doc(el('Button', en.loginButton, '', 0, 0, 100, 40)));
    expect(
      checkTexts(els, { loginButton: en.loginButton, forgotPassword: en.forgotPassword }),
    ).toEqual([
      { key: 'loginButton', expected: en.loginButton, found: true },
      { key: 'forgotPassword', expected: en.forgotPassword, found: false },
    ]);
  });
});

test.describe('iOS inspection completeness (selfcheck)', () => {
  const en = iosAppText('en');

  test('every registry selector is proposed by the inspection or listed as not inspected', () => {
    const registry = Object.entries(IOS_ACCESSIBILITY_IDS).flatMap(([group, ids]) =>
      Object.keys(ids).map((key) => `${group}.${key}`),
    );
    const proposed = [
      ...proposeAppShellSelectors([], en),
      ...proposeLoginSelectors([], en),
      ...proposeForgotPasswordSelectors([], en),
    ].map((p) => p.key);
    const notInspected = Object.keys(NOT_INSPECTED_SELECTORS);
    expect(
      proposed.filter((k) => notInspected.includes(k)),
      'listed twice',
    ).toEqual([]);
    expect([...proposed, ...notInspected].sort()).toEqual([...registry].sort());
  });

  test('every app text is checked on a guest screen or listed as not inspected', () => {
    const checked = Object.values(guestScreenTexts(en)).flatMap((t) => Object.keys(t));
    const notInspected = Object.keys(NOT_INSPECTED_TEXTS);
    const all = Object.entries(en).flatMap(([k, v]) =>
      typeof v === 'string' ? [k] : Object.keys(v as Record<string, string>),
    );
    expect(
      checked.filter((k) => notInspected.includes(k)),
      'listed twice',
    ).toEqual([]);
    expect([...checked, ...notInspected].sort()).toEqual([...all].sort());
  });

  test('more than one matching element is reported as ambiguous, not silently picked', () => {
    const els = parseIosSource(
      doc(
        el('TextField', '', 'field_a', 16, 200, 398, 44),
        el('TextField', '', 'field_b', 16, 260, 398, 44),
        el('Button', en.loginButton, en.loginButton, 16, 400, 398, 48),
      ),
    );
    const byKey = Object.fromEntries(proposeLoginSelectors(els, en).map((p) => [p.key, p]));
    expect(byKey['login.phoneInput']).toMatchObject({ candidates: 2, ambiguous: true });
    expect(byKey['login.loginButton']).toMatchObject({ candidates: 1, ambiguous: false });
    expect(byKey['login.passwordInput']).toMatchObject({ found: false, ambiguous: false });
  });

  test('missing and duplicate ids are reported; input values never reach the inventory', () => {
    const xml = doc(
      '<XCUIElementTypeTextField type="XCUIElementTypeTextField" name="phone" label="" value="0501234567" placeholderValue="Phone number" visible="true" enabled="true" x="16" y="200" width="398" height="44"/>',
      el('Button', 'Log In', 'Log In', 16, 400, 398, 48),
      el('StaticText', 'A', 'dup', 16, 10, 50, 20),
      el('StaticText', 'B', 'dup', 16, 40, 50, 20),
    );
    const report = inspectScreen(parseIosSource(xml), [], { placeholder: 'Phone number' });
    expect(report.texts).toEqual([{ key: 'placeholder', expected: 'Phone number', found: true }]);
    expect(report.missingIds.map((e) => e.label)).toEqual(['Log In']);
    expect(report.duplicateIds).toEqual(['dup']);
    expect(JSON.stringify(report)).not.toContain('0501234567');
  });
});

test.describe('iOS page source parsing (selfcheck)', () => {
  test('decodes XML entities and reads enabled and placeholder', () => {
    const [field, button] = parseIosSource(
      doc(
        '<XCUIElementTypeTextField type="XCUIElementTypeTextField" name="a&amp;b" label="Don&apos;t &quot;x&quot;&#10;&#x2019;" placeholderValue="&lt;phone&gt;" visible="true" x="0" y="0" width="1" height="1"/>',
        '<XCUIElementTypeButton type="XCUIElementTypeButton" name="b" label="b" enabled="false" visible="true" x="0" y="0" width="1" height="1"/>',
      ),
    );
    expect(field).toMatchObject({
      name: 'a&b',
      label: 'Don\'t "x"\n’',
      placeholder: '<phone>',
      enabled: true,
    });
    expect(button.enabled).toBe(false);
  });

  test('attachments redact input values only', () => {
    const xml = doc(
      '<XCUIElementTypeTextField type="XCUIElementTypeTextField" value="0501234567" placeholderValue="Phone" x="0"/>',
      '<XCUIElementTypeSecureTextField type="XCUIElementTypeSecureTextField" value="••••" x="0"/>',
      '<XCUIElementTypeStaticText type="XCUIElementTypeStaticText" value="Welcome" x="0"/>',
    );
    const out = redactInputValues(xml);
    expect(out).not.toContain('0501234567');
    expect(out).not.toContain('••••');
    expect(out).toContain('placeholderValue="Phone"');
    expect(out).toContain('value="Welcome"');
  });
});

test.describe('iOS app relaunch (selfcheck)', () => {
  const calls: [string, unknown][] = [];
  const fakeDriver = {
    execute: (script: string, args: unknown) => {
      calls.push([script, args]);
      return Promise.resolve(undefined);
    },
  } as unknown as Parameters<typeof restartIosApp>[0];
  const bundleId = APPROVED_IOS_BUILDS[0].bundleId;

  test('a simulator relaunch passes the guard launch arguments (never activateApp)', async () => {
    calls.length = 0;
    const sim = {
      ...readIosConfig({ IOS_BUNDLE_ID: bundleId }),
      target: 'simulator' as const,
      guardProxy: { host: '127.0.0.1', port: 8899 },
    };
    await restartIosApp(fakeDriver, sim);
    expect(calls).toEqual([
      ['mobile: terminateApp', { bundleId }],
      ['mobile: launchApp', { bundleId, arguments: ['-MazadUITestProxy', '127.0.0.1:8899'] }],
    ]);
    // Session start and relaunch use the same arguments.
    expect(iosCapabilities(sim)['appium:processArguments']).toEqual({
      args: iosLaunchArguments(sim),
    });
  });

  test('a device relaunch passes no launch arguments', async () => {
    calls.length = 0;
    await restartIosApp(fakeDriver, readIosConfig({ IOS_BUNDLE_ID: bundleId }));
    expect(calls.map(([script]) => script)).toEqual(['mobile: terminateApp', 'mobile: launchApp']);
    expect(calls[1][1]).toEqual({ bundleId, arguments: [] });
  });
});

test.describe('iOS app-shell inspection (selfcheck)', () => {
  test('tab buttons are taken from the TabBar only; the guest prompt by its text', () => {
    for (const lang of ['en', 'ar'] as const) {
      const t = iosAppText(lang);
      const els = parseIosSource(
        doc(
          // A same-labelled button outside the tab bar must not count as a candidate.
          el('Button', t.tabs.home, 'banner_home', 16, 120, 200, 40),
          el('StaticText', t.guestPrompt, 'more_guest_prompt', 16, 300, 300, 40),
          el('TabBar', '', '', 0, 850, 430, 82),
          el('Button', t.tabs.home, 'tab_home', 0, 852, 86, 49),
          el('Button', t.tabs.more, t.tabs.more, 344, 852, 86, 49),
        ),
      );
      const byKey = Object.fromEntries(proposeAppShellSelectors(els, t).map((p) => [p.key, p]));
      expect(byKey['appShell.homeTab'], lang).toMatchObject({
        accessibilityId: 'tab_home',
        candidates: 1,
        ambiguous: false,
      });
      // Name equals label: no accessibility id, reported as such.
      expect(byKey['appShell.moreTab'], lang).toMatchObject({ found: true, accessibilityId: null });
      expect(byKey['appShell.guestPrompt'], lang).toMatchObject({
        accessibilityId: 'more_guest_prompt',
      });
    }
  });

  test('logout ids exist in the registry but stay EMPTY until a login-required inspection', () => {
    expect(IOS_ACCESSIBILITY_IDS.account).toEqual({ logoutItem: '', logoutConfirm: '' });
    // Listed as not inspected (they need a login), so they cannot be recorded by guess.
    expect(Object.keys(NOT_INSPECTED_SELECTORS)).toEqual(
      expect.arrayContaining(['account.logoutItem', 'account.logoutConfirm']),
    );
  });
});
