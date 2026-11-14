import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';
import {
  getSelectedAndroidInputMethod,
  withArabicUnicodeIme,
} from '@mobile/inspection-android/inspection-android.session';
import {
  type ElementBounds,
  chipElementsAfterLabel,
  editTexts,
  isAncestorButtonEnabled,
  mediaBoxesAfterLabel,
} from '@mobile/inspection-android/accessibility-xml';

/**
 * The 18 vehicle components this tab asks about (confirmed live 2026-11-14, B2B type - not yet
 * re-confirmed for Photography/Salvage). Discovered by scrolling the whole tab and reading each
 * component's own condition chips directly from the raw accessibility tree (see
 * chipElementsAfterLabel()) - not by assumption. The true count is 18, not the 17 first reported:
 * "Rear Right Fender" was missed by the first scroll pass (small-swipe granularity skipped over
 * it) and only found on a second, slower pass - the full set is symmetric (4 doors, 4 fenders), as
 * expected for a real vehicle.
 */
export const ESSENTIALS_BODY_COMPONENTS = [
  'Hood',
  'Engine',
  'Front Bumper',
  'Front Left Fender',
  'Front Left Door',
  'Airbags',
  'A/C',
  'Gear Box',
  'Roof',
  'Rear Left Door',
  'Rear Left Fender',
  'Rear Windshield Glass',
  'Rear Bumper',
  'Rear Right Fender',
  'Rear Right Door',
  'Front Right Door',
  'Front Right Fender',
  'Exhaust',
] as const;
export type EssentialsBodyComponent = (typeof ESSENTIALS_BODY_COMPONENTS)[number];

/**
 * Each component's own condition chips, confirmed live 2026-11-14 by reading them directly rather
 * than assuming a shared list - most body panels share the same 5, but bumpers add "Broken" and
 * the two "working/not working" style components use their own wording per component (Engine:
 * "Engine Malfunction", Gear Box: "Gearbox Malfunction"). Confirmed individually for every
 * component except Rear Right Door and Rear Right Fender, whose own chip rows never rendered
 * during the discovery scroll in time to be read - both are everywhere-else-identical to their
 * three sibling doors/fenders, so their lists below are inferred by that pattern, not individually
 * re-read; a live mismatch here would surface immediately as a selectCondition() failure (it
 * throws listing the real options when asked for one that is not offered).
 */
