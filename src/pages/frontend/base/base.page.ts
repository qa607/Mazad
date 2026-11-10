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

  /**
   * Navigates to a path relative to the environment baseURL, in the active language.
   * Mazad's website switches language by URL prefix only (confirmed on staging: "/login"
   * alone 404s, "/en/login" and "/ar/login" both serve the page in that language, with no
   * redirect between them) — there is no cookie, header or UI toggle to set instead.
   */
  protected async open(path: string): Promise<void> {
    const prefixed = `/${this.language}${path.startsWith('/') ? path : `/${path}`}`;
    await this.page.goto(prefixed);
  }
}
