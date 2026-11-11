import fs from 'node:fs';
import path from 'node:path';
import { STEP } from '../../src/mobile/ios/account/otp-chain';
import { type IosConfig, readIosConfig } from '../../src/mobile/ios/ios.config';
import {
  type IosGates,
  IOS_GATES,
  iosStaticProblem,
  outOfTextScopeReason,
} from '../../src/mobile/ios/ios-preflight';
import type { IosDriver } from '../../src/mobile/ios/ios.session';
import { IosForgotPasswordScreen } from '../../src/mobile/ios/screens/forgot-password.screen';
import { IosLoginScreen } from '../../src/mobile/ios/screens/login.screen';
import { IOS_TEXT_VERIFIED, iosAppText } from '../../test-data/ios-app.data';
import {
  GUEST_FORM_TEST_TITLES,
  GUEST_FORM_TEXT_SCOPE,
  guestFormTextProblem,
  IOS_GUEST_FORM_TEXT,
} from '../../test-data/ios-verified-text';
import { attachFailureEvidence } from '../../tests-ios/ios-test-helpers';
import { expect, test } from '../support/fixtures';

/** Offline: no device, no Appium, no network. */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const STG = { TEST_ENV: 'stg-154' };
const verifiedDevice = (): IosConfig => {
  const config = readIosConfig({ IOS_BUNDLE_ID: 'com.motory.dealer' });
  return { ...config, approvedBuild: { ...config.approvedBuild, verifiedOnDevice: true } };
};
const gates = (g: Partial<IosGates>): IosGates => ({
  networkGuardReady: false,
  deviceRunsApproved: true,
  textVerified: false,
  guestFormTextVerified: true,
  ...g,
});

