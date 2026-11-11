import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';
import type { IosContactField } from '@test-data/ios-app.data';

/**
 * Mazad iOS: More → Help Center → a category → Contact Us → Contact Form. NAVIGATION, DISPLAY AND
 * TYPING ONLY. Observed on the device 2026-11-11 (iPhone 11 Pro Max, build 8.3 (1491), English
 * and Arabic):
 * - Help Center is a Button on More; categories, "Can't find your answer?" and the "Contact Us"
 *   link are StaticTexts with exact labels.
 * - Name, E-mail and Mobile Number are TextFields, each the ONE TextField with its placeholder;
 *   Message is the screen's ONE TextView (its placeholder shows as its value while empty).
 * - Send and "Contact Us via WhatsApp" are Buttons with no accessible name or label, told apart
 *   only by position, so Send is located ONLY by a recorded accessibility id (requireId) and is
 *   handed out read-only: nothing here can tap it, so nothing can be sent from this screen.
 *
 * Every control is the ONE element with its exact label, placeholder or type (never by order).
 */
export class IosContactFormScreen extends IosScreen {
  /** More → Help Center (the ONE Button with that label). Navigation. */
  async openHelpCenter(label: string): Promise<void> {
    const row = await this.only(this.buttonSelector(label), `More: the "${label}" row`);
    await row.click();
  }

  /** A Help Center category (the ONE StaticText with that label). Navigation. */
  async openCategory(name: string): Promise<void> {
    const row = await this.only(this.staticTextSelector(name), `Help Center: "${name}"`);
    await row.click();
  }

  /** The "Contact Us" link below a category's questions. Navigation. */
  async openContactUs(label: string): Promise<void> {
    const link = await this.only(
      this.staticTextSelector(label),
      `Help Center: the "${label}" link`,
    );
    await link.click();
  }

  /** A text of the screen: the ONE StaticText with this exact label. */
  async onlyText(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.only(this.staticTextSelector(label), `Contact Form: the "${label}" text`),
    );
  }

  private fieldSelector(field: IosContactField, placeholder: string): string {
    return field === 'message'
      ? this.typeSelector('TextView')
      : `-ios predicate string:type == "XCUIElementTypeTextField" AND placeholderValue == ${JSON.stringify(placeholder)}`;
  }

  private async onlyField(field: IosContactField, placeholder: string) {
    return this.only(this.fieldSelector(field, placeholder), `Contact Form: the ${field} field`);
  }

  /** A field for inspection only (displayed, value attribute). */
  async field(field: IosContactField, placeholder: string): Promise<ReadOnlyElement> {
    return this.readOnly(await this.onlyField(field, placeholder));
  }

  /**
   * The field's value as the app reports it. An empty field reports its placeholder (Message
   * included), so callers compare against the placeholder to tell that it is empty.
   */
  async value(field: IosContactField, placeholder: string): Promise<string> {
    return (await (await this.onlyField(field, placeholder)).getAttribute('value')) ?? '';
  }

  /**
   * Types into one field (XCUITest types key by key, as a user would). Typing only: Send cannot be
   * tapped from here. The app filters as it goes: Name drops digits and symbols, Mobile Number
   * drops letters and stops at 10 characters.
   */
  async enter(field: IosContactField, placeholder: string, value: string): Promise<void> {
    const box = await this.onlyField(field, placeholder);
    await box.setValue(value);
  }

  /**
   * Send, read-only, by its recorded accessibility id only (none yet: see ios-selectors.ts). Fails
   * with a clear message until the id exists; never located by position.
   */
  async sendButton(): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.requireId(IDS.contactForm.sendButton, 'Contact Form Send').getElement(),
    );
  }
}