export const ESSENTIALS_BODY_CONDITIONS: Record<EssentialsBodyComponent, readonly string[]> = {
  Hood: ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  Engine: ['Working', 'Engine Malfunction'],
  'Front Bumper': ['Broken', 'Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Front Left Fender': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Front Left Door': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  Airbags: ['Opened', 'Not Opened'],
  'A/C': ['Working', 'Not Working'],
  'Gear Box': ['Working', 'Gearbox Malfunction'],
  Roof: ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Rear Left Door': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Rear Left Fender': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Rear Windshield Glass': ['Broken', 'Dents', 'Normal'],
  'Rear Bumper': ['Broken', 'Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Rear Right Fender': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'], // inferred, see above
  'Rear Right Door': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'], // inferred, see above
  'Front Right Door': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  'Front Right Fender': ['Painted', 'Crashed', 'Scratches', 'Dents', 'Normal'],
  Exhaust: ['Smoke', 'No Smoke'],
};

/** Components confirmed live (screenshot evidence, not inferred) to offer a second, video capture
 * slot alongside the always-present photo one. Every other component offers photo only. The
 * pattern is clean: every mechanical/functional check has video, every body panel does not. */
export const VIDEO_CAPABLE_COMPONENTS: readonly EssentialsBodyComponent[] = [
  'Engine',
  'Airbags',
  'A/C',
  'Gear Box',
  'Exhaust',
];

/**
 * Vehicle "Essentials & Body" tab: a per-component damage/condition checklist (confirmed live
 * 2026-11-14, B2B type), the second of the three vehicle-creation tabs. Locked until Basic Info's
 * own Save & Continue succeeds; unlocks Photos once this tab's own Save & Continue succeeds.
 *
 * Structure per component, in document/scroll order: a plain (non-interactive) name label; a row
 * of clickable condition chips (see ESSENTIALS_BODY_CONDITIONS); one or two dashed capture boxes
 * (photo always, plus video for VIDEO_CAPABLE_COMPONENTS) with no text of their own (icon only);
 * and a clickable "Notes" row (confirmed live to be itself clickable, presumably expanding a
 * free-text field - not yet exercised by this project's own automation). After the 18th component
 * (Exhaust) comes a non-repeating "General Notes" section with two plain write fields, "Add Note
 * (Arabic)" and "Add Note (English)" - the end of the tab.
 *
 * Validation rule confirmed live: Save & Continue starts disabled on a freshly opened tab and
 * becomes enabled the moment ANY ONE condition chip is selected on ANY ONE component - every
 * individual component's own round badge stays grey regardless (unlike Basic Info, no component
 * here is individually "required"; confirmed by selecting only Hood's "Normal" and reading Save's
 * own enabled state both before and after via isAncestorButtonEnabled(), not by the badge, which
 * is a read-only (and, same as Basic Info, Compose-a11y-unreliable: a chip's own `selected`
 * attribute does not update when tapped, confirmed live) visual indicator only - never assert
 * component or chip "selected" state from the accessibility tree, only from behaviour (Save's own
 * enabled state) or from a screenshot.
 */
export class VehicleEssentialsBodyScreen extends InspectionAndroidScreen {
  get saveAndContinueButton() {
    return this.byText('Save & Continue');
  }

  /** Same enabled-state caveat as Basic Info's isSaveEnabled(): read from the raw accessibility
   * tree's `enabled` attribute on Save & Continue's own clickable ancestor, never the button's
   * visual color. */
  async isSaveEnabled(): Promise<boolean> {
    return isAncestorButtonEnabled(await this.driver.getPageSource(), 'Save & Continue') === true;
  }

  async save(): Promise<void> {
    await this.scrollToText('Save & Continue');
    await this.tapElement(this.saveAndContinueButton);
  }

  /** Collapses internal whitespace too, not just leading/trailing: confirmed live some chip text
   * carries a double space (e.g. "Engine  Malfunction") that is cosmetic rendering, not meaning. */
  private static normalizeChipText(s: string): string {
    return s.trim().replace(/\s+/g, ' ');
  }

  /**
   * All clickable condition chips currently in `component`'s own row, scrolling it into view
   * first and retrying once (one small swipe, then re-finding the label with scrollToText() -
   * which itself resets to the top and searches forward again if the swipe scrolled the label
   * away entirely) if the very first read comes back with nothing at all.
   *
   * Confirmed live: scrollToText() only guarantees the label itself is present on screen, not
   * that there is room below it for its own content to have rendered yet - a component scrolled
   * to land near the bottom edge reads back a completely empty chip list, not a merely-incomplete
   * one (its row is simply not composed yet), the same class of gap as Basic Info's sticky-footer
   * tap issue, just for *reading* instead of *tapping*. Reacting only when the read is genuinely
   * empty (rather than pre-emptively nudging based on the label's own screen position) proved far
   * more robust in practice: a position-based threshold either nudged components that already had
   * plenty of room, or overshot and scrolled the label away entirely - both confirmed live across
   * this tab's 18 components, whose own content heights vary a lot (one or two media boxes).
   */
  private async chipsInView(
    component: EssentialsBodyComponent,
  ): Promise<{ text: string; bounds: ElementBounds }[]> {
    await this.scrollToText(component);
    let chips = chipElementsAfterLabel(await this.driver.getPageSource(), component);
    if (chips.length === 0) {
      await this.smallSwipe('down');
      await this.waitForUiIdle(500);
      await this.scrollToText(component);
      chips = chipElementsAfterLabel(await this.driver.getPageSource(), component);
    }
    return chips;
  }

  /**
   * The exact condition chip labels currently offered for `component`, read live rather than
   * assumed - use this (not ESSENTIALS_BODY_CONDITIONS directly) in any test that itself verifies
   * the option list, so a real app change is what fails the test, not a hardcoded table going
   * stale silently.
   *
   * A component's chip row can itself scroll horizontally, and this app only composes whatever is
   * currently visible in it (confirmed live: a bumper's 6th option, "Normal", sits off the right
   * edge and is simply absent from the tree until swiped into view) - if the rightmost chip found
   * reaches the screen's own right edge, one horizontal swipe reveals anything further along,
   * merged into the result rather than replacing it (the swipe can scroll chips already seen off
   * the LEFT edge instead).
   */
  async conditionOptions(component: EssentialsBodyComponent): Promise<string[]> {
    const chips = await this.chipsInView(component);
    const texts = new Set(chips.map((c) => VehicleEssentialsBodyScreen.normalizeChipText(c.text)));
    if (await this.chipRowLikelyCutOff(chips)) {
      await this.swipeChipRow(chips);
      const after = chipElementsAfterLabel(await this.driver.getPageSource(), component);
      for (const c of after) texts.add(VehicleEssentialsBodyScreen.normalizeChipText(c.text));
    }
    return [...texts];
  }

  /** Taps the chip matching `condition` within `component`'s own row (scrolling the row itself
   * horizontally first if the plain read doesn't offer it and the row looks cut off - see
   * conditionOptions()'s doc comment). Does not verify the selection took effect - see this
   * class's own doc comment on why that cannot be read from the accessibility tree; a caller that
   * needs proof uses isSaveEnabled() (if this is the first selection on the whole tab) or a
   * screenshot. */
  async selectCondition(component: EssentialsBodyComponent, condition: string): Promise<void> {
    const normalize = (s: string) => VehicleEssentialsBodyScreen.normalizeChipText(s);
    let chips = await this.chipsInView(component);
    let chip = chips.find((c) => normalize(c.text) === normalize(condition));
    if (!chip && (await this.chipRowLikelyCutOff(chips))) {
      await this.swipeChipRow(chips);
      chips = chipElementsAfterLabel(await this.driver.getPageSource(), component);
      chip = chips.find((c) => normalize(c.text) === normalize(condition));
    }
    if (!chip) {
      throw new Error(
        `"${component}" does not offer "${condition}". Options: ${chips.map((c) => normalize(c.text)).join(', ')}`,
      );
    }
    await this.tapCenterOf(chip.bounds);
    await this.driver.pause(400);
  }

  /** Whether the rightmost of `chips` reaches the screen's own right edge, suggesting at least one
   * more chip may be scrolled out of view beyond it. */
  private async chipRowLikelyCutOff(chips: { bounds: ElementBounds }[]): Promise<boolean> {
    if (chips.length === 0) return false;
    const { width } = await this.driver.getWindowSize();
    const rightmost = Math.max(...chips.map((c) => c.bounds.x2));
    return rightmost >= width - 20;
  }

  /** One horizontal swipe confined to a chip row's own y (so it never registers as the page's
   * vertical scroll instead). */
  private async swipeChipRow(chips: { bounds: ElementBounds }[]): Promise<void> {
    const { width } = await this.driver.getWindowSize();
    const y = Math.round((chips[0].bounds.y1 + chips[0].bounds.y2) / 2);
    await this.driver
      .action('pointer')
      .move({ x: Math.round(width * 0.9), y })
      .down()
      .pause(80)
      .move({ duration: 300, x: Math.round(width * 0.15), y })
      .pause(80)
      .up()
      .perform();
    await this.driver.pause(500);
  }

  /** Taps the photo (default) or video capture slot for `component`. Throws if that kind of slot
   * is not offered (see VIDEO_CAPABLE_COMPONENTS) rather than silently tapping the wrong box. */
  async tapMediaSlot(
    component: EssentialsBodyComponent,
    kind: 'photo' | 'video' = 'photo',
  ): Promise<void> {
    await this.scrollToText(component);
    let boxes = mediaBoxesAfterLabel(await this.driver.getPageSource(), component);
    if (boxes.length === 0) {
      // Same not-composed-yet gap as chipsInView() - see its doc comment.
      await this.smallSwipe('down');
      await this.waitForUiIdle(500);
      await this.scrollToText(component);
      boxes = mediaBoxesAfterLabel(await this.driver.getPageSource(), component);
    }
    const index = kind === 'photo' ? 0 : 1;
    const box = boxes[index];
    if (!box) {
      throw new Error(
        `"${component}" has no ${kind} capture slot (found ${boxes.length} slot(s)).`,
      );
    }
    await this.tapCenterOf(box);
  }

  get generalNotesHeading() {
    return this.byText('General Notes');
  }

  /**
   * Writes a General Note in the given language, replacing whatever it currently shows.
   *
   * Confirmed live this field needs a different input mechanism from every other Write field in
   * this app: driver.keys() (this project's usual, most-reliable mechanism - see
   * InspectionAndroidScreen.typeReliably()) cannot type Arabic at all, since Android's
   * KeyCharacterMap has no physical key event for most non-Latin characters and throws rather
   * than dropping them; setValue() leaves the field empty even for plain English, on a first
   * touch, unlike every other field in this app where it is at least reliable once. addValue()
   * is the verified entry path. For Arabic only, the input helper temporarily selects Appium's
   * Unicode IME and restores the preselected Samsung Keyboard immediately afterward; the
   * session itself leaves Samsung Keyboard active for normal text entry.
   */
  async writeGeneralNote(language: 'ar' | 'en', text: string): Promise<string> {
    const label = language === 'ar' ? 'Add Note (Arabic)' : 'Add Note (English)';
    await this.scrollToText(label);
    const labelY = (await this.byText(label).getLocation()).y;
    const allEditTexts = editTexts(await this.driver.getPageSource());
    const index = allEditTexts.findIndex((e) => e.bounds.y1 >= labelY - 10);
    if (index === -1) throw new Error(`No EditText found below "${label}".`);
    const box = allEditTexts[index].bounds;
    const element = this.driver.$(
      `android=new UiSelector().className("android.widget.EditText").instance(${index})`,
    );
    let result = '';

    const enter = async () => {
      await this.tapCenterOf(box);
      await this.driver.pause(400);
      await element.addValue(text);

      // Retried, not a single read: confirmed live that addValue() can return before the field's
      // own accessibility text has actually updated to reflect it.
      const deadline = Date.now() + 5_000;
      do {
        result = await element.getText();
        if (result === text) break;
        await this.driver.pause(300);
      } while (Date.now() < deadline);
      await this.hideKeyboardIfShown();
    };
    if (language === 'ar') {
      await withArabicUnicodeIme(enter);
      if (!getSelectedAndroidInputMethod().includes('com.samsung.android.honeyboard')) {
        throw new Error('Samsung Keyboard was not restored after Arabic General Notes entry.');
      }
    } else {
      await enter();
    }
    return result;
  }

  private async tapCenterOf(box: ElementBounds): Promise<void> {
    const x = Math.round((box.x1 + box.x2) / 2);
    const y = Math.round((box.y1 + box.y2) / 2);
    await this.driver.action('pointer').move({ x, y }).down().pause(80).up().perform();
  }
}
