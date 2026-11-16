import type { InspectionAndroidDriver } from '@mobile/inspection-android/inspection-android.session';

/** Whether `text` appears as a label's own value in the raw page source, tolerating a trailing
 * suffix inside the quotes rather than requiring an exact `text="${text}"` match: confirmed live
 * that several labels in this app (e.g. "Front Bumper", on the Essentials & Body tab) carry a
 * trailing tab character in their own raw attribute (`text="Front Bumper&#9;"`, presumably a
 * layout artifact, not meaningful content) - an exact match silently never finds them, making
 * scrollToText() exhaust every swipe and throw even though the label is plainly on screen. */
function textAttributePresent(xml: string, text: string): boolean {
  return new RegExp(
    `text="${text.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"`,
  ).test(xml);
}

/**
 * Parent of Inspection Android screen objects: element lookups and actions only, no assertions
 * (the spec asserts).
 *
 * This app is built with Jetpack Compose and exposes almost no `resource-id` or `content-desc`
 * values (confirmed live, 2026-11-12) - unlike the Mazad consumer app's MobileScreen, which can
 * rely on resource IDs. Locators here are text-based (UiAutomator2's UiSelector DSL, not XPath:
 * confirmed faster and more reliable against this app's deep, lazily-rendered scroll views), and
 * every coordinate-based tap re-reads the element's current bounds immediately before tapping -
 * caching bounds across even one extra `pause()` has been confirmed live to go stale, since this
 * screen's Compose LazyColumn re-measures after almost any interaction (keyboard open/close,
 * sibling field changing height, etc).
 */
export abstract class InspectionAndroidScreen {
  constructor(protected readonly driver: InspectionAndroidDriver) {}

  /** Element whose visible text is exactly `text`. */
  byText(text: string) {
    return this.driver.$(`android=new UiSelector().text(${JSON.stringify(text)})`);
  }

  /** Element whose visible text contains `text`. */
  byTextContains(text: string) {
    return this.driver.$(`android=new UiSelector().textContains(${JSON.stringify(text)})`);
  }

  /** Element whose visible text is one of the supplied localized labels. */
  byTextAny(...texts: string[]) {
    const alternatives = texts.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return this.driver.$(
      `android=new UiSelector().textMatches(${JSON.stringify(`^(?:${alternatives})$`)})`,
    );
  }

  /**
   * Scrolls the screen's own scrollable container until an element with this exact text is on
   * screen.
   *
   * Does NOT use UiAutomator2's native `UiScrollable.scrollIntoView`/`scrollToBeginning`:
   * confirmed live that this app's LazyColumn has enough fling momentum that both that native
   * helper and a naive manual swipe-and-check loop can skip over an entire field (and even whole
   * sections) between one check and the next, with no way to detect the miss - the field is
   * never "not found", it is simply never looked at. Small, fixed-distance swipes with a
   * page-source check after every single one avoid this: each swipe moves the list by less than
   * one field's height, so nothing can be skipped.
   */
  async scrollToText(text: string, maxSwipes = 25): Promise<void> {
    if (await this.isTextPresent(text)) return;
    if (await this.swipeUntilFound(text, 'down', maxSwipes)) return;
    // A small forward swipe cannot overshoot, but it also cannot find something *above* the
    // current position - reset to the top (one large jump is safe here: we are not looking for
    // anything along the way, just establishing a known start point) and search forward again.
    await this.jumpToTop();
    if (await this.isTextPresent(text)) return;
    if (await this.swipeUntilFound(text, 'down', maxSwipes)) return;
    throw new Error(`Could not scroll to "${text}" after ${maxSwipes} small swipes from the top.`);
  }

  private async isTextPresent(text: string): Promise<boolean> {
    const xml = await this.driver.getPageSource();
    return textAttributePresent(xml, text);
  }

