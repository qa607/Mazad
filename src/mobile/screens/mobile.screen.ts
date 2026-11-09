import type { AndroidDriver } from '@mobile/android.session';
import { MAZAD_ANDROID_APP } from '@mobile/android.session';

/**
 * Parent of Android screen objects: element lookups and actions only, no assertions.
 * Prefers resource IDs; text lookups take the expected text from the caller (API or test data).
 */
export abstract class MobileScreen {
  constructor(protected readonly driver: AndroidDriver) {}

  /** Element by resource ID (without the package prefix). */
  protected byId(id: string) {
    return this.driver.$(`id=${MAZAD_ANDROID_APP.package}:id/${id}`);
  }

  /** Element whose visible text is exactly `text`. */
  byText(text: string) {
    return this.driver.$(`android=new UiSelector().text(${JSON.stringify(text)})`);
  }

  /** Element whose content description is exactly `description`. */
  protected byDescription(description: string) {
    return this.driver.$(`android=new UiSelector().description(${JSON.stringify(description)})`);
  }
}
