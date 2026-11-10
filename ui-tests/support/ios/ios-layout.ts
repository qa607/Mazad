import type { Severity } from '../findings';
import type { IosElement } from '../../../src/mobile/ios/page-source';

export { type IosElement, parseIosSource } from '../../../src/mobile/ios/page-source';

export interface IosIssue {
  rule: string;
  severity: Severity;
  component: string;
  expected: string;
  actual: string;
}

const TEXT_TYPES = new Set(['StaticText', 'Button', 'TextField', 'SecureTextField', 'Link']);

const describe = (e: IosElement) => `${e.type} "${(e.label || e.name || e.value).slice(0, 40)}"`;
const right = (e: IosElement) => e.x + e.width;
const bottom = (e: IosElement) => e.y + e.height;
const contains = (a: IosElement, b: IosElement) =>
  a.x <= b.x && a.y <= b.y && right(a) >= right(b) && bottom(a) >= bottom(b);
const intersects = (a: IosElement, b: IosElement) =>
  a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);

export interface IosLayoutOptions {
  language: 'en' | 'ar';
  /** Field that has the keyboard focus, when the keyboard check applies. */
  focusedField?: IosElement;
  /** The screen's primary button (Log In, Send...), for the keyboard check. */
  primaryButton?: IosElement;
}

/**
 * Layout rules on the page source. iOS reports full labels even when the text is truncated on
 * screen, so truncation and line count are left to the screenshot comparison (as on Android).
 * - off-screen (error): text-bearing element extends past the window horizontally
 * - text-overlap (error): two visible text-bearing elements overlap (neither contains the other)
 * - covered-by-keyboard (error) / button-under-keyboard (review): with the keyboard shown
 * - label-alignment (review): a label above a field does not start at the field's start edge
 *   (left in English, right in Arabic)
 */
export function findIosLayoutIssues(elements: IosElement[], options: IosLayoutOptions): IosIssue[] {
  const issues: IosIssue[] = [];
  const window = elements.find((e) => e.type === 'Window' && e.visible && e.width > 0);
  const keyboard = elements.find((e) => e.type === 'Keyboard' && e.visible && e.height > 0);
  const inKeyboard = (e: IosElement) => Boolean(keyboard && contains(keyboard, e));
  const texts = elements.filter(
    (e) => TEXT_TYPES.has(e.type) && e.visible && e.width > 0 && e.height > 0 && !inKeyboard(e),
  );

  if (window) {
    for (const e of texts) {
      if (e.x < window.x - 1 || right(e) > right(window) + 1) {
        issues.push({
          rule: 'off-screen',
          severity: 'error',
          component: describe(e),
          expected: `within 0–${window.width}pt`,
          actual: `spans ${e.x}–${right(e)}pt`,
        });
      }
    }
  }

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (contains(a, b) || contains(b, a) || !intersects(a, b)) continue;
      const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
      const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (w <= 2 || h <= 2 || w * h < smaller * 0.1) continue;
      issues.push({
        rule: 'text-overlap',
        severity: 'error',
        component: describe(a),
        expected: 'no overlapping text or controls',
        actual: `overlaps ${describe(b)}`,
      });
    }
  }

  if (keyboard) {
    if (options.focusedField && intersects(keyboard, options.focusedField)) {
      issues.push({
        rule: 'covered-by-keyboard',
        severity: 'error',
        component: describe(options.focusedField),
        expected: 'focused field visible above the keyboard',
        actual: `field bottom ${bottom(options.focusedField)}pt, keyboard top ${keyboard.y}pt`,
      });
    }
    if (options.primaryButton && intersects(keyboard, options.primaryButton)) {
      issues.push({
        rule: 'button-under-keyboard',
        severity: 'review',
        component: describe(options.primaryButton),
        expected: 'primary button reachable while typing (or after dismissing the keyboard)',
        actual: `button bottom ${bottom(options.primaryButton)}pt, keyboard top ${keyboard.y}pt`,
      });
    }
  }

  const fields = texts.filter((e) => e.type === 'TextField' || e.type === 'SecureTextField');
  const labels = texts.filter((e) => e.type === 'StaticText');
  for (const f of fields) {
    const label = labels
      .filter(
        (l) => bottom(l) <= f.y + 2 && f.y - bottom(l) <= 40 && right(l) > f.x && l.x < right(f),
      )
      .sort((a, b) => bottom(b) - bottom(a))[0];
    if (!label) continue;
    const offset = options.language === 'ar' ? right(f) - right(label) : label.x - f.x;
    if (Math.abs(offset) > 2) {
      issues.push({
        rule: 'label-alignment',
        severity: 'review',
        component: describe(label),
        expected: `label starts at the field's ${options.language === 'ar' ? 'right' : 'left'} edge (±2pt)`,
        actual: `offset ${offset}pt`,
      });
    }
  }
  return issues;
}
