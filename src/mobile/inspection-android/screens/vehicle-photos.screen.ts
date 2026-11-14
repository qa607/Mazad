import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';
import {
  getSelectedAndroidInputMethod,
  withArabicUnicodeIme,
} from '@mobile/inspection-android/inspection-android.session';
import {
  editTexts,
  isAncestorButtonEnabled,
  mediaBoxesAfterLabel,
} from '@mobile/inspection-android/accessibility-xml';

/**
 * The four required vehicle-angle photos this tab asks for, followed by a "Complete Inspection"
 * action - no per-section Notes, no video option anywhere on this tab (unlike Essentials & Body,
 * where photo vs photo+video varies by component - every section here is photo-only). Below
 * these, an "Additional Images (Optional)" group holds further named slots that do not gate
 * "Complete Inspection" - not modeled here since nothing in scope exercises them yet.
 *
 * Confirmed live 2026-11-14: the same four sections (Front, Left Side, Back, Right Side) are
 * required for both B2B and Photography (Salvage not yet independently confirmed, assumed to
 * match) - the "Optional" group below them does differ by type (B2B: "Hood Opened"/"Steering With
 * Gauges On"; Photography: "Damages"/"Dashboard"). An earlier pass wrongly concluded Photography
 * had only three sections (no "Back") from a page-source scroll scan that never actually composed
 * the "Back" row at the scroll positions sampled - the same LazyColumn-only-composes-what's-visible
 * gap already known from Essentials & Body's chip rows (see that screen's own doc comment) applies
 * here too; a screenshot at the right scroll position confirmed "Back" is present for Photography.
 */
export const PHOTO_SECTIONS = ['Front', 'Left Side', 'Back', 'Right Side'] as const;
export type PhotoSection = (typeof PHOTO_SECTIONS)[number];
export interface PhotoNotes {
  arabic: string;
  english: string;
}
export interface PhotoNoteScreenEvidence {
  source: string;
  screenshotBase64: string;
}

/**
 * Vehicle "Photos" tab: four required directional photos, then "Complete Inspection" (confirmed
 * live 2026-11-14, B2B type). The third of the three vehicle-creation tabs; locked until
 * Essentials & Body's own Save & Continue succeeds.
 *
 * Each section's own capture flow (confirmed live, a real end-to-end run through every step):
 *   1. Tap the section's empty slot (a single dashed camera-icon box, no text) - opens a real
 *      in-app camera screen (a genuine `android.view.SurfaceView` live feed, not an external Camera
 *      app intent - confirmed live the foreground activity never changes). This screen exposes
 *      exactly two controls, neither with any text (located by fixed proportional screen position,
 *      confirmed stable across repeated runs on this one physical device - Galaxy S25 Ultra,
 *      1080x2340 - the same convention already used for the Home screen's FAB): a close ("X") in
 *      the top-left corner, and a circular shutter button at the bottom center.
 *   2. Tapping the shutter opens an "Edit Image" review screen (Scale/Rotate controls, confirmed
 *      live not required to touch) with a sticky "Continue" button at the bottom.
 *   3. Tapping "Continue" opens a per-photo note screen ("Add Note (Arabic)"/"Add Note (English)",
 *      confirmed live both optional - a fresh photo's own "Save" button is already enabled with
 *      neither field touched) with a sticky "Save" button at the bottom.
 *   4. Tapping "Save" returns to the Photos tab with that section now filled.
 *
 * A filled section's own media-box count goes from 1 (the empty camera placeholder) to 3: the
 * thumbnail itself, a second box of identical bounds overlapping it (confirmed live, not yet
 * understood further - possibly a tap target layered over the image), and a third, smaller box
 * positioned at the thumbnail's top-right corner - confirmed live this third box is a remove
 * control: tapping it deletes the photo immediately, no confirmation dialog, reverting the section
 * back to a single empty box. Tapping the thumbnail area itself (the first box) instead reopens the
 * same camera flow as a fresh capture - i.e. retake, with no separate menu or confirmation step.
 *
 * Camera preview frames and freshly-captured review images both render as solid black in an
 * Appium/ADB screenshot even though the live device shows a real feed/image - a well-known
 * limitation of capturing a hardware-composited `SurfaceView`/camera bitmap this way, not a sign
 * the camera itself failed; do not treat a black capture-flow screenshot alone as evidence of a
 * defect.
 */
export class VehiclePhotosScreen extends InspectionAndroidScreen {
  get completeInspectionButton() {
    return this.byText('Complete Inspection');
  }

  async isCompleteInspectionEnabled(): Promise<boolean> {
    return (
      isAncestorButtonEnabled(await this.driver.getPageSource(), 'Complete Inspection') === true
    );
  }

  /** Whether `section` currently shows a captured photo (3 media boxes) rather than the empty
   * placeholder (1 box) - see this class's own doc comment for why 3, not 2. */
  async isFilled(section: PhotoSection): Promise<boolean> {
    await this.scrollToText(section);
    const nextLabel = PHOTO_SECTIONS[PHOTO_SECTIONS.indexOf(section) + 1] ?? 'Complete Inspection';
    const boxes = mediaBoxesAfterLabel(await this.driver.getPageSource(), section, nextLabel);
    return boxes.length > 1;
  }

