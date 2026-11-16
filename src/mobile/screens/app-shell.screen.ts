import type { Language } from '@typings';
import { MobileScreen } from '@mobile/screens/mobile.screen';

export type MainTab = 'home' | 'my_bids' | 'my_actions' | 'more';

/** Bottom navigation and top bar shared by the main screens. */
export class AppShellScreen extends MobileScreen {
  tab(tab: MainTab) {
    return this.byId(`item_menu_activity_main_bottom_navigation_${tab}`);
  }

  get notificationsButton() {
    return this.byId('image_view_home_page_notification_bar');
  }

  async waitUntilReady(timeout = 30_000): Promise<void> {
    await this.tab('home').waitForDisplayed({ timeout });
  }

  /**
   * Material bottom sheet's scrim. Staging can open an "Announcement" sheet over Home at launch
   * (seen 2026-11-11, 8.2.2-stage); it is server-driven, so it is not always there.
   */
  get bottomSheetScrim() {
    return this.byId('touch_outside');
  }

  /** Closes a launch announcement sheet if one is open; does nothing otherwise. */
  async dismissAnnouncement(): Promise<void> {
    if (await this.bottomSheetScrim.isExisting()) {
      await this.bottomSheetScrim.click();
      await this.bottomSheetScrim.waitForExist({ reverse: true, timeout: 10_000 });
    }
  }

  /**
   * Button of the app's update dialog. The app opens that dialog over every screen when an API
   * reply carries update_available (1 = optional, with "Later"; 2 = forced, no "Later") and fills
   * it from the version-update reply, so it shows empty when the backend sends no text.
   */
  get updateDialogButton() {
    return this.byId('text_view_update_button');
  }

  async isUpdateDialogShown(): Promise<boolean> {
    return this.updateDialogButton.isExisting();
  }

  /** "Close" of the "technical error" dialog the app shows when a request fails. */
  get errorDialogCloseButton() {
    return this.byId('textview_close_button');
  }

  /** Waits for the "technical error" dialog and closes it. */
  async closeErrorDialog(timeout = 20_000): Promise<void> {
    await this.errorDialogCloseButton.waitForDisplayed({ timeout });
    await this.errorDialogCloseButton.click();
    await this.errorDialogCloseButton.waitForExist({ reverse: true, timeout: 10_000 });
  }

  /**
   * After a launch: waits for Home or a sheet opened over it at launch (an announcement or
   * advertisement hides Home), closes the sheet by tapping outside it (nothing in it is chosen),
   * then waits for Home.
   */
  async waitUntilReadyClosingSheet(timeout = 30_000): Promise<void> {
    await this.driver.waitUntil(
      async () =>
        (await this.tab('home').isDisplayed()) || (await this.bottomSheetScrim.isExisting()),
      { timeout, timeoutMsg: `Neither Home nor a sheet over it showed within ${timeout} ms.` },
    );
    await this.dismissAnnouncement();
    await this.waitUntilReady(timeout);
  }

  async open(tab: MainTab): Promise<void> {
    await this.tab(tab).click();
  }

  /** Accessibility label of a bottom navigation tab. */
  async tabLabel(tab: MainTab): Promise<string> {
    return (await this.tab(tab).getAttribute('content-desc')) ?? '';
  }

  async isSelected(tab: MainTab): Promise<boolean> {
    return (await this.tab(tab).getAttribute('selected')) === 'true';
  }

  /** Switches the app language from More → Language, then returns to Home. */
  async setLanguage(language: Language, labels: Record<Language, string>): Promise<void> {
    await this.open('more');
    const option = this.byText(labels[language]);
    await option.waitForDisplayed({ timeout: 15_000 });
    await option.click();
    // The app recreates its screens after a language change.
    await this.driver.waitUntil(
      async () => (await this.tab('home').isExisting()) && (await this.tab('home').isDisplayed()),
      { timeout: 30_000, timeoutMsg: 'App did not return after the language change.' },
    );
    await this.open('home');
  }
}
