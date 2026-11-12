import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';
import { exactText } from '@utils/text';

/**
 * Website Help Center (/<lang>/help-center/): a card per FAQ category that has published
 * questions, each linking to the category's page (/<lang>/help-center/<slug>/). A category page
 * lists its published questions; clicking a question opens its answer. Both pages load their
 * content after the page itself, showing placeholders meanwhile.
 */
export class FaqWebPage extends BasePage {
  static readonly path = '/help-center/';

  readonly heading: Locator;
  /** Category cards of the Help Center page (and the related cards of a category page). */
  readonly categoryCards: Locator;
  readonly categoryNames: Locator;
  /** Loading placeholders, shown until the content arrives. */
  readonly placeholders: Locator;

  // Category page
  readonly categoryTitle: Locator;
  readonly backLink: Locator;
  readonly questions: Locator;
  readonly questionTexts: Locator;
  /** The category page once Angular has hydrated it (see gotoCategory()). */
  readonly hydratedCategoryPage: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    this.heading = page.getByRole('heading', { level: 1, name: this.t('helpCenterHeading') });
    this.categoryCards = page.locator('app-help-center-main-items a.item');
    this.categoryNames = this.categoryCards.locator('h3');
    this.placeholders = page.locator('app-shimmer');

    this.categoryTitle = page.locator('h1.faq-main-title');
    this.backLink = page.locator('a.back-button');
    this.questions = page.locator('app-faqs .faq-item');
    this.questionTexts = this.questions.locator('.faq-question-text');
    this.hydratedCategoryPage = page.locator('app-help-center-faqs:not([ngh])');
  }

  /** Opens the Help Center and waits for the category cards. */
  async goto(): Promise<void> {
    await this.open(FaqWebPage.path);
    await this.categoryCards.first().waitFor();
  }

  /**
   * Opens a category page by its slug and waits until it responds to clicks. The page is
   * rendered on the server: its questions show at once, but until Angular has hydrated it (and
   * removed the "ngh" marker) clicking a question does not open its answer.
   */
  async gotoCategory(slug: string): Promise<void> {
    await this.open(`${FaqWebPage.path}${slug}/`);
    await this.hydratedCategoryPage.waitFor();
  }

  categoryCard(name: string): Locator {
    return this.categoryCards.filter({
      has: this.page.locator('h3', { hasText: exactText(name) }),
    });
  }

  /**
   * Clicks a category card on the Help Center page (a full page load) and waits until the
   * category page responds to clicks (see gotoCategory()).
   */
  async openCategory(name: string): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/help-center\/[^/]+\/?$/),
      this.categoryCard(name).click(),
    ]);
    await this.hydratedCategoryPage.waitFor();
  }

  /** A question item (question and its answer) by its exact question text. */
  question(text: string): Locator {
    return this.questions.filter({
      has: this.page.locator('.faq-question-text', { hasText: exactText(text) }),
    });
  }

  answer(questionText: string): Locator {
    return this.question(questionText).locator('.faq-answer');
  }

  /** Clicks a question to open (or close) its answer. */
  async toggleQuestion(text: string): Promise<void> {
    await this.question(text).locator('.faq-question').click();
  }
}
