/**
 * Small helpers for reading UiAutomator2's raw page-source XML directly. Used only for the few
 * things WebdriverIO's element API cannot answer on this app: whether a specific button is
 * currently `enabled` (Compose does not reliably reflect a disabled button's visual state through
 * a plain `isEnabled()` check the way standard widgets do - confirmed live), and what value
 * currently shows in the row immediately below a given field label.
 */

/**
 * Finds the nearest `clickable="true"` ancestor element that appears before `text` in document
 * order, and returns its `enabled` attribute. Returns null if `text` or no such ancestor is
 * found. This mirrors how XML document order reflects the Compose tree here: a button's own
 * clickable ancestor node appears before its child text node in the raw page source.
 */
export function isAncestorButtonEnabled(xml: string, text: string): boolean | null {
  const idx = xml.indexOf(`text="${escapeXml(text)}"`);
  if (idx === -1) return null;
  const before = xml.slice(0, idx);
  const matches = [...before.matchAll(/<[^>]*clickable="true"[^>]*enabled="(true|false)"[^>]*>/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1] === 'true';
}

/**
 * Bounds of the nearest `clickable="true"` ancestor of `buttonText`, scoped to the row identified
 * by `rowKeyText` (e.g. a VIN number) - i.e. "the 'Sign & Complete' button for this specific
 * vehicle", not just the first one anywhere on screen. Needed because Home's own lists (In
 * Progress / Completed / Not Sent) can and do hold many vehicles at once; an unscoped search would
 * silently act on the wrong row's button once more than one vehicle is present.
 *
 * Scoped by document position: from `rowKeyText`'s own occurrence up to (but not including) the
 * next `text="VIN Number"` label after it - the label every row in these lists starts with,
 * confirmed live - or the end of the source if `rowKeyText` is in the last row currently rendered.
 * Returns null if `rowKeyText` or `buttonText` (within that bound) is not found.
 */
export function rowActionBounds(
  xml: string,
  rowKeyText: string,
  buttonText: string,
): ElementBounds | null {
  const rowIdx = xml.indexOf(`text="${escapeXml(rowKeyText)}"`);
  if (rowIdx === -1) return null;
  const nextRowIdx = xml.indexOf('text="VIN Number"', rowIdx + 1);
  const region = xml.slice(rowIdx, nextRowIdx === -1 ? xml.length : nextRowIdx);
  const btnIdx = region.indexOf(`text="${escapeXml(buttonText)}"`);
  if (btnIdx === -1) return null;
  const before = region.slice(0, btnIdx);
  const matches = [
    ...before.matchAll(/<[^>]*clickable="true"[^>]*bounds="\[(\d+),(\d+)]\[(\d+),(\d+)]"[^>]*>/g),
  ];
  const last = matches.at(-1);
  if (!last) return null;
  return { x1: Number(last[1]), y1: Number(last[2]), x2: Number(last[3]), y2: Number(last[4]) };
}

/**
 * Reads the plain text values that appear between one field label and the next, in document
 * order - i.e. everything inside that field's own row(s): its current value, placeholder, and
 * any option list opened beneath it. Used to confirm what a Select/Write field currently shows,
 * and to list a Select field's offered options for data-driven test assertions.
 *
 * Uses the LAST occurrence of `label` in the page source, not the first: confirmed live that
 * right after picking a Select option, this app's Compose tree can briefly contain two copies of
 * the same label - one from the outgoing composition, already disposed of everything after it
 * except the page's own sticky footer, and one from the new, correctly-populated one. Taking the
 * first occurrence can therefore read straight through the stale node to "Save & Continue"
 * instead of the field's real, freshly-set value a little further down.
 */
export function textsAfterLabel(xml: string, label: string, nextLabel?: string): string[] {
  const start = xml.lastIndexOf(`text="${escapeXml(label)}"`);
  if (start === -1) return [];
  const end = nextLabel ? xml.indexOf(`text="${escapeXml(nextLabel)}"`, start + 1) : xml.length;
  const region = xml.slice(start, end === -1 ? xml.length : end);
  return [...region.matchAll(/text="([^"]*)"/g)]
    .map((m) => unescapeXml(m[1]))
    .filter((t) => t && t !== label);
}

/**
 * All plain text values in document order, each including every repeat (duplicates kept) - used
 * as the raw input to `newTextsOpenedBy`.
 */
function allTexts(xml: string): string[] {
  return [...xml.matchAll(/text="([^"]*)"/g)].map((m) => unescapeXml(m[1])).filter((t) => t);
}

/**
 * The text values present in `afterXml` but not in `beforeXml` - i.e. whatever a tap newly drew
 * on screen, regardless of whether that control is a searchable list (a "Search" box above plain
 * text options, e.g. City), a plain list with no search (e.g. Usage, Supplier), or a numeric
 * wheel (e.g. Cylinders). This replaces anchoring on a "Search" label, which only the first kind
 * of control has - confirmed live: a plain list (Usage) opened with none, so that anchor silently
 * found zero options instead of the four real ones.
 *
 * Counts occurrences rather than just set membership, so an option whose text also happens to
 * appear elsewhere already on screen (unlikely here, but not impossible) is still detected if the
 * list repeats it.
 */
export function newTextsOpenedBy(beforeXml: string, afterXml: string): string[] {
  const beforeCounts = countBy(allTexts(beforeXml));
  const afterTexts = allTexts(afterXml);
  const remaining = new Map(beforeCounts);
  const added: string[] = [];
  for (const text of afterTexts) {
    const remainingCount = remaining.get(text) ?? 0;
    if (remainingCount > 0) {
      remaining.set(text, remainingCount - 1);
    } else {
      added.push(text);
    }
  }
  return added;
}

export interface ElementBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Bounds of every `android.widget.EditText` currently in the tree, in document order. Used to
 * find the input box belonging to a specific label geometrically (the one whose top edge sits
 * just below the label), since this app can show more than one "Write" field on screen at once
 * and a bare className lookup always matches the first one in document order, not necessarily the
 * one that was just tapped.
 */
export function editTextBounds(xml: string): ElementBounds[] {
  return editTexts(xml).map((e) => e.bounds);
}

/** Every `android.widget.EditText`'s bounds and current text, in document order. */
export function editTexts(xml: string): { bounds: ElementBounds; text: string }[] {
  const results: { bounds: ElementBounds; text: string }[] = [];
  const re = /<android\.widget\.EditText\b([^>]*)\/?>/g;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1];
    const bounds = /\bbounds="\[(\d+),(\d+)]\[(\d+),(\d+)]"/.exec(attrs);
    const text = /\btext="([^"]*)"/.exec(attrs);
    if (!bounds) continue;
    results.push({
      bounds: {
        x1: Number(bounds[1]),
        y1: Number(bounds[2]),
        x2: Number(bounds[3]),
        y2: Number(bounds[4]),
      },
      text: text ? unescapeXml(text[1]) : '',
    });
  }
  return results;
}

