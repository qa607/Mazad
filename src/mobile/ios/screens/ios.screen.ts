import type { IosDriver } from '@mobile/ios/ios.session';

/**
 * Parent of iOS screen objects: element lookups and actions only, no assertions.
 *
 * Selector status: the Mazad iOS app has not been inspected yet (it may not be launched until
 * the staging and network-safety checks pass). Until its accessibility tree is recorded,
 * screens locate elements by element type and by the visible text the caller passes in
 * (backend-driven text from src/locales, app text from test-data/ios-app.data.ts). Replace
 * these with accessibility identifiers once they are read from the app's page source.
 */
/**
 * A view of an element that can be inspected but never tapped or typed into. The buttons that
 * submit an account action (Log In, Send, Verify, Save) are handed out ONLY as this, so no spec
 * or helper can tap them: the one tap lives in the screen's own guarded method.
 */
export interface ReadOnlyElement {
  isDisplayed(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isExisting(): Promise<boolean>;
  getLocation(): Promise<{ x: number; y: number }>;
  getSize(): Promise<{ width: number; height: number }>;
  getAttribute(name: string): Promise<string | null>;
}

export abstract class IosScreen {
  constructor(protected readonly driver: IosDriver) {}

  /** Wraps an element so that it can only be inspected (see ReadOnlyElement). */
  protected readOnly(element: WebdriverIO.Element): ReadOnlyElement {
    return Object.freeze({
      isDisplayed: () => element.isDisplayed(),
      isEnabled: () => element.isEnabled(),
      isExisting: () => element.isExisting(),
      getLocation: () => element.getLocation(),
      getSize: () => element.getSize(),
      getAttribute: (name: string) => element.getAttribute(name),
    });
  }

  /** How long only() waits for a first match to appear (ms). */
  protected onlyTimeout = 15_000;

  /**
   * The recorded accessibility identifier when there is one (src/mobile/ios/ios-selectors.ts),
   * otherwise the provisional fallback locator.
   */
  protected idOr(id: string, fallback: () => ReturnType<IosDriver['$']>) {
    return id ? this.byAccessibilityId(id) : fallback();
  }

  /**
   * A control that may be located ONLY by a recorded accessibility identifier: no positional,
   * type-index or text fallback. While the id is not recorded (see docs/ios-accessibility-ids-request.md)
   * it fails with a clear message instead of guessing, so an unverified control is never used.
   */
  protected requireId(id: string, control: string) {
    if (!id) {
      throw new Error(
        `The accessibility identifier of "${control}" is not recorded yet (src/mobile/ios/ios-selectors.ts). ` +
          'The control is not verified and is not located by position or text; see docs/ios-accessibility-ids-request.md.',
      );
    }
    return this.byAccessibilityId(id);
  }

  /** Element by accessibility identifier. */
  protected byAccessibilityId(id: string) {
    return this.driver.$(`~${id}`);
  }

  /** Class chain matching every element of an XCUIElementType (no index: order is never used). */
  protected typeSelector(type: string) {
    return `-ios class chain:**/XCUIElementType${type}`;
  }

  /**
   * The first match of an XCUIElementType, WITHOUT an index. Only for screens whose uniqueness is
   * checked first (see only()); otherwise use only(), so a second match fails instead of being
   * silently skipped over.
   */
  protected byType(type: string) {
    return this.driver.$(this.typeSelector(type));
  }

  /** All elements of an XCUIElementType. */
  protected allOfType(type: string) {
    return this.driver.$$(this.typeSelector(type));
  }

  /** Predicate matching a Button with exactly this label. */
  protected buttonSelector(label: string) {
    return `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(label)}`;
  }

  /**
   * Predicate matching a Button that has NO accessible name (no id, no label). Used only as the
   * interim locator of a screen's primary button until the iOS team adds an id: the 2026-11-09
   * inspection found exactly one such Button on the Login and on the Forgot Password screen, in
   * both languages. Always used through only(), so a second one fails instead of being chosen.
   */
  protected unlabeledButtonSelector() {
    return '-ios predicate string:type == "XCUIElementTypeButton" AND (label == nil OR label == "") AND (name == nil OR name == "")';
  }

  /** Predicate matching a StaticText with exactly this label. */
  protected staticTextSelector(label: string) {
    return `-ios predicate string:type == "XCUIElementTypeStaticText" AND label == ${JSON.stringify(label)}`;
  }

  /**
   * The ONE element matching `selector`. Waits for a match to appear, then fails unless there is
   * exactly one: it never picks among several by order, position or `.first()`. A selector whose
   * uniqueness was not established therefore fails loudly instead of guessing.
   */
  protected async only(selector: string, what: string, timeout = this.onlyTimeout) {
    const end = Date.now() + timeout;
    let found = await this.driver.$$(selector).getElements();
    while (found.length === 0 && Date.now() < end) {
      await this.driver.pause(250);
      found = await this.driver.$$(selector).getElements();
    }
    if (found.length !== 1) {
      throw new Error(
        `${what}: expected exactly 1 matching element, found ${found.length}. Not choosing one by order or position.`,
      );
    }
    return found[0];
  }

  /** The element with this recorded accessibility id, or else the ONE element matching `selector`. */
  protected async idOrOnly(id: string, selector: string, what: string) {
    return id ? this.driver.$(`~${id}`).getElement() : this.only(selector, what);
  }

  /** A button whose label is exactly `label` (first match: presence checks; click through only()). */
  protected button(label: string) {
    return this.driver.$(this.buttonSelector(label));
  }

  /** Any element whose label or value is exactly `text` (messages, headings, links). */
  text(text: string) {
    const t = JSON.stringify(text);
    return this.driver.$(`-ios predicate string:label == ${t} OR value == ${t}`);
  }

  /** Hides the software keyboard if it is shown. */
  async hideKeyboard(): Promise<void> {
    if (await this.driver.isKeyboardShown().catch(() => false)) {
      await this.driver.hideKeyboard().catch(() => undefined);
    }
  }
}