  /** One small swipe in `direction` ("down" reveals content below, i.e. scrolls the list down).
   * Protected, not private: subclasses also use this directly to reposition an already-found
   * element (e.g. away from a sticky footer's zone near the bottom of the screen), not just to
   * search for new text. */
  protected async smallSwipe(direction: 'down' | 'up'): Promise<void> {
    const { height } = await this.driver.getWindowSize();
    const fromY = direction === 'down' ? Math.round(height * 0.75) : Math.round(height * 0.3);
    const toY = direction === 'down' ? Math.round(height * 0.55) : Math.round(height * 0.5);
    await this.driver
      .action('pointer')
      .move({ x: 540, y: fromY })
      .down()
      .pause(50)
      .move({ duration: 200, x: 540, y: toY })
      .up()
      .perform();
    await this.driver.pause(250);
  }

  private async swipeUntilFound(
    text: string,
    direction: 'down' | 'up',
    maxSwipes: number,
  ): Promise<boolean> {
    let previous = await this.driver.getPageSource();
    for (let i = 0; i < maxSwipes; i++) {
      await this.smallSwipe(direction);
      const current = await this.driver.getPageSource();
      if (textAttributePresent(current, text)) return true;
      if (current === previous) return false; // Reached the end of the list.
      previous = current;
    }
    return false;
  }

  /** One large, deliberate jump to the very top - safe because nothing is being looked for along
   * the way, unlike a search swipe, which must never move further than one field at a time. */
  private async jumpToTop(): Promise<void> {
    const { height } = await this.driver.getWindowSize();
    for (let i = 0; i < 8; i++) {
      const before = await this.driver.getPageSource();
      await this.driver
        .action('pointer')
        .move({ x: 540, y: Math.round(height * 0.3) })
        .down()
        .pause(50)
        .move({ duration: 150, x: 540, y: Math.round(height * 0.85) })
        .up()
        .perform();
      await this.driver.pause(250);
      if ((await this.driver.getPageSource()) === before) return; // Already at the top.
    }
  }

  /**
   * Waits until the screen's accessibility tree stops changing between two reads, up to
   * `timeout`. Use this before a scroll/tap right after another UI-changing action (closing a
   * Select sheet, dismissing the keyboard): confirmed live that acting again immediately, while
   * the previous change is still animating/recomposing, intermittently misses the target element
   * or reads a stale value - not a fixed sleep, since it returns as soon as the tree is actually
   * stable, and gives up (rather than hanging) if it never settles within the timeout.
   */
  async waitForUiIdle(timeout = 2_000, pollInterval = 150): Promise<void> {
    const deadline = Date.now() + timeout;
    let previous = await this.driver.getPageSource();
    while (Date.now() < deadline) {
      await this.driver.pause(pollInterval);
      const current = await this.driver.getPageSource();
      if (current === previous) return;
      previous = current;
    }
  }

  /**
   * Taps an element by re-reading its bounds at the moment of the call (never a coordinate
   * computed earlier). Use this instead of `element.click()` for controls this app's Compose
   * click handler does not reliably register through the accessibility click action (confirmed
   * live for several list-item and button taps; a plain gentle W3C pointer tap registers where
   * the accessibility `click` action silently does nothing).
   */
  async tapElement(element: {
    getLocation(): Promise<{ x: number; y: number }>;
    getSize(): Promise<{ width: number; height: number }>;
  }): Promise<void> {
    const location = await element.getLocation();
    const size = await element.getSize();
    const x = Math.round(location.x + size.width / 2);
    const y = Math.round(location.y + size.height / 2);
    await this.driver.action('pointer').move({ x, y }).down().pause(80).up().perform();
  }

  async tapText(text: string): Promise<void> {
    await this.tapElement(this.byText(text));
  }

  /** Hides the keyboard if one is showing; does nothing otherwise. */
  async hideKeyboardIfShown(): Promise<void> {
    if (await this.driver.isKeyboardShown()) {
      await this.driver.hideKeyboard().catch(() => undefined);
    }
  }