/** Every element that carries both a `bounds` and a `text` attribute, in document order. */
function textElements(xml: string): { bounds: ElementBounds; text: string }[] {
  const results: { bounds: ElementBounds; text: string }[] = [];
  const re = /<[a-zA-Z0-9._]+\s([^>]*)\/?>/g;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1];
    const text = /\btext="([^"]*)"/.exec(attrs);
    if (!text || !text[1]) continue;
    const bounds = /\bbounds="\[(\d+),(\d+)]\[(\d+),(\d+)]"/.exec(attrs);
    if (!bounds) continue;
    results.push({
      bounds: {
        x1: Number(bounds[1]),
        y1: Number(bounds[2]),
        x2: Number(bounds[3]),
        y2: Number(bounds[4]),
      },
      text: unescapeXml(text[1]),
    });
  }
  return results;
}

/**
 * The text value in the row geometrically closest below a given label, found by screen position
 * rather than document order. Confirmed live that document-order text search (the original
 * approach) is not reliable for this: a label's text can appear to have more than one copy in the
 * raw page source at once (most plausibly two overlapping Compose compositions during a
 * recomposition), and simple "first" or "last" occurrence picks the wrong one often enough to
 * matter - including reading straight through to the page's own sticky "Save & Continue" footer.
 * Returns undefined if the label itself cannot be found.
 */
