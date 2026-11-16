import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * Rows of More that must never be tapped from automation, in both languages: "Change Environment"
 * changes the app's backend, and "Rate us" leaves the app for the App Store.
 */
export const MORE_ROWS_NEVER_TAPPED: readonly string[] = [
  'Change Environment',
  'تغيير البيئة',
  'Rate us in the App Store',
  'قيّم التطبيق في المتجر',
];

/** The six More icons that have no accessible name (ids requested from the iOS team). */
export type MoreIcon = keyof typeof IDS.more;

/**
 * Mazad iOS: the More tab (guest). NAVIGATION AND DISPLAY ONLY. Observed on the device 2026-11-11
 * (iPhone 11 Pro Max, build 8.3 (1491), English and Arabic):
 * - rows (About Us, Help Center, Terms & Conditions, Privacy Policy, Rate us, Change Environment)
 *   and the language options are Buttons with exact labels; headings and the version are StaticTexts;
 * - About Us and Terms open in-app pages (title, readable content, a "Back" Button); Privacy Policy
 *   opens an in-app browser (SFSafariViewController) on the staging website; Rate us leaves the app;
 * - the Favorites/Notifications header icons and the four social icons are Buttons with no accessible
 *   name or label, so they are located ONLY by recorded accessibility ids (none yet) and only read.
 *
 * Every control is the ONE element of its type with its exact label (never by position or order).
 */
export class IosMoreScreen extends IosScreen {
  /** A text of the screen: the ONE StaticText with this exact label. */
  async onlyText(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(await this.only(this.staticTextSelector(label), `More: "${label}" text`));
  }

  /** A row or button for INSPECTION only: the ONE Button with this exact label. */
  async onlyButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(await this.only(this.buttonSelector(label), `More: "${label}" button`));
  }

  /**
   * True when the screen shows a non-empty StaticText other than `excluded` (a page's title and
   * Back). Stops at the first one: long pages (Terms) have hundreds of texts.
   */
  async hasTextBesides(excluded: readonly string[]): Promise<boolean> {
    for (const element of await this.allOfType('StaticText').getElements()) {
      const label = (await element.getAttribute('label')) ?? '';
      if (label && !excluded.includes(label)) return true;
    }
    return false;
  }

  /**
   * Opens a row that stays inside the app (About Us, Help Center, Terms, Privacy Policy). Refuses
   * the rows in MORE_ROWS_NEVER_TAPPED. Navigation.
   */
  async openRow(label: string): Promise<void> {
    if (MORE_ROWS_NEVER_TAPPED.includes(label)) {
      throw new Error(`More: "${label}" must never be tapped by automation.`);
    }
    const row = await this.only(this.buttonSelector(label), `More: the "${label}" row`);
    await row.click();
  }

  /** The Back Button of an in-app page (About Us, Terms). Navigation back to More. */
  async goBack(backLabel: string): Promise<void> {
    const back = await this.only(this.buttonSelector(backLabel), `Page: the "${backLabel}" button`);
    await back.click();
  }

  /** Scrolls More down, to bring the version line into view (a swipe; nothing is tapped). */
  async scrollDown(): Promise<void> {
    await this.driver.execute('mobile: swipe', { direction: 'up' });
  }

  /** True when the tab-bar Button with this label reports itself selected (value "1"). */
  async isTabSelected(label: string): Promise<boolean> {
    const tab = await this.only(this.buttonSelector(label), `Tab bar: the "${label}" tab`);
    return (await tab.getAttribute('value')) === '1';
  }

  /**
   * The address shown by the in-app browser (its ONE Button with the identifier "URL"; the
   * identifier is the same whatever the device language, unlike its visible label).
   */
  async inAppBrowserAddress(): Promise<string> {
    const address = await this.only(
      '-ios predicate string:type == "XCUIElementTypeButton" AND name == "URL"',
      'In-app browser: the address',
    );
    return (await address.getAttribute('value')) ?? '';
  }

  /** An unlabeled icon, read-only, by its recorded accessibility id only (see ios-selectors.ts). */
  async icon(icon: MoreIcon): Promise<ReadOnlyElement> {
    return this.readOnly(await this.requireId(IDS.more[icon], `More: ${icon}`).getElement());
  }
}
