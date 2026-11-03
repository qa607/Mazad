import type { Page } from '@playwright/test';
import { getTranslator, type Translator } from '@locales';
import type { Language } from '@typings';

/**
 * Parent of all page objects. Holds the page, the active language and a translator
 * for text-based locators. Locators and actions live in subclasses; assertions stay in tests.
 */
export abstract class BasePage {
  protected readonly t: Translator;

  constructor(
    protected readonly page: Page,
    protected readonly language: Language,
  ) {
    this.t = getTranslator(language);
  }

  /** Navigates to a path relative to the environment baseURL, in the active language. */
  protected async open(path: string): Promise<void> {
    await this.page.goto(path);
    await this.applyLanguage();
  }

  /**
   * PLACEHOLDER: how Mazad switches language (URL prefix, subdomain, cookie/localStorage,
   * or UI toggle) is not confirmed yet. Implement it here once the application is inspected;
   * `open()` may need to change too, e.g. to prefix the path or set a cookie before goto.
   */
  private applyLanguage(): Promise<void> {
    throw new Error(
      `Language switching is not implemented yet (requested "${this.language}"). ` +
        'Implement BasePage.applyLanguage() once the Mazad language mechanism is confirmed.',
    );
  }
}
