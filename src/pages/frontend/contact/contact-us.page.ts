import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';
import type { ContactField, ContactMessage } from '@test-data/contact-us-web.data';

/**
 * Website "Contact Us" form (/<lang>/contact-us/): Name, Email, Mobile Number and Message, and a
 * Send button that stays disabled until every field is valid. A field shows its error once it
 * is left. A message the server accepts clears the form and shows a success line under Send
 * for 5 seconds.
 *
 * Device-agnostic: on a touch device (Pixel 7 projects) fields and Send are tapped, on desktop
 * clicked. The same page is used for both languages; text locators come from `t()`.
 */
export class WebsiteContactUsPage extends BasePage {
  static readonly path = '/contact-us/';

  /** <html>, for the lang and dir attributes. */
  readonly document: Locator;
  readonly heading: Locator;
  readonly form: Locator;
  /** The form once Angular has hydrated it (see goto()). */
  readonly hydratedForm: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly mobileInput: Locator;
  /**
   * The message box. Found by id: its label points to "contact-us-message", not to the box's
   * id "message", so the box has no accessible name (see messageByLabel).
   */
  readonly messageInput: Locator;
  /** The message box as assistive technology would find it from its "Message" label. */
  readonly messageByLabel: Locator;
  readonly labels: Locator;
  readonly sendButton: Locator;
  /** "Your message was sent successfully!" line under Send. */
  readonly successMessage: Locator;
  /** Illustration beside the form (desktop layout only). */
  readonly illustration: Locator;
  /**
   * Header button that opens the navigation menu on phone screens. The menu has no Contact Us
   * link (nor do the header, footer or other pages), so the form is opened by its URL.
   */
  readonly menuButton: Locator;

  constructor(
    page: Page,
    language: Language,
    /** True on touch devices: taps instead of clicks. */
    private readonly isMobile = false,
  ) {
    super(page, language);
    this.document = page.locator('html');
    this.heading = page.getByRole('heading', { level: 1, name: this.t('contactUsHeading') });
    this.form = page.locator('form.contact-us-form');
    this.hydratedForm = page.locator('app-contact-us:not([ngh]) form.contact-us-form');
    this.nameInput = this.form.getByLabel(this.t('contactUsNameLabel'), { exact: true });
    this.emailInput = this.form.getByLabel(this.t('contactUsEmailLabel'), { exact: true });
    this.mobileInput = this.form.getByLabel(this.t('contactUsMobileLabel'), { exact: true });
    this.messageInput = this.form.locator('textarea#message');
    this.messageByLabel = this.form.getByLabel(this.t('contactUsMessageLabel'), { exact: true });
    this.labels = this.form.locator('label');
    this.sendButton = this.form.getByRole('button', { name: this.t('send'), exact: true });
    this.successMessage = page.locator('.success-msg-text');
    this.illustration = page.locator('app-contact-us .illustration');
    this.menuButton = page.locator('header .burger-menu-open-icon-wrapper');
  }

  /**
   * Opens the form and waits until it responds to input. The page is rendered on the server and
   * then hydrated: until Angular removes the component's "ngh" marker, the form is visible but
   * typing and leaving fields does nothing.
   */
  async goto(): Promise<void> {
    await this.open(WebsiteContactUsPage.path);
    await this.hydratedForm.waitFor();
  }

  input(field: ContactField): Locator {
    return {
      name: this.nameInput,
      email: this.emailInput,
      mobile: this.mobileInput,
      message: this.messageInput,
    }[field];
  }

  /** The error line under a field (absent while the field is valid or untouched). */
  error(field: ContactField): Locator {
    const wrapper = { name: 'name', email: 'email', mobile: 'phone', message: 'message' }[field];
    // div.error under the form's fields (the input itself also gets an "error" class while
    // invalid); the mobile number component renders its own div.error-message instead.
    return this.form.locator(
      `.${wrapper}-field-wrapper :is(div.error, app-mobile-number-input .error-message)`,
    );
  }

  /** Taps (touch devices) or clicks an element. */
  private async press(target: Locator): Promise<void> {
    if (this.isMobile) await target.tap();
    else await target.click();
  }

  /**
   * Types a value into a field the way a user does: tap or click, then type. Mobile Number is
   * typed key by key, because its input mask drops characters set all at once.
   */
  async enter(field: ContactField, value: string): Promise<void> {
    const input = this.input(field);
    await this.press(input);
    await input.clear();
    if (field === 'mobile') await input.pressSequentially(value);
    else await input.fill(value);
  }

  /** Moves focus into a field and out again without typing, which shows its error. */
  async touch(field: ContactField): Promise<void> {
    await this.press(this.input(field));
    await this.input(field).blur();
  }

  /** Leaves a field (the form checks values when a field loses focus). */
  async leave(field: ContactField): Promise<void> {
    await this.input(field).blur();
  }

  async fillForm(message: Omit<ContactMessage, 'stamp'>): Promise<void> {
    await this.enter('name', message.name);
    await this.enter('email', message.email);
    await this.enter('mobile', message.phone);
    await this.enter('message', message.message);
    await this.leave('message');
  }

  /** Presses Send and returns the HTTP status of the submit request. */
  async send(): Promise<number> {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/contact-form/submit'),
    );
    await this.press(this.sendButton);
    return (await response).status();
  }

  /** How many pixels the page is wider than the viewport (0 when nothing scrolls sideways). */
  async horizontalOverflow(): Promise<number> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }
}
