import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — the "More" tab once signed in: account name, phone and type, and
 * Log out. Confirmed on staging (2026-11-04): a successful login or password reset lands here
 * (not Home), and "Log out" sits low enough that it overlaps the fixed bottom navigation bar —
 * a single UiScrollable "scrollIntoView" brings it into the scrollable container's viewport but
 * not necessarily clear of that overlay, so a deliberate swipe runs first. Unlike the website's
 * own dialog wording, logging out here asks "Are you sure you want to log out?" with its own
 * confirm/cancel buttons.
 */
export class MazadAccountScreen extends MobileScreen {
  /** The signed-in account's display name, e.g. "Dealer Motory Test" or an individual's name. */
  name(displayName: string) {
    return this.byText(displayName);
  }

  /** "Log out" row, once scrolled clear of the bottom navigation bar (see scrollUp). */
  logoutItem(label: string) {
    return this.byText(label);
  }

  /** The logout confirmation dialog's own buttons, found by their text. */
  confirmButton(label: string) {
    return this.byText(label);
  }

  /** Swipes the screen up so content that sits near the bottom clears the fixed nav bar. */
  private async scrollUp(): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    await this.driver.execute('mobile: swipeGesture', {
      left: Math.round(width * 0.1),
      top: Math.round(height * 0.3),
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.5),
      direction: 'up',
      percent: 0.75,
    });
  }

  /** Opens the confirmation dialog; does not confirm it (see confirmLogout/cancelLogout). */
  async openLogoutConfirmation(label: string): Promise<void> {
    await this.scrollUp();
    const item = this.logoutItem(label);
    await item.waitForDisplayed({ timeout: 10_000 });
    await item.click();
  }

  async confirmLogout(initialLabel: string, confirmLabel: string): Promise<void> {
    await this.openLogoutConfirmation(initialLabel);
    const confirm = this.confirmButton(confirmLabel);
    await confirm.waitForDisplayed({ timeout: 10_000 });
    await confirm.click();
  }

  async cancelLogout(initialLabel: string, cancelLabel: string): Promise<void> {
    await this.openLogoutConfirmation(initialLabel);
    const cancel = this.confirmButton(cancelLabel);
    await cancel.waitForDisplayed({ timeout: 10_000 });
    await cancel.click();
  }
}