  /**
   * Types `value` into an already-focusable EditText, replacing whatever it currently shows
   * (e.g. a locally-saved draft from an earlier, uncompleted attempt), and verifies the result,
   * retrying if needed.
   *
   * This deliberately does not use WebdriverIO's `setValue`/`clearValue`/`addValue`: confirmed
   * live on this app's Compose text fields that `setValue` only works reliably the *first* time a
   * field is touched - calling it again on a field that already has text (even after a prior
   * `clearValue()`) silently does nothing, leaving the field unchanged or empty. Key-by-key input
   * (`driver.keys`, backed by real Android key events, a different code path from the text-replace
   * endpoint `setValue` uses) works reliably instead. Each attempt reads the field's actual
   * current text and backspaces exactly that many characters before typing, so it is
   * self-correcting regardless of what was left in the field.
   */
  async typeReliably(
    element: {
      click(): Promise<void>;
      getText(): Promise<string>;
    },
    value: string,
    maxAttempts = 3,
  ): Promise<void> {
    await element.click();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const current = await element.getText();
      if (current === value) return;
      for (let i = 0; i < current.length; i++) await this.driver.pressKeyCode(67); // KEYCODE_DEL
      // One key per driver.keys() call, not a single batched array: confirmed live that batching
      // the whole string in one call reliably drops the last 1-2 characters (the IME does not
      // keep up with the whole batch), even on a field touched for the first time.
      for (const char of value) {
        await this.driver.keys([char]);
      }
      await this.driver.pause(300);
      if ((await element.getText()) === value) return;
    }
    const actual = await element.getText();
    throw new Error(
      `Could not type "${value}" (field shows "${actual}" after ${maxAttempts} attempts).`,
    );
  }

  /**
   * Same mechanism as typeReliably(), for a value that must never appear in a thrown error, log
   * line, or test report (a mobile number or password/PIN) - returns whether it succeeded instead
   * of throwing with the value embedded in the message.
   *
   * `isMatch` defaults to an exact-text comparison, but a masked field (confirmed live: a password
   * EditText's own getText() returns bullet characters, e.g. "••••", never the real typed value)
   * needs a different success check - e.g. comparing lengths - passed in by the caller, who knows
   * which kind of field it is.
   */
  async typeSecretReliably(
    element: {
      click(): Promise<void>;
      getText(): Promise<string>;
      clearValue(): Promise<void>;
    },
    value: string,
    options?: { maxAttempts?: number; isMatch?: (current: string, value: string) => boolean },
  ): Promise<boolean> {
    const isMatch = options?.isMatch ?? ((current, v) => current === v);
    const maxAttempts = options?.maxAttempts ?? 3;
    await element.click();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const current = await element.getText();
      if (isMatch(current, value)) return true;
      // Confirmed live 2026-11-15 on a masked (password/PIN) EditText specifically: synthetic
      // KEYCODE_DEL via driver.pressKeyCode() does not reliably clear this field (unlike every
      // other, unmasked field typeReliably() handles the same way), silently leaving prior
      // characters in place so each retry appends instead of replacing - clearValue() issues a
      // dedicated clear command instead of synthetic key events and clears it reliably.
      await element.clearValue();
      for (const char of value) {
        await this.driver.keys([char]);
      }
      // Polled, not a single fixed-delay check: confirmed live 2026-11-15 the login screen's own
      // fields can report the right length/value slightly after a flat 300ms pause (Compose
      // recomposition lag), causing a real, successful type to read as a false failure on every
      // attempt even though the field is correct moments later.
      const deadline = Date.now() + 1_500;
      let lastSeen = '';
      do {
        lastSeen = await element.getText();
        if (isMatch(lastSeen, value)) return true;
        await this.driver.pause(150);
      } while (Date.now() < deadline);
    }
    return false;
  }
}
