import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — hidden backend setting, opened by a long press on the More tab. Recorded on
 * staging (8.2.2-stage, 2026-11-11): it shows the backend URL the app currently uses
 * (text_view_url), a URL box, Apply and Reset. Apply stores the URL (it survives app restarts) and
 * returns to Home. Reset is never used: it restores the build default (mazad-v3.motory.dev).
 */
export class EnvironmentScreen extends MobileScreen {
  get moreTab() {
    return this.byId('item_menu_activity_main_bottom_navigation_more');
  }

  get currentUrlText() {
    return this.byId('text_view_url');
  }

  get urlInput() {
    return this.byId('text_input_edit_text_url');
  }

  get applyButton() {
    return this.byId('text_view_apply_button');
  }

  /** Long-presses the More tab and waits for the backend setting to show. */
  async open(): Promise<void> {
    await this.moreTab.waitForDisplayed({ timeout: 30_000 });
    await this.driver.execute('mobile: longClickGesture', {
      elementId: await this.moreTab.elementId,
      duration: 1_500,
    });
    await this.currentUrlText.waitForDisplayed({ timeout: 10_000 });
  }

  /** The backend URL the app currently uses. */
  async currentUrl(): Promise<string> {
    return (await this.currentUrlText.getText()).trim();
  }

  /** Stores `url` as the backend. The app closes the setting and returns to Home. */
  async apply(url: string): Promise<void> {
    await this.urlInput.setValue(url);
    if (await this.driver.isKeyboardShown()) await this.driver.back();
    await this.applyButton.click();
    await this.currentUrlText.waitForExist({ reverse: true, timeout: 15_000 });
  }

  /** Closes the setting without changing anything (only while it is open). */
  async close(): Promise<void> {
    if (!(await this.currentUrlText.isExisting())) return;
    await this.driver.back();
    await this.currentUrlText.waitForExist({ reverse: true, timeout: 10_000 });
  }
}
