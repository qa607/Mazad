import { MAZAD_ANDROID_APP } from '@mobile/android.session';
import { MobileScreen } from '@mobile/screens/mobile.screen';

/** An XPath string literal for `text` (it may contain either kind of quote, not both). */
const xpathLiteral = (text: string) => (text.includes('"') ? `'${text}'` : `"${text}"`);

/**
 * Mazad Android app — delivery of a bought car, from My Actions (recorded on 8.2.2-stage,
 * 2026-11-15, English): the car's card offers "Confirm Pickup"; it opens the "Confirm Delivery"
 * sheet (a "received as specified" checkbox, a signature pad, "Confirm delivery"); then a dialog
 * thanks the buyer and offers "Rate your purchase experience". Labels come from the caller.
 */
export class ConfirmDeliveryScreen extends MobileScreen {
  private id(id: string): string {
    return `${MAZAD_ANDROID_APP.package}:id/${id}`;
  }

  /**
   * XPath of the My Actions card whose title is `title` AND whose step is `step` (spaces
   * normalised). A buyer can hold two cars with the same title at different steps (seen
   * 2026-11-17: one "Confirm Pickup", one still "You won this auction"), so the step picks the card.
   */
  private cardXPath(title: string, step: string): string {
    return (
      `//*[@resource-id="${this.id('recyclerview_my_action_tab')}"]/*` +
      `[.//*[@resource-id="${this.id('textview_title')}" and normalize-space(@text)=${xpathLiteral(title)}]` +
      ` and .//*[@resource-id="${this.id('materialTextView')}" and normalize-space(@text)=${xpathLiteral(step)}]]`
    );
  }

  /** The My Actions card of a car at a step, by its title and the step's text. */
  card(title: string, step: string) {
    return this.driver.$(this.cardXPath(title, step));
  }

  /** A button of that card, by its label. */
  cardButton(title: string, step: string, label: string) {
    return this.driver.$(
      `${this.cardXPath(title, step)}//*[@resource-id="${this.id('linear_buttons')}"]//*[normalize-space(@text)=${xpathLiteral(label)}]`,
    );
  }

  /**
   * Scrolls the My Actions list until the card of the car at that step shows; false when it never
   * does.
   */
  async findCard(title: string, step: string, maxSwipes = 6): Promise<boolean> {
    const list = this.byId('recyclerview_my_action_tab');
    await list.waitForDisplayed({ timeout: 20_000 });
    for (let swipe = 0; swipe <= maxSwipes; swipe++) {
      const card = this.card(title, step);
      if ((await card.isExisting()) && (await card.isDisplayed())) {
        return true;
      }
      await this.driver.execute('mobile: swipeGesture', {
        elementId: await list.elementId,
        direction: 'up',
        percent: 0.6,
      });
    }
    return false;
  }

  // Confirm Delivery sheet
  get sheet() {
    return this.byId('design_bottom_sheet');
  }

  get sheetTitle() {
    return this.sheet.$(`id=${this.id('text_view_title')}`);
  }

  get receivedCheckbox() {
    return this.byId('check_box_confirm_delivery');
  }

  get signaturePad() {
    return this.byId('signature_view');
  }

  get confirmButton() {
    return this.byId('text_view_confirm_delivery_button');
  }

  /** Opens the sheet from the card's button (by label) and waits for it. */
  async openFromCard(title: string, step: string, buttonLabel: string): Promise<void> {
    await this.cardButton(title, step, buttonLabel).click();
    await this.receivedCheckbox.waitForDisplayed({ timeout: 15_000 });
  }

  /** Draws a short synthetic signature: three strokes across the pad. */
  async sign(): Promise<void> {
    const { x, y, width, height } = await this.driver.getElementRect(
      await this.signaturePad.elementId,
    );
    const at = (fx: number, fy: number) => ({
      x: Math.round(x + width * fx),
      y: Math.round(y + height * fy),
    });
    const strokes: [number, number][][] = [
      [
        [0.15, 0.6],
        [0.35, 0.35],
      ],
      [
        [0.35, 0.35],
        [0.6, 0.7],
      ],
      [
        [0.6, 0.7],
        [0.85, 0.3],
      ],
    ];
    for (const [[fx1, fy1], [fx2, fy2]] of strokes) {
      await this.driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move(at(fx1, fy1))
        .down()
        .move({ ...at(fx2, fy2), duration: 300 })
        .up()
        .perform();
    }
  }

  /** Ticks "received as specified", signs and confirms the delivery; the sheet closes. */
  async confirmDelivery(): Promise<void> {
    if ((await this.receivedCheckbox.getAttribute('checked')) !== 'true') {
      await this.receivedCheckbox.click();
    }
    await this.sign();
    await this.confirmButton.click();
    await this.receivedCheckbox.waitForExist({ reverse: true, timeout: 20_000 });
  }

  /** After confirming: the thank-you dialog's choice, by its label ("Rate your purchase experience"). */
  async chooseAfterDelivery(label: string): Promise<void> {
    const choice = this.byText(label);
    await choice.waitForDisplayed({ timeout: 20_000 });
    await choice.click();
  }
}