export function valueBelowLabel(xml: string, label: string): string | undefined {
  const elements = textElements(xml);
  const labelElements = elements.filter((e) => e.text === label);
  if (labelElements.length === 0) return undefined;
  // If the label itself appears more than once (the scenario this function exists for), try
  // each occurrence's own closest-below value in turn and take the first one that is not empty
  // and not the label text itself - the stale copy's "closest below" is usually nothing at all
  // (it has nothing left under it) or the sticky footer, which a real field's own row never is.
  for (const labelElement of labelElements) {
    const below = elements
      .filter((e) => e.bounds.y1 >= labelElement.bounds.y1 && e.text !== label)
      .sort((a, b) => a.bounds.y1 - b.bounds.y1)[0];
    if (below && below.text !== 'Save & Continue') return below.text;
  }
  return undefined;
}

/**
 * Clickable chip elements (bounds + text) between `label`'s own occurrence and the next
 * `boundaryLabel` after it - e.g. an Essentials & Body component's own condition chips, which sit
 * between that component's name and its "Notes" sub-label.
 *
 * Matches `label` as a prefix inside the quotes, not an exact `text="${label}"` string: confirmed
 * live that several of these labels carry a trailing tab character in their own raw attribute
 * (e.g. `text="Front Bumper&#9;"`, presumably a layout artifact, not meaningful content).
 */
export function chipElementsAfterLabel(
  xml: string,
  label: string,
  boundaryLabel = 'Notes',
): { text: string; bounds: ElementBounds }[] {
  const labelMatch = new RegExp(`text="${escapeRegExp(label)}[^"]*"`).exec(xml);
  if (!labelMatch) return [];
  const boundaryIdx = xml.indexOf(`text="${boundaryLabel}"`, labelMatch.index);
  const region = xml.slice(labelMatch.index, boundaryIdx === -1 ? xml.length : boundaryIdx);
  const chips: { text: string; bounds: ElementBounds }[] = [];
  for (const m of region.matchAll(/<android\.widget\.TextView\b([^>]*)\/>/g)) {
    const attrs = m[1];
    if (!/clickable="true"/.test(attrs)) continue;
    const text = /text="([^"]*)"/.exec(attrs)?.[1];
    const bounds = /\bbounds="\[(\d+),(\d+)]\[(\d+),(\d+)]"/.exec(attrs);
    if (!text || !bounds) continue;
    chips.push({
      text: unescapeXml(text),
      bounds: {
        x1: Number(bounds[1]),
        y1: Number(bounds[2]),
        x2: Number(bounds[3]),
        y2: Number(bounds[4]),
      },
    });
  }
  return chips;
}

/**
 * Media capture slot bounds (photo always first, video second when offered) between `label`'s own
 * occurrence and the next `boundaryLabel` after it - e.g. an Essentials & Body component's own
 * camera/video boxes, which sit between its condition chips and its "Notes" sub-label.
 *
 * These boxes carry no text of their own (just an icon), so they are found structurally instead:
 * confirmed live each is a leaf (self-closing, no children) `android.view.View` with
 * `clickable="true"` and an empty `text`, which distinguishes them from that same region's other
 * `android.view.View` elements - the chip row's own wrapping container (not a leaf, so never
 * self-closing) and the "Notes" row's wrapping container (also not a leaf: it wraps the "Notes"
 * TextView itself, which is why the region search below - ending right at that TextView - never
 * reaches far enough to include the Notes wrapper's own closing tag).
 */
export function mediaBoxesAfterLabel(
  xml: string,
  label: string,
  boundaryLabel = 'Notes',
): ElementBounds[] {
  const labelMatch = new RegExp(`text="${escapeRegExp(label)}[^"]*"`).exec(xml);
  if (!labelMatch) return [];
  const boundaryIdx = xml.indexOf(`text="${boundaryLabel}"`, labelMatch.index);
  const region = xml.slice(labelMatch.index, boundaryIdx === -1 ? xml.length : boundaryIdx);
  const boxes: ElementBounds[] = [];
  for (const m of region.matchAll(/<android\.view\.View\b([^>]*)\/>/g)) {
    const attrs = m[1];
    if (!/clickable="true"/.test(attrs) || !/text=""/.test(attrs)) continue;
    const bounds = /\bbounds="\[(\d+),(\d+)]\[(\d+),(\d+)]"/.exec(attrs);
    if (!bounds) continue;
    boxes.push({
      x1: Number(bounds[1]),
      y1: Number(bounds[2]),
      x2: Number(bounds[3]),
      y2: Number(bounds[4]),
    });
  }
  return boxes;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#9;/g, '\t')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
