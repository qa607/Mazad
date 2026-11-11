import { MobileScreen } from '@mobile/screens/mobile.screen';

export type ContactFormField = 'name' | 'email' | 'mobile' | 'message';

/** The form's text boxes, top to bottom (Mobile Number's "+966" is a label beside its box). */
const FIELD_ORDER: readonly ContactFormField[] = ['name', 'email', 'mobile', 'message'];

/** How a send ended in the app: the form closed, or it stayed open with its boxes emptied. */
export type SendOutcome = 'closed' | 'cleared';

/**
 * Mazad Android app — Contact Form (Help Center → a category → Contact Us), recorded on
 * staging (8.2.2-stage, 2026-11-11). Jetpack Compose with no resource IDs or test tags:
 * - the four boxes are the screen's only EditTexts, found by position (FIELD_ORDER);
 * - Send has no text of its own: its label is a child, so the button is the label's parent;
 * - while the keyboard is open, Send is outside the accessibility tree, so the keyboard is
 *   closed before Send is read or tapped.
 * Visible text (title, labels, placeholders, Send) is passed in by the caller.
 */
export class ContactFormScreen extends MobileScreen {
  field(field: ContactFormField) {
    const index = FIELD_ORDER.indexOf(field);
    return this.driver.$(
      `android=new UiSelector().className("android.widget.EditText").instance(${index})`,
    );
  }

  /** Send, found through its label (the clickable parent holds the enabled state). */
  sendButton(sendLabel: string) {
    return this.driver.$(`//*[@text=${JSON.stringify(sendLabel)}]/..`);
  }

  /** Screen title in the top bar ("Contact Form"). */
  title(titleLabel: string) {
    return this.byText(titleLabel);
  }

  async waitUntilOpen(titleLabel: string, timeout = 20_000): Promise<void> {
    await this.title(titleLabel).waitForDisplayed({ timeout });
    await this.field('name').waitForDisplayed({ timeout });
  }

  /** Closes the on-screen keyboard if it is open (Back closes only the keyboard then). */
  async closeKeyboard(): Promise<void> {
    if (!(await this.driver.isKeyboardShown())) return;
    await this.driver.back();
    await this.driver.waitUntil(async () => !(await this.driver.isKeyboardShown()), {
      timeout: 5_000,
      timeoutMsg: 'The keyboard did not close.',
    });
  }

  /**
   * Replaces a box's text in one step, as a paste would. The app filters the result: Name
   * drops digits and symbols, Mobile Number drops letters. A paste that would make Mobile
   * Number longer than 10 characters is refused whole (the box keeps its previous text).
   */
  async enter(field: ContactFormField, value: string): Promise<void> {
    const box = this.field(field);
    await box.click();
    await box.setValue(value);
  }

  /** Clears a box, then types the value one key at a time, as a user would. */
  async typeKeys(field: ContactFormField, value: string): Promise<void> {
    const box = this.field(field);
    await box.click();
    await box.clearValue();
    await this.driver.keys([...value]);
  }

  async clear(field: ContactFormField): Promise<void> {
    const box = this.field(field);
    await box.click();
    await box.clearValue();
  }

  /** The box's text; an empty box reads "" (its placeholder is a separate element). */
  async value(field: ContactFormField): Promise<string> {
    return this.field(field).getText();
  }

  async fill(values: Record<ContactFormField, string>): Promise<void> {
    for (const field of FIELD_ORDER) await this.enter(field, values[field]);
  }

  async isSendEnabled(sendLabel: string): Promise<boolean> {
    await this.closeKeyboard();
    const button = this.sendButton(sendLabel);
    await button.waitForDisplayed({ timeout: 10_000 });
    return (await button.getAttribute('enabled')) === 'true';
  }

  /** Taps Send. Sends the message to staging: callers must be approved to do so. */
  async send(sendLabel: string): Promise<void> {
    await this.closeKeyboard();
    const button = this.sendButton(sendLabel);
    await button.waitForEnabled({ timeout: 10_000 });
    await button.click();
  }

  /**
   * Waits until a send has finished: the form has closed, or it is still open with the Name
   * box emptied. Throws when neither happens within the timeout (e.g. an error was shown).
   */
  async waitForSendOutcome(titleLabel: string, timeout = 30_000): Promise<SendOutcome> {
    let outcome: SendOutcome | undefined;
    await this.driver.waitUntil(
      async () => {
        if (!(await this.title(titleLabel).isExisting())) outcome = 'closed';
        else if ((await this.value('name').catch(() => 'unreadable')) === '') outcome = 'cleared';
        return outcome !== undefined;
      },
      { timeout, interval: 500, timeoutMsg: 'The Contact Form neither closed nor cleared.' },
    );
    return outcome!;
  }
}
