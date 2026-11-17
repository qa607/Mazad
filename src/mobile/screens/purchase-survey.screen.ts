import { MobileScreen } from '@mobile/screens/mobile.screen';

/** One scale question's answer: the score, on its scale `from`…`to` (from the back office). */
export interface ScaleAnswer {
  score: number;
  from: number;
  to: number;
}

/**
 * Mazad Android app — "Rate Your Purchase Experience", the survey after a delivery is confirmed
 * (recorded on 8.2.2-stage, 2026-11-15, English, 1080×2400 emulator). Compose without resource
 * IDs: numbered questions ("1- How easy …?"), each scale a row of dots drawn between a "Very low"
 * and a "Very high" label (the numbers and dots are not in the accessibility tree), then an
 * optional text box and "Send". A score is chosen by tapping its dot, placed from the two labels:
 * the dots run from 42 px inside "Very low" to 42 px inside "Very high", 53 px above them.
 */
export class PurchaseSurveyScreen extends MobileScreen {
  /** The numbered questions, top to bottom, without their "N- " prefix. */
  async questions(): Promise<string[]> {
    // Every text view, filtered here: a regex inside a UiSelector does not survive its escaping.
    const views = await this.driver
      .$$('android=new UiSelector().className("android.widget.TextView")')
      .getElements();
    const found: { y: number; text: string }[] = [];
    for (const view of views) {
      const text = (await view.getText()).replace(/\s+/g, ' ').trim();
      if (/^\d+-\s/.test(text)) {
        found.push({ y: (await view.getLocation()).y, text: text.replace(/^\d+-\s*/, '') });
      }
    }
    return found.sort((a, b) => a.y - b.y).map((q) => q.text);
  }

  /** Waits for the survey, by its first question. */
  async waitForSurvey(firstQuestion: string): Promise<void> {
    await this.driver
      .$(`android=new UiSelector().textContains(${JSON.stringify(firstQuestion)})`)
      .waitForDisplayed({ timeout: 20_000 });
  }

  /** Every element with this exact text, top to bottom, with its frame. */
  private async framesOf(text: string) {
    const views = await this.driver
      .$$(`android=new UiSelector().text(${JSON.stringify(text)})`)
      .getElements();
    const frames: { x: number; y: number; width: number; height: number }[] = [];
    for (const view of views) frames.push(await this.driver.getElementRect(view.elementId));
    return frames.sort((a, b) => a.y - b.y);
  }

  /**
   * Chooses one score on each scale, in order (scale n is the n-th "Very low" / "Very high"
   * pair from the top). The labels come from the caller.
   */
  async chooseScores(answers: ScaleAnswer[], lowLabel: string, highLabel: string): Promise<void> {
    const lows = await this.framesOf(lowLabel);
    const highs = await this.framesOf(highLabel);
    if (lows.length < answers.length || highs.length < answers.length) {
      throw new Error(
        `Survey: ${answers.length} scales expected, found ${lows.length} "${lowLabel}" and ${highs.length} "${highLabel}" labels.`,
      );
    }
    for (const [index, { score, from, to }] of answers.entries()) {
      const low = lows[index];
      const high = highs[index];
      const first = low.x + 42;
      const last = high.x + high.width - 42;
      const step = to === from ? 0 : (last - first) / (to - from);
      await this.driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x: Math.round(first + (score - from) * step), y: low.y - 53 })
        .down()
        .pause(50)
        .up()
        .perform();
    }
  }

  get commentBox() {
    return this.driver.$('android=new UiSelector().className("android.widget.EditText")');
  }

  /** Types the optional free-text answer and hides the keyboard. */
  async writeComment(text: string): Promise<void> {
    await this.commentBox.setValue(text);
    if (await this.driver.isKeyboardShown()) await this.driver.back();
  }

  /** Sends the survey (the button, by its label) and waits for the thank-you text. */
  async send(sendLabel: string, thankYouLabel: string): Promise<void> {
    await this.byText(sendLabel).click();
    await this.byText(thankYouLabel).waitForDisplayed({ timeout: 20_000 });
  }

  /** Leaves the thank-you page with its button (by label). */
  async close(backLabel: string): Promise<void> {
    await this.byText(backLabel).click();
  }
}
