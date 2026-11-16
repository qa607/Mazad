import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';
import {
  type ElementBounds,
  editTexts,
  isAncestorButtonEnabled,
  newTextsOpenedBy,
  valueBelowLabel,
} from '@mobile/inspection-android/accessibility-xml';

/** Chrome text that can appear freshly once a selector opens but is never itself an option. */
const NON_OPTION_TEXT = new Set(['Search']);

/** Strips the cosmetic auto-formatting some Write fields apply (thousand-separator commas on
 * Mileage, spaces stripped on Plate Number), so a typed value and its echoed-back display can be
 * compared for an actual mismatch rather than formatting. */
function normalizeTypedValue(s: string | undefined): string | undefined {
  return s?.replace(/[,\s]/g, '');
}

/**
 * Vehicle "Basic Info" tab of the vehicle creation form (confirmed live 2026-11-12/13, B2B type).
 * One of three tabs (Basic Info / Essentials & Body / Photos); the other two are locked until
 * this one's own "Save & Continue" succeeds, which in turn is disabled until every required
 * field below has a value.
 *
 * Field order and section grouping as rendered (sections are the app's own "Basic Info N"
 * dividers; required fields show a round check-mark badge next to the label, which fills in
 * teal once given a value; "(Optional)" fields never show the badge):
 *
 *   1: Vehicle Description (write), Usage (select), City (searchable select), Location (write)
 *   2: Supplier (select), Company (select) - CORRECTION 2026-11-14: Company IS required.
 *        Confirmed live (screenshot evidence, not just a field-value read) that its own badge
 *        stays grey/unsatisfied, with the field still literally showing "Select", even after
 *        Supplier is chosen and every other field on the tab is filled and satisfied - the
 *        earlier note here claiming it auto-populates and can be skipped was wrong and has been
 *        removed; it depends on Supplier (network-loaded, like a Select field whose options come
 *        from a server call made only once opened) and must be explicitly picked like any other
 *        required Select.
 *      Warehouse (select) - another dependent field, confirmed live 2026-11-14: only appears once
 *        Company is set (same pattern as Model/Year below), unsatisfied ("Select") until picked.
 *   3: Make (select), Model (select, see below), Year (select), Grade (write)
 *      Model and Year are both dependent-select fields, confirmed live 2026-11-14: before Make is
 *      chosen, the field immediately below it shows a generic, not-yet-populated "Year" label
 *      with no options; once Make is set, that SAME field's own label changes to "Model" and now
 *      offers Make-specific options - a real, separate "Year" field (actual model years) only
 *      appears below it once Model itself is set. Calling selectOption('Year') before Model was
 *      picked therefore silently operates on the Model field instead (reading its own label at
 *      that moment), leaving the real Year never set and Save & Continue permanently disabled -
 *      Model must be selected first, in this order, every time.
 *   4: Body Color (select), Interior Color (select), Mileage (write), Plate Number (write)
 *   5: Transmission (select), Engine Type (select),
 *        Cylinders (numeric-wheel select) and Engine Size (write) - CONDITIONAL: confirmed live
 *        to appear once Engine Type is set to "Diesel" (the only value tried so far). Whether
 *        they stay hidden for every other Engine Type value, "Electric" included, is not yet
 *        confirmed on the Android app itself - do not assume it from the backend's naming alone.
 *      Body Type (select), Serial Number (write, optional)
 *   6: Roof (select), Number of Doors (select), Number of Seats (select), Number of Keys (write)
 *      - confirmed live 2026-11-13 to be the end of the tab (immediately followed by
 *      "Save & Continue"), closing the earlier discovery gap.
 *
 * Cross-referenced 2026-11-13 against the Mazad V3 Backend's own vehicle edit form
 * (`/backend/vehicle/vehicle/update`, model `VehicleSellit` - the same underlying record this
 * app's vehicles sync to/from), which exposes the same fields under different names and gives
 * their full option lists without needing the device. Backend field -> Android label, full
 * option lists (not yet re-confirmed as the Android app's own exhaustive list - only the values
 * actually selected live are confirmed there; treat the rest as "backend-confirmed, Android
 * pending re-verification"):
 *   usage_id -> Usage: Public Transport, Private, Private Transport, Public Work
 *   fuel_type_id -> Engine Type: Diesel, Petrol, Hybrid, Electric, PHEV, Mild Hybrid
 *   cylinder_id -> Cylinders: 0-16 (all confirmed present)
 *   transmission_id -> Transmission: Manual, Automatic (only these two)
 *   body_type_id -> Body Type: 24 options incl. "Equipment- Sweeper" (confirmed exact match)
 *   roof_id -> Roof: Sun Roof, T-tops, Standard roof, Roof Rails, Sun Roof With Roof Rails,
 *     Panoramic Roof, Panoramic with Sun Roof, Carbon Fiber Roof
 *   exterior_color_id -> Body Color, interior_color_id -> Interior Color: the same 16 colours
 *     (Beige, Black, Blue, Brown, Cream, Gold, Green, Grey, Orange, Pink, Purple, Red, Silver,
 *     Turquoise, White, Yellow)
 *   door_id -> Number of Doors: 1-10; seat_id -> Number of Seats: 2-10
 *   no_of_keys -> Number of Keys: free text on the backend too (not a select)
 *   make_id -> Make: ~95 manufacturers; model_id -> Year: depends on the selected make (not
 *     independently enumerable)
 *   year -> Year: 2000-2027
 *
 * Backend fields with NO confirmed Android counterpart yet (candidates for the Essentials & Body
 * tab, or for a specific inspection type only - not yet investigated, do not assume placement):
 * gear_box_id (4-10 Speed, CVT), horsepower, torque, fuel_average, charging_voltage_id (EV),
 * range_per_charge (EV), air_bag_id, break_type_id, title/title_en/sub_title/sub_title_en (the
 * Android "Title" field shows "-" and was never confirmed independently editable), claim_number,
 * transporter, note. claim_number and transporter in particular suggest Salvage-specific fields
 * (insurance-claim vehicles); note was previously found, in the Inspection Backend web app, to
 * live inside a conditionally-hidden `#photography-fields` section - both are plausible hints for
 * per-type field differences in the Android app, not yet confirmed there.
 */