test.describe('iOS narrow text gate (selfcheck)', () => {
  test('covers exactly this English and Arabic text, and it matches the app text data', () => {
    expect(IOS_GUEST_FORM_TEXT.en).toEqual({
      homeTab: 'Home',
      moreTab: 'More',
      languageOption: 'English',
      guestPrompt: 'Login/ Create an account',
      entryChoiceLogin: 'Log In',
      forgotPassword: 'Forgot your password?',
      resetPasswordHeading: 'Reset Password',
      logoutItem: 'Log out',
      logoutConfirmation: 'Log out',
      logoutBack: 'Back',
      createAccountChoice: 'Create a new account',
      registrationHeading: 'Create a new account',
      chooseAccountType: 'Choose Account Type',
      registrationNext: 'Next',
      bidsTab: 'Bids',
      actionsTab: 'Actions',
      bidsHeading: 'My Bids',
      bidsLive: 'Live',
      bidsClosed: 'Closed',
      bidsWon: 'Won',
      bidsLost: 'Lost',
      bidsGuestMessage: 'Create an account or log in to start bidding',
      bidsGuestLogin: 'Login/ Create an account',
      actionsHeading: 'My Actions',
      actionsNeeded: 'Action Needed',
      actionsPending: 'Pending',
      actionsGuestMessage: 'Log in to see auctions with actions needed',
      actionsGuestLogin: 'Login',
      notificationsHeading: 'Turn on notifications now',
      notificationsMessage: 'To stay updated about auction status, and when new auctions are added',
      notificationsEnable: 'Turn on notifications',
      notificationsLater: 'Later',
      favoritesHeading: 'Favorite Auctions',
      favoritesLive: 'Live',
      favoritesUpcoming: 'Upcoming',
      favoritesGuestMessage: 'Create a new account or log in to add the auction to your favorites',
      favoritesGuestLogin: 'Login/ Create an account',
      contactHelpCenter: 'Help Center',
      contactCategory: 'About Company',
      contactCantFindAnswer: 'Can’t find your answer?',
      contactUsLink: 'Contact Us',
      contactFormTitle: 'Contact Form',
      contactIntro: "Or enter your information & we'll contact you",
      contactNameLabel: 'Name',
      contactEmailLabel: 'E-mail',
      contactMobileLabel: 'Mobile Number',
      contactMessageLabel: 'Message',
      contactNamePlaceholder: 'Enter your name',
      contactEmailPlaceholder: 'Enter your email',
      contactMobilePlaceholder: 'e.g. 0554235678',
      contactMessagePlaceholder: 'Enter your message',
      contactMobilePrefix: '+966',
    });
    expect(IOS_GUEST_FORM_TEXT.ar).toEqual({
      homeTab: 'الرئيسية',
      moreTab: 'المزيد',
      languageOption: 'العربية',
      guestPrompt: 'تسجيل الدخول/ إنشاء حساب',
      entryChoiceLogin: 'تسجيل الدخول',
      forgotPassword: 'هل نسيت كلمة المرور؟',
      resetPasswordHeading: 'إعادة تعيين كلمة المرور',
      logoutItem: 'تسجيل الخروج',
      logoutConfirmation: 'تسجيل الخروج',
      logoutBack: 'عودة',
      createAccountChoice: 'إنشاء حساب جديد',
      registrationHeading: 'إنشاء حساب جديد',
      chooseAccountType: 'اختر نوع الحساب',
      registrationNext: 'التالي',
      bidsTab: 'مزاداتي',
      actionsTab: 'إجراءاتي',
      bidsHeading: 'مزاداتي',
      bidsLive: 'الحالية',
      bidsClosed: 'المغلقة',
      bidsWon: 'الرابحة',
      bidsLost: 'الخاسرة',
      bidsGuestMessage: 'قم بإنشاء حساب أو تسجيل الدخول للمشاركة في أي مزاد',
      bidsGuestLogin: 'تسجيل الدخول/ إنشاء حساب',
      actionsHeading: 'إجراءاتي',
      actionsNeeded: 'تحتاج إلى إجراء',
      actionsPending: 'قيد الانتظار',
      actionsGuestMessage: 'سجّل الدخول لرؤية المزادات التي تحتاج إلى إجراء',
      actionsGuestLogin: 'تسجيل الدخول',
      notificationsHeading: 'فعّل الإشعارات الآن ',
      notificationsMessage:
        'لتصلك آخر الإشعارات عن حالة المزاد، وليتم إعلامك عند إضافة مزادات جديدة',
      notificationsEnable: 'تفعيل الإشعارات',
      notificationsLater: 'لاحقاً',
      favoritesHeading: 'المزادات المفضلة',
      favoritesLive: 'الحالية',
      favoritesUpcoming: 'القادمة',
      favoritesGuestMessage: 'قم بإنشاء حساب أو تسجيل الدخول لإضافة مزاد إلى المفضلة',
      favoritesGuestLogin: 'تسجيل الدخول/ إنشاء حساب',
      contactHelpCenter: 'مركز المساعدة',
      contactCategory: 'عن الشركة',
      contactCantFindAnswer: 'لم تجد إجابة على استفسارك؟',
      contactUsLink: 'تواصل معنا',
      contactFormTitle: 'نموذج الاتصال',
      contactIntro: 'أو أدخل معلوماتك وسنتواصل معك',
      contactNameLabel: 'الاسم',
      contactEmailLabel: 'البريد الإلكتروني',
      contactMobileLabel: 'رقم الجوال',
      contactMessageLabel: 'الرسالة',
      contactNamePlaceholder: 'أدخل الاسم',
      contactEmailPlaceholder: 'أدخل البريد الإلكتروني',
      contactMobilePlaceholder: 'مثال: 0554235678',
      contactMessagePlaceholder: 'أدخل رسالتك',
      contactMobilePrefix: '+966',
    });
    expect(guestFormTextProblem()).toBeUndefined();
  });

  test('any change to a covered string closes the narrow gate (and names the string)', () => {
    const edits: [string, (t: ReturnType<typeof iosAppText>) => void][] = [
      ['en.homeTab', (t) => (t.tabs.home = 'Start')],
      ['en.guestPrompt', (t) => (t.guestPrompt = 'Sign in')],
      ['en.forgotPassword', (t) => (t.forgotPassword = 'Forgot?')],
      ['en.resetPasswordHeading', (t) => (t.resetPasswordHeading = 'Reset')],
    ];
    for (const [key, edit] of edits) {
      const problem = guestFormTextProblem((language) => {
        const text = structuredClone(iosAppText(language));
        if (language === 'en') edit(text);
        return text;
      });
      expect(problem, key).toContain(key);
    }
    const arabic = guestFormTextProblem((language) => {
      const text = structuredClone(iosAppText(language));
      if (language === 'ar') text.entryChoiceLogin = 'دخول';
      return text;
    });
    expect(arabic).toContain('ar.entryChoiceLogin');
  });

  test('IOS_TEXT_VERIFIED stays closed; only the narrow gate is open', () => {
    expect(IOS_TEXT_VERIFIED).toBe(false);
    expect(IOS_GATES).toMatchObject({ textVerified: false, guestFormTextVerified: true });
  });

  test('the narrow gate only counts for a run that asks for its scope', () => {
    const run = (options: Parameters<typeof iosStaticProblem>[1], g = gates({})) =>
      iosStaticProblem(STG, options, g, verifiedDevice);
    expect(run({})).toMatch(/selectors and text are not verified yet/);
    expect(run({ textScope: GUEST_FORM_TEXT_SCOPE })).toBeUndefined();
    expect(run({ forInspection: true })).toBeUndefined();
    // Narrow gate closed: the scope alone is not enough.
    expect(
      run({ textScope: GUEST_FORM_TEXT_SCOPE }, gates({ guestFormTextVerified: false })),
    ).toMatch(/not verified yet/);
    // The full gate still opens everything by itself.
    expect(run({}, gates({ textVerified: true, guestFormTextVerified: false }))).toBeUndefined();
  });

  test('the narrow gate does not bypass any other gate', () => {
    const scope = { textScope: GUEST_FORM_TEXT_SCOPE };
    expect(
      iosStaticProblem(STG, scope, gates({ deviceRunsApproved: false }), verifiedDevice),
    ).toMatch(/Safety gate \(device\)/);
    const unverified = () => ({
      ...verifiedDevice(),
      approvedBuild: { ...verifiedDevice().approvedBuild, verifiedOnDevice: false },
    });
    expect(iosStaticProblem(STG, scope, gates({}), unverified)).toMatch(/not yet verified/);
    expect(iosStaticProblem({ TEST_ENV: 'stg-155' }, scope, gates({}), verifiedDevice)).toMatch(
      /Safety gate \(environment\)/,
    );
  });
});

