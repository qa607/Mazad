import { MobileScreen } from '@mobile/screens/mobile.screen';

/** Notifications (My Notifications / Mazad Notifications), opened from the top bar bell. */
export class NotificationsScreen extends MobileScreen {
  get tabBar() {
    return this.byId('tab_layout_notifications');
  }

  get enablePrompt() {
    return this.byId('linear_enable_notifications');
  }

  get laterButton() {
    return this.byId('textview_later_button');
  }

  get loginOrRegisterButton() {
    return this.byId('textview_login_or_register_button');
  }

  subTab(label: string) {
    return this.byDescription(label);
  }

  message(text: string) {
    return this.byText(text);
  }

  /** Closes the in-app "Turn on notifications" prompt if it is shown, choosing "Later". */
  async dismissEnablePrompt(): Promise<void> {
    if (await this.laterButton.isExisting()) await this.laterButton.click();
  }

  async close(): Promise<void> {
    await this.driver.back();
  }
}