export class VehicleBasicInfoScreen extends InspectionAndroidScreen {
  get saveAndContinueButton() {
    return this.byText('Save & Continue');
  }

  /** True only once every required field in this tab has a value (confirmed via the raw
   * accessibility tree's `enabled` attribute, not the button's visual color - the two have been
   * confirmed live to disagree: the button looks identical whether enabled or disabled). */
  async isSaveEnabled(): Promise<boolean> {
    const xml = await this.driver.getPageSource();
    return isAncestorButtonEnabled(xml, 'Save & Continue') ?? false;
  }

  async save(): Promise<void> {
    await this.scrollToText('Save & Continue');
    await this.tapElement(this.saveAndContinueButton);
  }

  /**
   * Fills a free-text field by its label: scrolls it into view, taps its input box (the row
   * immediately below the label), types the value, and verifies the box now shows it.
   */
  async writeField(label: string, value: string): Promise<void> {
    await this.waitForUiIdle();
    await this.scrollToText(label);
    const labelY = await this.tapBelowElement(label);
    // Not a plain class-name lookup: confirmed live that more than one "Write" field (EditText)
    // can be on screen at once (e.g. Vehicle Description and Location together), and a bare
    // className selector always matches the first one in document order - silently typing into
    // the wrong field while the intended one stays empty. `focused(true)` was tried and is also
    // unreliable here (a raw coordinate tap does not reliably flip the accessibility "focused"
    // attribute the way a real click does, even though the field visibly gains the keyboard).
    // The one actually tapped is instead found geometrically, straight from the raw page source
    // (not a WebdriverIO element handle - this app's lazily re-measuring tree made a held element
    // reference across a clear-and-retype loop unreliable; a fresh selector built from the live
    // bounds each attempt is not).
    await this.typeByBoundsBelow(labelY, value);
    await this.hideKeyboardIfShown();
    await this.driver.pause(400); // keyboard-close animation settle - see selectOption().
    await this.waitForUiIdle();

    // Some fields auto-format what was typed (e.g. Mileage adds thousand-separator commas:
    // "50000" -> "50,000"; Plate Number strips spaces: "ABJ 1234" -> "ABJ1234") - see the matching
    // comment in typeByBoundsBelow().
    const actual = await this.fieldValue(label);
    if (normalizeTypedValue(actual) !== normalizeTypedValue(value)) {
      throw new Error(`"${label}" shows "${actual}" after writing "${value}".`);
    }
  }

  /**
   * Opens a Select field by its label and picks the option matching `optionText` (or, when
   * omitted, the first real option offered - recorded in the thrown-away discovery scripts this
   * screen replaces, for building type-specific test data without hardcoding a single hand-picked
   * value in the page object).
   */
  async selectOption(label: string, optionText?: string): Promise<string> {
    const options = await this.openSelector(label);
    const choice = optionText ?? options[0];
    if (!choice) throw new Error(`"${label}" offered no options.`);
    if (optionText && !options.includes(optionText)) {
      throw new Error(`"${label}" does not offer "${optionText}". Options: ${options.join(', ')}`);
    }
    return this.pickFromOpenSelector(label, choice);
  }