/** Titles declared in the two iOS specs, from their source (constants resolved). */
function declaredTitles(): string[] {
  const titles: string[] = [];
  for (const file of [
    'tests-ios/login.spec.ts',
    'tests-ios/forgot-password.spec.ts',
    'tests-ios/registration.spec.ts',
    'tests-ios/guest-tabs.spec.ts',
    'tests-ios/contact-us.spec.ts',
  ]) {
    const source = read(file);
    const pattern =
      /(?:\btest(?:\.fixme)?|:\s*test\))\(\s*(?:'((?:[^'\\]|\\.)+)'|`([^`]+)`|GUEST_FORM_TEST_TITLES\[(\d+)\]|STEP\.(\w+))/g;
    for (const m of source.matchAll(pattern)) {
      if (m[3] !== undefined) titles.push(GUEST_FORM_TEST_TITLES[Number(m[3])]);
      else if (m[4] !== undefined) titles.push(STEP[m[4] as keyof typeof STEP]);
      else titles.push(m[1] ?? m[2]);
    }
  }
  return titles;
}

test.describe('iOS narrow text gate cannot unblock other tests (selfcheck)', () => {
  test('with the narrow gate open, only the two guest display tests may run', () => {
    const titles = [...new Set(declaredTitles())];
    expect(titles.length).toBeGreaterThan(15);
    expect(
      [...titles].filter((t) => (GUEST_FORM_TEST_TITLES as readonly string[]).includes(t)).sort(),
    ).toEqual([...GUEST_FORM_TEST_TITLES].sort());
    const allowed = titles.filter(
      (title) => !outOfTextScopeReason('ios', title, STG, gates({}), verifiedDevice),
    );
    expect(allowed.sort()).toEqual([...GUEST_FORM_TEST_TITLES].sort());
    for (const title of titles.filter((t) => !allowed.includes(t))) {
      expect(outOfTextScopeReason('ios', title, STG, gates({}), verifiedDevice), title).toMatch(
        /outside the narrow guest display text scope/,
      );
    }
  });

  test('the full text gate or another project is not affected', () => {
    const full = gates({ textVerified: true });
    for (const title of declaredTitles()) {
      expect(outOfTextScopeReason('ios', title, STG, full, verifiedDevice), title).toBeUndefined();
    }
    for (const project of ['ios-inspect', 'ios-guarded-launch']) {
      expect(
        outOfTextScopeReason(project, 'anything', STG, gates({}), verifiedDevice),
      ).toBeUndefined();
    }
  });

  test('both specs declare the safe test first and put every other test behind the full gate', () => {
    for (const file of [
      'tests-ios/login.spec.ts',
      'tests-ios/forgot-password.spec.ts',
      'tests-ios/registration.spec.ts',
      'tests-ios/guest-tabs.spec.ts',
      'tests-ios/contact-us.spec.ts',
    ]) {
      const source = read(file);
      expect(source, file).toContain(
        'iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE })',
      );
      expect(source, file).toContain('const OTHER_TESTS_PROBLEM = iosStaticProblem();');
      const marker = 'test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM)';
      const start = source.indexOf('test.use({ language: lang });');
      const firstMarker = source.indexOf(marker, start);
      expect(start, file).toBeGreaterThan(0);
      expect(firstMarker, file).toBeGreaterThan(start);
      // From the language setup to the first full-gate wrapper there is exactly one test
      // declaration (the safe one), and no OTP chain is declared there.
      const before = source.slice(start, firstMarker);
      // Exactly the guest display tests this file declares (login: 1, forgot password: 2).
      const declared = source.match(/GUEST_FORM_TEST_TITLES\[\d+\]/g) ?? [];
      expect(declared.length, file).toBeGreaterThanOrEqual(1);
      // Every other declaration of a narrow-gate title is the account-gated Dealer login and logout test:
      // it is declared after the first full-gate wrapper and sits directly under the login-problem skip,
      // so it can run only when the policy, the account variables and the approval switches all allow it.
      const safeBefore =
        before.match(/\btest(?:\.fixme|\.skip)?\(\s*GUEST_FORM_TEST_TITLES\[\d+\]/g) ?? [];
      const accountGated = declared.length - safeBefore.length;
      expect(accountGated, file).toBe(file === 'tests-ios/login.spec.ts' ? 1 : 0);
      if (accountGated) {
        const gatedAt = source.search(/test\(\s*GUEST_FORM_TEST_TITLES\[10\]/);
        expect(gatedAt, file).toBeGreaterThan(firstMarker);
        expect(source.slice(Math.max(0, gatedAt - 400), gatedAt), file).toContain(
          'test.skip(Boolean(LOGIN_PROBLEM), LOGIN_PROBLEM);',
        );
      }
      expect(before.match(/\btest(?:\.fixme)?\(\s*['`]/g) ?? [], file).toHaveLength(0);
      expect(before.match(/\(\w+ \? test\.fixme : test\)\(/g) ?? [], file).toHaveLength(0);
      expect(before, file).not.toContain('declareOtpChain(');
      // Every chain call site sits after a full-gate wrapper that follows the safe test.
      for (const call of source.matchAll(/declareOtpChain\(/g)) {
        const at = call.index ?? 0;
        if (source.slice(Math.max(0, at - 12), at).includes('function ')) continue;
        expect(source.lastIndexOf(marker, at), file).toBeGreaterThan(
          source.lastIndexOf('GUEST_FORM_TEST_TITLES[', at),
        );
      }
    }
  });

  test('the functional project also guards every test before any hook (auto fixture)', () => {
    const fixture = read('src/fixtures/ios.fixture.ts');
    expect(fixture).toMatch(
      /textScopeGuard:\s*\[[\s\S]*outOfTextScopeReason\([\s\S]*\{ auto: true \}/,
    );
    expect(fixture).toContain(
      "textScope: workerInfo.project.name === 'ios' ? GUEST_FORM_TEXT_SCOPE : undefined",
    );
  });
});

test.describe('iOS selectors of the two guest display tests (selfcheck)', () => {
  /** A driver that answers $$ from a table and records every selector it is asked for. */
  function recordingDriver(answer: (selector: string) => number) {
    const asked: string[] = [];
    const element = () => ({
      isDisplayed: () => Promise.resolve(true),
      click: () => Promise.resolve(),
    });
    const driver = {
      $: () => {
        throw new Error('a single-match $() must not be used by these flows');
      },
      $$: (selector: string) => {
        asked.push(selector);
        return {
          getElements: () => Promise.resolve(Array.from({ length: answer(selector) }, element)),
        };
      },
      pause: () => Promise.resolve(),
    } as unknown as IosDriver;
    return { asked, driver };
  }
  class FastLogin extends IosLoginScreen {
    protected override onlyTimeout = 20;
  }

  test('none is positional or ambiguous: a type plus an exact label, or the only field of a type', async () => {
    const { asked, driver } = recordingDriver(() => 1);
    const login = new IosLoginScreen(driver);
    const forgot = new IosForgotPasswordScreen(driver);
    const en = iosAppText('en');
    await login.openLoginForm(en.guestPrompt, en.entryChoiceLogin);
    await login.waitForForm();
    await login.onlyForgotPasswordLink(en.forgotPassword);
    await login.openForgotPassword(en.forgotPassword);
    await forgot.onlyHeading(en.resetPasswordHeading);
    await forgot.onlyPhoneInput();
    expect(asked.length).toBeGreaterThanOrEqual(8);
    for (const selector of asked) {
      expect(selector, selector).not.toMatch(/\[\d+\]|parent::|\bindex\b|xpath|NavigationBar/i);
      const exactLabel =
        /^-ios predicate string:type == "XCUIElementType(Button|StaticText)" AND label == ".+"$/;
      const onlyOfType = /^-ios class chain:\*\*\/XCUIElementType(TextField|SecureTextField)$/;
      expect(exactLabel.test(selector) || onlyOfType.test(selector), selector).toBe(true);
    }
  });

  test('the welcome-sheet "Log In" is the Button, not the text that shares its label', async () => {
    // Any-type label match = 2 elements (the Button and its text); the Button alone = 1.
    const en = iosAppText('en');
    const { asked, driver } = recordingDriver((selector) =>
      selector.includes('type == "XCUIElementTypeButton"') ? 1 : 2,
    );
    await new IosLoginScreen(driver).openLoginForm(en.guestPrompt, en.entryChoiceLogin);
    expect(asked.at(-1)).toBe(
      `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(en.entryChoiceLogin)}`,
    );
    expect(asked.some((s) => s.includes('OR value =='))).toBe(false);
  });

  test('more than one match, or none, fails; it never picks the first', async () => {
    const two = new IosLoginScreen(recordingDriver(() => 2).driver);
    await expect(two.onlyPhoneInput()).rejects.toThrow(
      /Login: phone field \(the only TextField\): expected exactly 1 matching element, found 2/,
    );
    await expect(
      two.openLoginForm(iosAppText('en').guestPrompt, iosAppText('en').entryChoiceLogin),
    ).rejects.toThrow(/expected exactly 1 matching element, found 2/);
    const none = new FastLogin(recordingDriver(() => 0).driver);
    await expect(none.onlyPasswordInput()).rejects.toThrow(/found 0/);
    await expect(
      new IosForgotPasswordScreen(recordingDriver(() => 2).driver).onlyHeading('x'),
    ).rejects.toThrow(/found 2/);
  });
});

test.describe('iOS failure evidence has no screenshots (selfcheck)', () => {
  const attachments: { name: string; contentType: string }[] = [];
  const failed = (extra: object = {}) =>
    ({
      status: 'failed',
      expectedStatus: 'passed',
      title: 'Forgot Password opens from Login with the phone field',
      project: { name: 'ios' },
      errors: [{ message: '\u001b[31mexpected true\u001b[0m' }],
      attach: (name: string, options: { contentType?: string }) => {
        attachments.push({ name, contentType: options.contentType ?? '' });
        return Promise.resolve();
      },
      ...extra,
    }) as unknown as Parameters<typeof attachFailureEvidence>[1];
  // Any screenshot call on this driver throws.
  const driver = (xml: string | Error) =>
    new Proxy(
      { getPageSource: () => (xml instanceof Error ? Promise.reject(xml) : Promise.resolve(xml)) },
      {
        get(target, key) {
          if (key in target) return target[key as keyof typeof target];
          throw new Error(`failure evidence must not call driver.${String(key)}`);
        },
      },
    ) as unknown as Parameters<typeof attachFailureEvidence>[0];

  test('a failing test attaches only details and the element list', async () => {
    attachments.length = 0;
    const xml =
      '<AppiumAUT><XCUIElementTypeButton type="XCUIElementTypeButton" label="Home" name="Home" visible="true" x="0" y="0" width="10" height="10"/></AppiumAUT>';
    await attachFailureEvidence(driver(xml), failed());
    expect(attachments.map((a) => a.name)).toEqual([
      'failure-details.json',
      'visible-elements.json',
    ]);
    expect(attachments.every((a) => a.contentType === 'application/json')).toBe(true);
  });

  test('details carry the test name and a plain error; a dead session does not hide the failure', async () => {
    const bodies: string[] = [];
    const info = failed({
      attach: (_name: string, o: { body: string }) => {
        bodies.push(o.body);
        return Promise.resolve();
      },
    });
    await attachFailureEvidence(driver(new Error('session dead')), info);
    expect(bodies).toHaveLength(1);
    const details = JSON.parse(bodies[0]) as { test: string; errors: string[] };
    expect(details.test).toBe('Forgot Password opens from Login with the phone field');
    expect(details.errors).toEqual(['expected true']);
  });

  test('a passing test attaches nothing', async () => {
    attachments.length = 0;
    await attachFailureEvidence(driver('<x/>'), failed({ status: 'passed' }));
    expect(attachments).toEqual([]);
  });

  test('no iOS functional or inspection code captures or saves a screenshot', () => {
    const files = [
      'tests-ios/ios-test-helpers.ts',
      'tests-ios/login.spec.ts',
      'tests-ios/forgot-password.spec.ts',
      'tests-ios/guest-screens.inspect.ts',
      'src/fixtures/ios.fixture.ts',
      'src/mobile/ios/ios.session.ts',
      ...fs
        .readdirSync(path.join(ROOT, 'src/mobile/ios/screens'))
        .map((f) => `src/mobile/ios/screens/${f}`),
    ];
    for (const file of files) {
      expect(read(file), file).not.toMatch(/takeScreenshot|saveScreenshot|screenshot\s*\(|\.png/i);
    }
    // Playwright itself is configured without screenshots, video or trace.
    expect(read('playwright.ios.config.ts')).toMatch(/screenshot:\s*'off'/);
    expect(read('playwright.ios.config.ts')).toMatch(/video:\s*'off'/);
  });
});