  /**
   * Captures a real photo for `section` using the physical camera (tap slot -> shutter -> Continue
   * -> Save, see this class's own doc comment) - works equally for a first capture (empty slot) or
   * a retake (filled slot: tapping the existing thumbnail reopens the same flow). Optional
   * `notes` fills and verifies both language fields before saving.
   *
   * Confirmed live (2026-11-14): this multi-screen, fixed-pause flow occasionally does not land (the
   * section stays/returns to its empty 1-box state even though the flow visibly returned to the
   * Photos tab without error) - a low-frequency flake, not a defect confirmed in a dedicated retry
   * (same class of flake as Basic Info's rare "Make" scroll miss). Verifies the section actually
   * ended up filled and retries the whole flow once before giving up, rather than silently leaving a
   * required section empty.
   */
  async capturePhoto(
    section: PhotoSection,
    notes?: PhotoNotes,
    onNotesDisplayed?: (evidence: PhotoNoteScreenEvidence) => Promise<void>,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.captureOnce(section, notes, onNotesDisplayed);
      if (await this.isFilled(section)) return;
      if (attempt === 2) {
        throw new Error(`"${section}" is still not filled after 2 capture attempts.`);
      }
    }
  }

  private async captureOnce(
    section: PhotoSection,
    notes?: PhotoNotes,
    onNotesDisplayed?: (evidence: PhotoNoteScreenEvidence) => Promise<void>,
  ): Promise<void> {
    await this.scrollToText(section);
    const nextLabel = PHOTO_SECTIONS[PHOTO_SECTIONS.indexOf(section) + 1] ?? 'Complete Inspection';
    const boxes = mediaBoxesAfterLabel(await this.driver.getPageSource(), section, nextLabel);
    const slot = boxes[0];
    if (!slot) throw new Error(`"${section}" has no capture slot at all.`);
    await this.tapCenterOf(slot);
    await this.driver.pause(1_500); // Camera warm-up before the shutter is safe to tap.

    await this.tapProportional(0.5, 0.915); // Shutter.
    await this.driver.pause(2_000); // Photo processing before "Edit Image" renders.

    await this.tapProportional(0.5, 0.935); // "Continue" on the Edit Image screen.
    await this.driver.pause(1_500);

    if (notes) {
      const source = await this.driver.getPageSource();
      if (!source.includes('Add Note (Arabic)') || !source.includes('Add Note (English)')) {
        throw new Error(
          'The photo note screen did not expose both Arabic and English note fields.',
        );
      }
      await this.writePhotoNote('Arabic', notes.arabic);
      await this.writePhotoNote('English', notes.english);
      await this.hideKeyboardIfShown();
      const noteSource = await this.driver.getPageSource();
      if (!noteSource.includes(notes.arabic) || !noteSource.includes(notes.english)) {
        throw new Error(
          'The photo note fields did not retain the entered Arabic and English text.',
        );
      }
      await onNotesDisplayed?.({
        source: noteSource,
        screenshotBase64: await this.driver.takeScreenshot(),
      });
    }

    await this.tapProportional(0.5, 0.937); // "Save" on the per-photo note screen.
    await this.driver.pause(2_000);
  }

  /** Uses Samsung Keyboard for English and temporarily selects Appium Unicode IME for Arabic
   * only; the prior keyboard is restored immediately after the field is entered. */
  private async writePhotoNote(language: 'Arabic' | 'English', value: string): Promise<void> {
    const label = `Add Note (${language})`;
    const labelY = (await this.byText(label).getLocation()).y;
    const inputs = editTexts(await this.driver.getPageSource());
    const index = inputs.findIndex((input) => input.bounds.y1 >= labelY - 10);
    if (index < 0) throw new Error(`No photo note input was found below "${label}".`);
    const input = this.driver.$(
      `android=new UiSelector().className("android.widget.EditText").instance(${index})`,
    );
    let actual = '';
    const enter = async () => {
      await this.tapCenterOf(inputs[index].bounds);
      await input.addValue(value);

      const deadline = Date.now() + 5_000;
      do {
        actual = await input.getText();
        if (actual === value) break;
        await this.driver.pause(300);
      } while (Date.now() < deadline);
      await this.hideKeyboardIfShown();
    };
    if (language === 'Arabic') {
      await withArabicUnicodeIme(enter);
      if (!getSelectedAndroidInputMethod().includes('com.samsung.android.honeyboard')) {
        throw new Error('Samsung Keyboard was not restored after Arabic photo-note entry.');
      }
    } else {
      await enter();
    }
    if (actual !== value) throw new Error(`The "${label}" field did not retain the entered text.`);
  }

  /** Cancels an in-progress capture (the camera screen's own "X", top-left) - confirmed live this
   * is a plain close with no confirmation prompt. */
  async cancelCapture(): Promise<void> {
    await this.tapProportional(0.083, 0.082);
    await this.driver.pause(1_000);
  }

  /** Deletes `section`'s photo via its own remove control (confirmed live: no confirmation
   * dialog). Throws if the section is not currently filled. */
  async removePhoto(section: PhotoSection): Promise<void> {
    await this.scrollToText(section);
    const nextLabel = PHOTO_SECTIONS[PHOTO_SECTIONS.indexOf(section) + 1] ?? 'Complete Inspection';
    const boxes = mediaBoxesAfterLabel(await this.driver.getPageSource(), section, nextLabel);
    const removeBox = boxes[2];
    if (!removeBox) throw new Error(`"${section}" is not filled (found ${boxes.length} box(es)).`);
    await this.tapCenterOf(removeBox);
    await this.driver.pause(800);
  }

  private async tapProportional(xFraction: number, yFraction: number): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    await this.driver
      .action('pointer')
      .move({ x: Math.round(width * xFraction), y: Math.round(height * yFraction) })
      .down()
      .pause(80)
      .up()
      .perform();
  }

  private async tapCenterOf(box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }): Promise<void> {
    const x = Math.round((box.x1 + box.x2) / 2);
    const y = Math.round((box.y1 + box.y2) / 2);
    await this.driver.action('pointer').move({ x, y }).down().pause(80).up().perform();
  }
}
