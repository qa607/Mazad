import type { AndroidDriver } from '@mobile/android.session';
import { restartApp } from '@mobile/android.session';
import type { AppShellScreen } from '@mobile/screens/app-shell.screen';
import type { ContactFormScreen } from '@mobile/screens/contact-form.screen';
import type { HelpCenterScreen } from '@mobile/screens/help-center.screen';
import type { Language } from '@typings';

export interface ContactFormRoute {
  language: Language;
  /** Language option labels in More → Language. */
  languageOptions: Record<Language, string>;
  helpCenterLabel: string;
  /** A Help Center category name (from GET /v1/faq-list). */
  categoryName: string;
  contactUsLabel: string;
  formTitle: string;
}

/**
 * Opens the Contact Form from a fresh app start: restart, close a launch announcement, set the
 * language, then More → Help Center → category → Contact Us. Each test starts here, so tests
 * do not depend on the screen a previous one left open.
 */
export async function openContactForm(
  driver: AndroidDriver,
  screens: { appShell: AppShellScreen; helpCenter: HelpCenterScreen; form: ContactFormScreen },
  route: ContactFormRoute,
): Promise<void> {
  const { appShell, helpCenter, form } = screens;
  await restartApp(driver);
  await appShell.waitUntilReady();
  await appShell.dismissAnnouncement();
  await appShell.setLanguage(route.language, route.languageOptions);
  // The app recreates its screens after a language change, which can show the sheet again.
  await appShell.dismissAnnouncement();
  await appShell.open('more');
  await helpCenter.open(route.helpCenterLabel);
  await helpCenter.openCategory(route.categoryName);
  await helpCenter.openContactUs(route.contactUsLabel);
  await form.waitUntilOpen(route.formTitle);
}
