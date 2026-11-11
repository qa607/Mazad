import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * The guest view of the app's own tabs (My Bids, My Actions). NAVIGATION AND DISPLAY ONLY: it taps a
 * tab-bar button and reads what the screen shows; the call-to-action buttons (login or create an
 * account) are returned read-only, so nothing can be tapped, typed or submitted from here.
 * Observed on the device (guest inspection 2026-11-09, build 8.3 (1491), English and Arabic).
 *
 * Every control is the ONE element with its exact label and type (checked each time, never by
 * position or order).
 */
/**
 * The two header icons of the My Bids and My Actions tabs. Language-independent accessible names, observed
 * on the device 2026-11-09 (guest inspection, build 8.3 (1491)); each is the ONE Button with that label.
 */
export const OBSERVED_HEADER_ICONS = {
  notifications: 'hasNotificationsIcon',
  favorites: 'favoriteHeaderButton',
} as const;

export class IosGuestTabsScreen extends IosScreen {
  /** Taps the tab-bar button with this exact label (navigation). */
  async openTab(label: string): Promise<void> {
    const tab = await this.only(this.buttonSelector(label), `Tab bar: the "${label}" tab`);
    await tab.click();
  }

  /** Taps a header icon of the current tab (navigation to Notifications or Favorites). */
  async openHeaderIcon(icon: keyof typeof OBSERVED_HEADER_ICONS): Promise<void> {
    const name = OBSERVED_HEADER_ICONS[icon];
    const button = await this.only(this.buttonSelector(name), `Header: the "${name}" icon`);
    await button.click();
  }

  /** A text of the screen: the ONE StaticText with this exact label. */
  async onlyText(label: string) {
    return this.only(this.staticTextSelector(label), `Guest tab: the "${label}" text`);
  }

  /** A button of the screen for INSPECTION only: the ONE Button with this exact label, never tappable here. */
  async onlyButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.only(this.buttonSelector(label), `Guest tab: the "${label}" button`),
    );
  }
}
