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
    await this.page.goto(this.localizedPath(path));
  }

  /**
   * Makes the current page show in this page object's language: when the URL carries another
   * language prefix (or none), the same path is reopened with the right one. Does nothing
   * when the page is already in the language.
   */
  async applyLanguage(): Promise<void> {
    const url = new URL(this.page.url());
    const [first, ...rest] = url.pathname.split('/').filter(Boolean);
    if (first === this.language) return;
    const path = first === 'en' || first === 'ar' ? rest : [first, ...rest].filter(Boolean);
    const trailing = url.pathname.endsWith('/') ? '/' : '';
    await this.open(`/${path.join('/')}${path.length ? trailing : ''}${url.search}`);
  }

  /** "/contact-us/" → "/ar/contact-us/" for the Arabic page object. */
  protected localizedPath(path: string): string {
    return `/${this.language}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
