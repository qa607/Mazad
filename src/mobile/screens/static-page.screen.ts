import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — an in-app page opened from More (About Us, Terms & Conditions), recorded on
 * staging (8.2.2-stage, 2026-11-11): its title in the top bar, its content in a WebView and a Back
 * button at the bottom. Text comes from the caller.
 */
export class StaticPageScreen extends MobileScreen {
  title(label: string) {
    return this.byText(label);
  }

  /** The page content: WebViews (About Us nests one inside another). */
  get contentViews() {
    return this.driver.$$('android=new UiSelector().className("android.webkit.WebView")');
  }

  /** True when at least one content WebView is displayed. */
  async isContentShown(): Promise<boolean> {
    for (const view of await this.contentViews.getElements()) {
      if (await view.isDisplayed()) return true;
    }
    return false;
  }

  backButton(label: string) {
    return this.byText(label);
  }

  async waitUntilOpen(titleLabel: string, timeout = 15_000): Promise<void> {
    await this.title(titleLabel).waitForDisplayed({ timeout });
    await this.driver.waitUntil(() => this.isContentShown(), {
      timeout,
      timeoutMsg: `The "${titleLabel}" page shows no content.`,
    });
  }

  /** Taps Back (bottom button) to return to More. */
  async goBack(backLabel: string): Promise<void> {
    await this.backButton(backLabel).click();
  }
}