  /** Picks `choice` from a Select field whose options are already open (via openSelector()), and
   * verifies the field now shows it. */
  private async pickFromOpenSelector(label: string, choice: string): Promise<string> {
    await this.tapText(choice);
    await this.hideKeyboardIfShown();
    // The sheet's own close animation is still visually sliding for a short moment after the
    // accessibility tree already reads as closed (confirmed live: waitForUiIdle's tree-based
    // check alone was not enough - a scroll gesture run immediately after intermittently landed
    // on the still-animating sheet instead of the main list, leaving the next field's scrollIntoView
    // unable to find it at all, even after resetting to the top). A short settle covers the gap
    // waitForUiIdle's text-only comparison cannot see.
    await this.driver.pause(400);
    await this.waitForUiIdle();

    // Retried, not a single read: confirmed live that right after picking, the field's own value
    // row can momentarily not be composed yet in the lazy column - fieldValue() itself is now a
    // geometric (bounds-based) lookup robust to stale/duplicate label copies (see
    // valueBelowLabel()), but the real value can still take a moment to render at all.
    const deadline = Date.now() + 15_000;
    let actual: string | undefined;
    do {
      actual = await this.fieldValue(label);
      if (actual === choice) return choice;
      await this.driver.pause(300);
    } while (Date.now() < deadline);
    throw new Error(`"${label}" shows "${actual}" after selecting "${choice}".`);
  }

