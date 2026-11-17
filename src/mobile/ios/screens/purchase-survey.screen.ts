import { type IosElement, parseIosSource } from '@mobile/ios/page-source';
import { IosScreen } from '@mobile/ios/screens/ios.screen';

/**
 * Mazad iOS — "تقييم تجربة الشراء", the survey after a delivery is confirmed (observed 2026-11-17,
 * build 8.3 (1491), Arabic). Numbered questions ("1- ما مدى سهولة …؟"); each scale is a row of
 * number StaticTexts ("1" … "7", right to left) over a row of dots, between "قليل جداً" and
 * "عالٍ جداً"; then an optional TextView and an unlabeled send Button ("أرسل" is drawn, not in
 * the tree); then "شكراً لك!" and a "عودة" Button. Every number is right-aligned in a wider
 * frame, so its dot is under the frame's right edge (4 pt in), 11 pt below it: a score is chosen
 * by tapping there. Taps: the scores, the text box, the send and back buttons.
 */
export class IosPurchaseSurveyScreen extends IosScreen {
  private async elements(): Promise<IosElement[]> {
    return parseIosSource(await this.driver.getPageSource()).filter((e) => e.visible);
  }

  /** The numbered questions, top to bottom, without their "N- " prefix. */
  async questions(): Promise<string[]> {
    return (await this.elements())
      .filter((e) => e.type === 'StaticText' && /^\d+-\s/.test(e.label.trim()))
      .sort((a, b) => a.y - b.y)
      .map((e) =>
        e.label
          .replace(/^\d+-\s*/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      );
  }

  /** Waits for the survey: the ONE text "1- …" (its first question). */
  async waitForSurvey(timeout = 20_000): Promise<void> {
    await this.driver.waitUntil(async () => (await this.questions()).length > 0, {
      timeout,
      timeoutMsg: 'The survey did not show.',
    });
  }

  /**
   * Chooses one score per scale question, in order: for question n, the ONE "score" number
   * between that question and the next one, tapped on its dot.
   */
  async chooseScores(scores: number[]): Promise<void> {
    const all = await this.elements();
    const questions = all
      .filter((e) => e.type === 'StaticText' && /^\d+-\s/.test(e.label.trim()))
      .sort((a, b) => a.y - b.y);
    for (const [index, score] of scores.entries()) {
      const top = questions[index].y;
      const bottom = questions[index + 1]?.y ?? Number.POSITIVE_INFINITY;
      const numbers = all.filter(
        (e) => e.type === 'StaticText' && e.label === String(score) && e.y > top && e.y < bottom,
      );
      if (numbers.length !== 1) {
        throw new Error(
          `Survey question ${index + 1}: expected 1 number "${score}", found ${numbers.length}.`,
        );
      }
      const number = numbers[0];
      await this.tapAtCenterOf({
        x: number.x + number.width - 4,
        y: number.y + number.height + 11,
        width: 0,
        height: 0,
      });
    }
  }

  /** Types the optional answer in the ONE text box, then taps the title to close the keyboard. */
  async writeComment(text: string, titleLabel: string): Promise<void> {
    const box = await this.only(
      '-ios predicate string:type == "XCUIElementTypeTextView"',
      'Survey: text box',
    );
    await box.click();
    await box.setValue(text);
    const title = (await this.elements()).find(
      (e) => e.type === 'StaticText' && e.label === titleLabel,
    );
    if (title) await this.tapAtCenterOf(title);
  }

  /**
   * Sends: the ONE enabled unlabeled wide Button below the text box (its "أرسل" text is not in
   * the tree), then waits for the thank-you text.
   */
  async send(thankYouLabel: string): Promise<void> {
    const all = await this.elements();
    const box = all.find((e) => e.type === 'TextView');
    const buttons = all.filter(
      (e) =>
        e.type === 'Button' &&
        !e.label &&
        e.enabled &&
        e.width > 300 &&
        (!box || e.y > box.y + box.height),
    );
    if (buttons.length !== 1) {
      throw new Error(`Survey: expected 1 send button, found ${buttons.length}.`);
    }
    await this.tapAtCenterOf(buttons[0]);
    await this.only(this.staticTextSelector(thankYouLabel), 'Survey: thank-you text', 20_000);
  }

  /** Leaves the thank-you page with its button (the ONE Button with that label). */
  async close(backLabel: string): Promise<void> {
    const back = await this.only(this.buttonSelector(backLabel), `Survey: "${backLabel}"`);
    await back.click();
  }
}
