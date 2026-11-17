import { type IosElement, parseIosSource } from '@mobile/ios/page-source';
import { IosScreen } from '@mobile/ios/screens/ios.screen';

/** Labels compared with spaces normalised (the app doubles some, e.g. "تويوتا لاند كروزر  2019"). */
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Whether `inner`'s frame lies inside `outer`'s. */
const contains = (outer: IosElement, inner: IosElement) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

/**
 * Mazad iOS — delivery of a bought car, from My Actions (observed 2026-11-17, build 8.3 (1491),
 * Arabic): the car's card shows its title, its step ("تأكيد الاستلام") and unlabeled Buttons that
 * each contain a text ("تأكيد الاستلام", "معلومات الاستلام"). The Confirm Delivery sheet has an
 * unlabeled 32×32 checkbox Button next to the "received as specified" statement, a signature
 * ScrollView under "وقّع هنا", and the "تأكيد الاستلام" Button (enabled once ticked and signed);
 * then a dialog offers "تقييم تجربة الشراء". Labels come from the caller (test data).
 *
 * Every control is the ONE element that fits (never by order); a tap lands on that element's
 * own frame. Taps: the card's button, the checkbox, the signature strokes, the confirm button,
 * the dialog's choice, and "لاحقاً" on an optional update dialog.
 */
export class IosConfirmDeliveryScreen extends IosScreen {
  private async elements(): Promise<IosElement[]> {
    return parseIosSource(await this.driver.getPageSource()).filter((e) => e.visible);
  }

  /**
   * The ONE card of the car at that step: its title text, the step text within 120 pt below it,
   * and the ONE unlabeled Button containing `buttonLabel` within 260 pt below the title. Null
   * when the card is not on screen.
   */
  private async cardButton(
    title: string,
    step: string,
    buttonLabel: string,
  ): Promise<IosElement | null> {
    const all = await this.elements();
    const texts = all.filter((e) => e.type === 'StaticText');
    const cards = texts
      .filter((t) => norm(t.label) === norm(title))
      .filter((t) =>
        texts.some((s) => norm(s.label) === norm(step) && s.y > t.y && s.y - t.y < 120),
      );
    if (cards.length === 0) return null;
    if (cards.length > 1) {
      throw new Error(
        `My Actions: ${cards.length} cards "${title}" at "${step}". Not choosing one.`,
      );
    }
    const [card] = cards;
    const buttonTexts = texts.filter(
      (t) => norm(t.label) === norm(buttonLabel) && t.y > card.y && t.y - card.y < 260,
    );
    const buttons = all.filter(
      (b) => b.type === 'Button' && !b.label && buttonTexts.some((t) => contains(b, t)),
    );
    if (buttons.length !== 1) {
      throw new Error(
        `My Actions: expected 1 "${buttonLabel}" button on the "${title}" card, found ${buttons.length}.`,
      );
    }
    return buttons[0];
  }

  /** Whether the car's card at that step is on screen, scrolling My Actions up to `maxSwipes`. */
  async findCard(
    title: string,
    step: string,
    buttonLabel: string,
    maxSwipes = 5,
  ): Promise<boolean> {
    for (let swipe = 0; swipe <= maxSwipes; swipe++) {
      if (await this.cardButton(title, step, buttonLabel)) return true;
      await this.driver.execute('mobile: swipe', { direction: 'up' });
    }
    return false;
  }

  /** Opens the Confirm Delivery sheet from the card's button and waits for its title. */
  async openFromCard(
    title: string,
    step: string,
    buttonLabel: string,
    sheetConfirmLabel: string,
  ): Promise<void> {
    const button = await this.cardButton(title, step, buttonLabel);
    if (!button) throw new Error(`My Actions: no "${title}" card at "${step}".`);
    await this.tapAtCenterOf(button);
    await this.only(this.buttonSelector(sheetConfirmLabel), 'Confirm Delivery: confirm button');
  }

  /**
   * Ticks "received as specified" (the ONE unlabeled 32×32 Button), draws three strokes in the
   * signature ScrollView under `signHereLabel`, and taps the confirm Button once it is enabled.
   */
  async confirmDelivery(signHereLabel: string, confirmLabel: string): Promise<void> {
    const all = await this.elements();
    const checkboxes = all.filter(
      (e) => e.type === 'Button' && !e.label && e.width <= 40 && e.height <= 40 && e.width >= 24,
    );
    if (checkboxes.length !== 1) {
      throw new Error(`Confirm Delivery: expected 1 checkbox, found ${checkboxes.length}.`);
    }
    await this.tapAtCenterOf(checkboxes[0]);

    const signHere = all.filter((e) => e.type === 'StaticText' && e.label === signHereLabel);
    if (signHere.length !== 1) throw new Error(`Confirm Delivery: "${signHereLabel}" not found.`);
    const pads = all.filter(
      (e) => e.type === 'ScrollView' && e.y > signHere[0].y && e.y - signHere[0].y < 80,
    );
    if (pads.length !== 1) {
      throw new Error(`Confirm Delivery: expected 1 signature area, found ${pads.length}.`);
    }
    const pad = pads[0];
    const at = (fx: number, fy: number) => ({
      x: Math.round(pad.x + pad.width * fx),
      y: Math.round(pad.y + pad.height * fy),
    });
    for (const [[x1, y1], [x2, y2]] of [
      [
        [0.15, 0.6],
        [0.35, 0.3],
      ],
      [
        [0.35, 0.3],
        [0.6, 0.7],
      ],
      [
        [0.6, 0.7],
        [0.85, 0.3],
      ],
    ] as const) {
      await this.driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move(at(x1, y1))
        .down()
        .move({ ...at(x2, y2), duration: 300 })
        .up()
        .perform();
    }

    const confirm = await this.only(this.buttonSelector(confirmLabel), 'Confirm Delivery: confirm');
    await confirm.waitForEnabled({ timeout: 10_000 });
    await confirm.click();
  }

  /** The thank-you dialog's choice (the ONE Button with that label), after confirming. */
  async chooseAfterDelivery(label: string, timeout = 20_000): Promise<void> {
    const choice = await this.only(
      this.buttonSelector(label),
      `After delivery: "${label}"`,
      timeout,
    );
    await choice.click();
  }

  /**
   * Taps "Later" on the optional update dialog when it shows within `timeout` (seen 2026-11-17:
   * App Versions has iOS 8.4 Active, above the installed 8.3); does nothing otherwise.
   */
  async dismissOptionalUpdate(laterLabel: string, timeout = 10_000): Promise<void> {
    const later = await this.only(
      this.buttonSelector(laterLabel),
      'Update dialog: later',
      timeout,
    ).catch(() => null);
    if (later) await later.click();
  }
}
