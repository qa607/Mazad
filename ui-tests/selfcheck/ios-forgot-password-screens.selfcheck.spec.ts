import { expect, test } from '../support/fixtures';
import { IosForgotPasswordScreen } from '../../src/mobile/ios/screens/forgot-password.screen';
import { IosNewPasswordScreen } from '../../src/mobile/ios/screens/new-password.screen';
import { IosOtpScreen } from '../../src/mobile/ios/screens/otp.screen';

/**
 * Offline checks of the read-only Forgot Password screen methods, against a fake driver (no device):
 * the layout probes count fields without choosing among them, and the phone helpers type and clear
 * but can never tap anything (the Send button is only ever handed out read-only).
 */

interface FakeOptions {
  /** How many elements a lookup finds, by a fragment of its selector (default 1). */
  counts?: Record<string, number>;
  /** What every element reports as its value. */
  value?: string;
}

function fakeDriver(options: FakeOptions = {}) {
  const events: string[] = [];
  const element = (selector: string) => ({
    click: () => Promise.resolve(void events.push(`click ${selector}`)),
    setValue: () => Promise.resolve(void events.push('type')),
    clearValue: () => Promise.resolve(void events.push('clear')),
    getValue: () => Promise.resolve(options.value ?? ''),
    isDisplayed: () => Promise.resolve(true),
    isEnabled: () => Promise.resolve(true),
    isExisting: () => Promise.resolve(true),
    getLocation: () => Promise.resolve({ x: 0, y: 0 }),
    getSize: () => Promise.resolve({ width: 1, height: 1 }),
    getAttribute: () => Promise.resolve(null),
  });
  const countFor = (selector: string) => {
    for (const [fragment, count] of Object.entries(options.counts ?? {})) {
      if (selector.includes(fragment)) return count;
    }
    return 1;
  };
  const driver = {
    $$: (selector: string) => ({
      getElements: () =>
        Promise.resolve(Array.from({ length: countFor(selector) }, () => element(selector))),
    }),
    $: (selector: string) => element(selector),
    isKeyboardShown: () => Promise.resolve(false),
    hideKeyboard: () => Promise.resolve(),
    pause: () => Promise.resolve(),
  };
  return { driver: driver as never, events };
}

const TEXT_FIELD = 'XCUIElementTypeTextField';
const SECURE_FIELD = 'XCUIElementTypeSecureTextField';

test.describe('iOS Forgot Password screen methods (selfcheck, fake driver)', () => {
  test('the OTP layout is one field or one per digit; any other count fails and nothing is typed', async () => {
    const layout = async (count: number, length = 4) => {
      const { driver, events } = fakeDriver({ counts: { [TEXT_FIELD]: count } });
      const result = await new IosOtpScreen(driver).inputLayout(length).catch((e: Error) => e);
      expect(events, 'a layout probe types and taps nothing').toEqual([]);
      return result;
    };
    expect(await layout(1)).toBe('single');
    expect(await layout(4)).toBe('per-digit');
    expect(await layout(6, 6)).toBe('per-digit');
    for (const wrong of [0, 2, 3, 5]) {
      const error = await layout(wrong);
      expect(error, `${wrong} fields`).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(`has ${wrong} text field(s)`);
    }
  });

  test('the new-password field count is read without typing', async () => {
    for (const count of [0, 1, 2]) {
      const { driver, events } = fakeDriver({ counts: { [SECURE_FIELD]: count } });
      expect(await new IosNewPasswordScreen(driver).passwordFieldCount()).toBe(count);
      expect(events).toEqual([]);
    }
  });

  test('the phone helpers type, read and clear, and never tap', async () => {
    const { driver, events } = fakeDriver({ value: 'shown' });
    const screen = new IosForgotPasswordScreen(driver);
    await screen.enterPhone('synthetic');
    expect(await screen.phoneValue()).toBe('shown');
    await screen.clearPhone();
    expect(events).toEqual(['type', 'clear']);
    expect(events.some((e) => e.startsWith('click'))).toBe(false);
  });
});
