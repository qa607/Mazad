import { LOGOUT_BLOCKED } from '@utils/account-actions';
import { type IosElement, parseIosSource } from '@mobile/ios/page-source';
import { IosScreen } from '@mobile/ios/screens/ios.screen';

/**
 * Signed-in account: logout. Located by the VERIFIED exact visible labels (device inspection 2026-11-09,
 * build 8.3 (1491), English and Arabic): the "Log out" / "تسجيل الخروج" item sits at the bottom of the
 * More screen (found within at most 4 swipes up), and tapping it opens a bottom SHEET (not an alert) with
 * a confirmation Button of the same label and a "Back" / "عودة" Button. No accessibility ids exist for
 * them, so nothing here is located by position, index or a guessed label.
 *
 * Every step demands exactly ONE match and throws otherwise (zero or several): a missing item, an
 * ambiguous label or a missing sheet is a failure, never a guess. Signing out also needs the logout
 * approval switch (MAZAD_ALLOW_LOGOUT); without it nothing is swiped or tapped.
 */
const MAX_SWIPES = 4;

/** A labeled control: anything but a text, with a non-empty label or name. */
const controlLabel = (e: IosElement) =>
  e.type !== 'StaticText' && e.visible ? e.label || e.name : '';

export class IosAccountScreen extends IosScreen {
  /** The controls (never plain texts) that are visible right now and carry exactly this label. */
  private async visibleControls(label: string): Promise<IosElement[]> {
    return parseIosSource(await this.driver.getPageSource()).filter(
      (e) => controlLabel(e) === label,
    );
  }

  /**
   * Swipes up (at most 4 times) until a control with the exact label is visible, then taps the ONE
   * match. Throws when there is not exactly one. Returns the number of matches it saw (always 1).
   */
  async openLogoutConfirmation(label: string): Promise<number> {
    if (LOGOUT_BLOCKED) throw new Error(LOGOUT_BLOCKED);
    let matches: IosElement[] = [];
    for (let swipe = 0; swipe <= MAX_SWIPES; swipe++) {
      matches = await this.visibleControls(label);
      if (matches.length > 0 || swipe === MAX_SWIPES) break;
      await this.driver.execute('mobile: swipe', { direction: 'up' });
      await this.driver.pause(900);
    }
    if (matches.length !== 1) {
      throw new Error(
        `Logout: ${matches.length} control(s) carry the exact label "${label}" after at most ${MAX_SWIPES} swipes; expected exactly 1. Nothing was tapped.`,
      );
    }
    await this.driver
      .$(
        `-ios predicate string:type == "XCUIElementType${matches[0].type}" AND label == ${JSON.stringify(label)}`,
      )
      .click();
    return matches.length;
  }

  /** The number of VISIBLE Buttons with this exact label (the sheet's confirmation, or "Back"). */
  async visibleButtonCount(label: string): Promise<number> {
    const found = await this.driver
      .$$(
        `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(label)} AND visible == 1`,
      )
      .getElements();
    return found.length;
  }

  /** Taps the ONE visible confirmation Button with this exact label; throws unless there is exactly one. */
  async confirmLogout(label: string): Promise<void> {
    const found = await this.driver
      .$$(
        `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(label)} AND visible == 1`,
      )
      .getElements();
    if (found.length !== 1) {
      throw new Error(
        `Logout: ${found.length} visible confirmation button(s) carry the exact label "${label}"; expected exactly 1. Nothing was tapped.`,
      );
    }
    await found[0].click();
  }

  /**
   * The whole sign-out: item (exactly one match), the sheet's "Back" Button (exactly one, which proves
   * the confirmation sheet is open), then the confirmation (exactly one). Verifying the signed-out
   * state is the caller's assertion.
   */
  async logout(logoutLabel: string, backLabel: string): Promise<void> {
    await this.openLogoutConfirmation(logoutLabel);
    const back = await this.visibleButtonCount(backLabel);
    if (back !== 1) {
      throw new Error(
        `Logout: the confirmation sheet shows ${back} visible "${backLabel}" button(s); expected exactly 1. Nothing was confirmed.`,
      );
    }
    await this.confirmLogout(logoutLabel);
  }
}
