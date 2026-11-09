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
