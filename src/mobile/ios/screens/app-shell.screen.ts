import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { IosScreen } from '@mobile/ios/screens/ios.screen';
import { iosAppText } from '@test-data/ios-app.data';
import type { Language } from '@typings';

/**
 * Tab bar and app-level navigation (iOS). Uses the recorded accessibility ids
 * (src/mobile/ios/ios-selectors.ts) when there are any, otherwise the provisional fallback
 * (button or element by its visible text); see IosScreen.
 *
 * Language: the app may start in either language (it keeps the last one). Detecting the current
 * language therefore always uses the tab LABELS (a recorded accessibility id would be the same
 * in both languages), and the language switch starts from the current language's own labels.
 */
export class IosAppShellScreen extends IosScreen {
  /** How long openMore waits for the More screen after each tap (ms). */
  protected moreShownTimeout = 4_000;

  /** A tab-bar button found by its visible label (language-specific). */
  tab(label: string) {
    return this.driver.$(this.buttonSelector(label));
  }

  homeTab(label: string) {
    return this.idOr(IDS.appShell.homeTab, () => this.tab(label));
  }

  moreTab(label: string) {
    return this.idOr(IDS.appShell.moreTab, () => this.tab(label));
  }

  /**
   * The guest prompt on More (shown only while signed out): a Button with this exact label
   * (exactly one in the 2026-11-09 inspection, in both languages). For presence checks.
   */
  guestPrompt(label: string) {
    return this.idOr(IDS.appShell.guestPrompt, () => this.button(label));
  }

  /** The app's current language: the one whose Home tab label is on screen, or null. */
  async detectLanguage(homeLabels: Record<Language, string>): Promise<Language | null> {
    for (const language of Object.keys(homeLabels) as Language[]) {
      if (await this.tab(homeLabels[language]).isDisplayed()) return language;
    }
    return null;
  }

  /**
   * Waits until the Home tab of EITHER language is on screen and returns that language.
   * Fails with a clear message if neither appears.
   */
  async waitUntilReady(homeLabels: Record<Language, string>, timeout = 30_000): Promise<Language> {
    const found: { language: Language | null } = { language: null };
    await this.driver.waitUntil(
      async () => {
        found.language = await this.detectLanguage(homeLabels);
        return found.language !== null;
      },
      {
        timeout,
        interval: 500,
        timeoutMsg: `Neither the English nor the Arabic Home tab appeared within ${timeout} ms.`,
      },
    );
    return found.language as Language;
  }

  /**
   * True when the More screen is really shown: both language options are on screen (the list
   * exists in either language, signed in or not). Presence checks only.
   */
  async isMoreShown(): Promise<boolean> {
    for (const language of ['en', 'ar'] as const) {
      if (!(await this.button(iosAppText(language).languageOption).isDisplayed())) return false;
    }
    return true;
  }

  /**
   * Opens the More tab, using the labels of the language the app is currently in, and VERIFIES
   * that More is shown. The app can show a tab as selected while its content is another screen
   * (after a relaunch), and tapping an already-selected tab does nothing; so when More does not
   * appear, Home is selected first and More tapped again (at most three times, then it fails
   * with a clear message). Each tap is on the ONE Button with that label.
   */
  async openMore(moreLabel: string, homeLabel: string): Promise<void> {
    const tap = async (id: string, label: string, what: string) => {
      const element = await this.idOrOnly(
        id,
        this.buttonSelector(label),
        `Tab bar: the "${what}" tab`,
      );
      await element.click();
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      await tap(IDS.appShell.moreTab, moreLabel, moreLabel);
      const shown = await this.driver
        .waitUntil(() => this.isMoreShown(), { timeout: this.moreShownTimeout, interval: 400 })
        .catch(() => false);
      if (shown) return;
      await tap(IDS.appShell.homeTab, homeLabel, homeLabel);
      await this.driver.pause(600);
    }
    throw new Error(`The "${moreLabel}" tab did not open the More screen after 3 attempts.`);
  }

  /**
   * Waits until the More screen is really displayed, shown by its guest prompt (the screen is
   * only complete once it is there). Returns false instead of throwing when it never appears.
   */
  async waitUntilMoreDisplayed(guestPromptLabel: string, timeout = 15_000): Promise<boolean> {
    return this.guestPrompt(guestPromptLabel)
      .waitForDisplayed({ timeout })
      .then(
        () => true,
        () => false,
      );
  }

  /**
   * Opens the More tab and fails with a clear message unless the app is signed out (guest).
   * Never signs out automatically: a signed-in app must be signed out manually by QA.
   */
  async requireGuest(
    moreLabel: string,
    homeLabel: string,
    guestPromptLabel: string,
  ): Promise<void> {
    await this.openMore(moreLabel, homeLabel);
    const guest = await this.waitUntilMoreDisplayed(guestPromptLabel);
    if (!guest) {
      throw new Error(
        'The iOS app is not in guest state (no guest prompt on More). Sign out manually, then re-run.',
      );
    }
  }

  /**
   * Makes the app use `language`. Waits for the Home tab of either language, detects the
   * current language, and returns at once when it already is the requested one. Otherwise it
   * opens More with the CURRENT language's label, taps the requested language's option (fails
   * clearly if the option is not there) and waits for the Home tab in the new language.
   * Returns the language the app started in.
   */
  async setLanguage(
    language: Language,
    optionLabels: Record<Language, string>,
    moreLabels: Record<Language, string>,
    homeLabels: Record<Language, string>,
  ): Promise<Language> {
    const current = await this.waitUntilReady(homeLabels);
    if (current === language) return current;
    await this.openMore(moreLabels[current], homeLabels[current]);
    // The ONE Button with the option's label (unique in the 2026-11-09 inspection; any other
    // number of matches fails instead of being resolved by order).
    const option = await this.only(
      this.buttonSelector(optionLabels[language]),
      `More: the "${optionLabels[language]}" language option (app language: ${current})`,
    );
    await option.click();
    await this.tab(homeLabels[language]).waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: `The ${language} Home tab did not appear after switching the language.`,
    });
    return current;
  }
}