  /**
   * Opens a Select field by its label and returns the options it offers, leaving the selector
   * open (the caller, e.g. selectOption(), picks one next).
   *
   * Finds options by diffing the page source before and after the tap, rather than anchoring on
   * a "Search" label: confirmed live that only some Select fields are searchable (e.g. City) -
   * others are a plain list (Usage, Supplier, ...) or a numeric wheel (Cylinders) with no search
   * box at all, so anchoring on "Search" silently returned zero options for those.
   */
  async openSelector(label: string): Promise<string[]> {
    await this.waitForUiIdle();
    await this.scrollToText(label);
    const before = await this.driver.getPageSource();
    await this.tapBelowElement(label);
    await this.driver
      .waitUntil(async () => (await this.driver.getPageSource()) !== before, { timeout: 3_000 })
      .catch(() => undefined); // Falls through to the empty-options result below if it never opened.

    // Some Select fields populate their options from a network call made only once opened (e.g.
    // Company, which depends on the Supplier just chosen) - confirmed live that the sheet can
    // render fully open, with zero options yet, before that call resolves, and that this can take
    // noticeably longer than other fields' local option lists. A close-and-reopen retry was tried
    // here and made things worse: confirmed live that this sheet's own "back" closes the whole
    // New Vehicle flow, not just the sheet (the same way City's sheet does) - so a caller seeing
    // an empty result here should treat it as this field's own current state, not retry blindly.
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const after = await this.driver.getPageSource();
      const options = newTextsOpenedBy(before, after).filter(
        (t) => t !== label && !NON_OPTION_TEXT.has(t),
      );
      if (options.length > 0) return options;
      await this.driver.pause(300);
    }
    return [];
  }

  /** The value currently shown in a field's own row - its Select value, its Write text, or the
   * literal placeholder ("Select" / "Write") when still empty. */
  async fieldValue(label: string): Promise<string | undefined> {
    await this.scrollToText(label);
    const xml = await this.driver.getPageSource();
    return valueBelowLabel(xml, label);
  }

  /** True when the field's round status badge shows teal/filled rather than grey/empty - i.e.
   * the app itself considers the field satisfied. Read from the badge's own accessible state
   * (`checked`), not color, since color cannot be read from the accessibility tree. */
  async isFieldSatisfied(label: string): Promise<boolean> {
    const value = await this.fieldValue(label);
    return value !== undefined && value !== 'Select' && value !== 'Write';
  }

  /**
   * Taps the control in the row below a label, re-reading the label's bounds at call time (the
   * vertical offset from label to control is fixed in this app's layout, but the label's own
   * screen position is not - it depends on scroll state, so it is always re-read, never cached).
   * Returns the label's own (possibly adjusted, see below) y position, for a caller that needs it
   * for its own subsequent lookup (e.g. writeField()'s closestEditTextBelow()).
   *
   * Confirmed live (2026-11-14): a label that scrolls to sit within roughly the bottom quarter of
   * the screen has the row below it - where its own control normally is - actually occupied by
   * the sticky "Save & Continue" footer instead (its own clickable bounds were observed starting
   * around 91% of screen height). The tap meant for the control lands on that footer instead -
   * silently doing nothing when the footer is disabled, exactly as "offered no options" or a
   * typing attempt that never focuses anything looks from the caller's side, with no error raised
   * at the tap itself. One extra small swipe repositions the label clear of that zone first.
   */
  private async tapBelowElement(label: string): Promise<number> {
    const { height } = await this.driver.getWindowSize();
    let location = await this.byText(label).getLocation();
    if (location.y > height * 0.75) {
      await this.smallSwipe('down');
      await this.waitForUiIdle(1_000);
      location = await this.byText(label).getLocation();
    }
    await this.driver
      .action('pointer')
      .move({ x: 540, y: Math.round(location.y + 90) })
      .down()
      .pause(80)
      .up()
      .perform();
    return location.y;
  }

  /** The EditText whose top edge is closest below `labelY` - i.e. the input box belonging to the
   * label that was just tapped, disambiguating when more than one "Write" field is visible at
   * once. Always read fresh from the given page source, never a held element handle: confirmed
   * live that a held handle can go stale the moment the field's text changes, in this app's
   * frequently re-measuring Compose tree. */
  private closestEditTextBelow(
    xml: string,
    labelY: number,
  ): { bounds: ElementBounds; text: string } {
    const boxes = editTexts(xml);
    if (boxes.length === 0) throw new Error(`No EditText on screen at all (label y=${labelY}).`);
    const below = boxes.filter((b) => b.bounds.y1 >= labelY - 10);
    return (
      below.sort((a, b) => a.bounds.y1 - b.bounds.y1)[0] ??
      boxes.sort((a, b) => Math.abs(a.bounds.y1 - labelY) - Math.abs(b.bounds.y1 - labelY))[0]
    );
  }

  private async tapCenterOf(box: ElementBounds): Promise<void> {
    const x = Math.round((box.x1 + box.x2) / 2);
    const y = Math.round((box.y1 + box.y2) / 2);
    await this.driver.action('pointer').move({ x, y }).down().pause(80).up().perform();
  }

  /**
   * Types `value` into the EditText whose top edge is closest below `labelY`, retrying
   * (clear-and-retype) until it reads back exactly - for normal data entry, where the field is
   * expected to accept the value as given (give or take formatting - see `normalize`).
   */
  private async typeByBoundsBelow(labelY: number, value: string, maxAttempts = 3): Promise<void> {
    // Some fields auto-format what is typed - e.g. Mileage adds thousand-separator commas
    // ("50000" -> "50,000"), Plate Number strips spaces ("ABJ 1234" -> "ABJ1234") - both confirmed
    // live. normalizeTypedValue() strips both before comparing, treating that as a match rather
    // than endlessly retyping a value the field will never echo back verbatim.
    const normalize = normalizeTypedValue;

    await this.tapCenterOf(
      this.closestEditTextBelow(await this.driver.getPageSource(), labelY).bounds,
    );
    // A short settle before typing: confirmed live elsewhere (other fields) that typing
    // immediately after a tap can drop the first keystroke before focus has fully landed.
    await this.driver.pause(600);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const current = this.closestEditTextBelow(await this.driver.getPageSource(), labelY);
      if (normalize(current.text) === normalize(value)) return;
      for (let i = 0; i < current.text.length; i++) await this.driver.pressKeyCode(67); // KEYCODE_DEL
      await this.driver.pause(200);
      for (const char of value) await this.driver.keys([char]);
      await this.driver.pause(300);
      if (
        normalize(this.closestEditTextBelow(await this.driver.getPageSource(), labelY).text) ===
        normalize(value)
      ) {
        return;
      }
    }
    const final = this.closestEditTextBelow(await this.driver.getPageSource(), labelY).text;
    throw new Error(
      `Could not type "${value}" below y=${labelY} (shows "${final}" after ${maxAttempts} attempts).`,
    );
  }

  /**
   * Types `value` into a Write field once and returns whatever the field now shows, without
   * asserting it matches what was typed. For tests that deliberately probe the field's own input
   * filtering (e.g. Plate Number's restricted Saudi-plate letter set), where the typed text is
   * expected NOT to be echoed back verbatim - using writeField()/typeByBoundsBelow() there would
   * just retry forever against a value the field will never accept.
   */
  async typeFieldOnceAndReadBack(label: string, value: string): Promise<string> {
    await this.waitForUiIdle();
    await this.scrollToText(label);
    const labelY = await this.tapBelowElement(label);
    await this.tapCenterOf(
      this.closestEditTextBelow(await this.driver.getPageSource(), labelY).bounds,
    );
    await this.driver.pause(600); // Same first-keystroke settle as typeByBoundsBelow().
    for (const char of value) await this.driver.keys([char]);
    await this.driver.pause(500);
    const result = this.closestEditTextBelow(await this.driver.getPageSource(), labelY).text;
    await this.hideKeyboardIfShown();
    return result;
  }
}
