import type { Locator, Page } from '@playwright/test';
import type { PageIssue } from './layout-rules';

export interface FormGeometryOptions {
  /** The form's input fields, in visual order. */
  fields: Locator[];
  /** The form's primary button (for example Login or Send). */
  primary: Locator;
  language: 'en' | 'ar';
  markerStart?: number;
}

const MARK = 'data-ui-geom';

async function mark(locators: Locator[], role: string): Promise<void> {
  for (const [i, locator] of locators.entries()) {
    await locator
      .first()
      .evaluate((el, value) => el.setAttribute('data-ui-geom', value), `${role}-${i}`);
  }
}

async function unmark(page: Page): Promise<void> {
  await page.evaluate((attr) => {
    document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
  }, MARK);
}

/**
 * Tags the smallest element that contains all the given elements with data-ui-shot="<name>",
 * and returns a locator for it (used for form screenshots). The attribute does not change
 * rendering.
 */
export async function commonContainer(
  page: Page,
  name: string,
  locators: Locator[],
): Promise<Locator> {
  await mark(locators, 'part');
  const found = await page.evaluate(
    ({ attr, shot }) => {
      const parts = [...document.querySelectorAll(`[${attr}]`)];
      if (!parts.length) return false;
      let container: Element | null = parts[0];
      while (container && !parts.every((p) => container!.contains(p))) {
        container = container.parentElement;
      }
      if (!container) return false;
      container.setAttribute('data-ui-shot', shot);
      return true;
    },
    { attr: MARK, shot: name },
  );
  await unmark(page);
  if (!found) throw new Error(`No common container for "${name}".`);
  return page.locator(`[data-ui-shot="${name}"]`);
}

/**
 * Form geometry checks, measured on the page (no design values are assumed):
 * - form-off-screen (error): the form does not fit the viewport width
 * - controls-overlap (error): two consecutive controls overlap vertically
 * - edges-not-aligned (review): fields and the primary button do not share left/right edges
 * - label-misaligned (review): a field's label does not start at the field's start edge
 *   (left in English, right in Arabic)
 * - tight-spacing (review): less than 4 px between consecutive controls
 * - tap-target-small (review): a control under 24x24 CSS px that also fails the WCAG 2.2 SC 2.5.8
 *   spacing exception (its 24px circle overlaps another target or another small target's circle)
 * - tap-target-small-spaced (review): under 24x24 CSS px but meets the spacing exception; reported
 *   for information, so small targets are never hidden
 * - direction-order (review): parts of a field (prefix, input, icon) are not laid out in the
 *   page's reading direction (DOM order left-to-right in English, right-to-left in Arabic)
 */
export async function findFormGeometryIssues(
  page: Page,
  options: FormGeometryOptions,
): Promise<PageIssue[]> {
  await mark(options.fields, 'field');
  await mark([options.primary], 'primary');
  const issues = await page.evaluate(
    ({ attr, language, markerStart }) => {
      const out: {
        rule: string;
        severity: 'error' | 'review';
        component: string;
        expected: string;
        actual: string;
        marker: number;
      }[] = [];
      let marker = markerStart;
      const rtl = language === 'ar';
      const px = (n: number) => `${Math.round(n)}px`;
      const describe = (el: Element) => {
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const id = el.id ? `#${el.id}` : '';
        return `${el.tagName.toLowerCase()}${id}${text ? ` "${text}"` : ''}`;
      };
      const markEl = (el: Element) => {
        const existing = el.getAttribute('data-ui-finding');
        if (existing) return Number(existing);
        marker += 1;
        el.setAttribute('data-ui-finding', String(marker));
        return marker;
      };
      const add = (
        el: Element,
        rule: string,
        severity: 'error' | 'review',
        expected: string,
        actual: string,
      ) =>
        out.push({ rule, severity, component: describe(el), expected, actual, marker: markEl(el) });
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      /**
       * The drawn box of a field: the input itself, or the nearest ancestor (max 4 levels), that
       * has a visible border or shadow. Fill colour alone is ignored: inputs are white by default.
       */
      const fieldBox = (input: Element): Element => {
        let e: Element | null = input;
        for (let i = 0; e && i < 5; i++, e = e.parentElement) {
          const s = getComputedStyle(e);
          const border =
            parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) > 0 &&
            s.borderTopStyle !== 'none';
          if (border || s.boxShadow !== 'none') return e;
        }
        return input;
      };
      const textRect = (el: Element): DOMRect | null => {
        const rects: DOMRect[] = [];
        for (const n of el.childNodes) {
          if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          rects.push(...[...range.getClientRects()].filter((r) => r.width > 0));
        }
        if (!rects.length) return null;
        const l = Math.min(...rects.map((r) => r.left));
        const t = Math.min(...rects.map((r) => r.top));
        return new DOMRect(
          l,
          t,
          Math.max(...rects.map((r) => r.right)) - l,
          Math.max(...rects.map((r) => r.bottom)) - t,
        );
      };

      const fields = [...document.querySelectorAll(`[${attr}^="field-"]`)];
      const primary = document.querySelector(`[${attr}="primary-0"]`);
      if (!fields.length || !primary) return out;
      const parts = [...fields, primary];
      let container: Element | null = parts[0];
      while (container && !parts.every((p) => container!.contains(p)))
        container = container.parentElement;
      if (!container) return out;

      const vw = document.documentElement.clientWidth;
      const c = container.getBoundingClientRect();
      if (c.left < -1 || c.right > vw + 1) {
        add(
          container,
          'form-off-screen',
          'error',
          `form within 0–${vw}px`,
          `form spans ${px(c.left)}–${px(c.right)}`,
        );
      }

      // Boxes in visual order: each field's drawn box, then the primary button.
      const boxes = [
        ...fields.map((f) => ({ el: fieldBox(f), input: f })),
        { el: primary, input: primary },
      ]
        .filter((b) => visible(b.el))
        .map((b) => ({ ...b, r: b.el.getBoundingClientRect() }))
        .sort((a, b) => a.r.top - b.r.top);

      // Shared edges.
      const lefts = boxes.map((b) => b.r.left);
      const rights = boxes.map((b) => b.r.right);
      const spreadL = Math.max(...lefts) - Math.min(...lefts);
      const spreadR = Math.max(...rights) - Math.min(...rights);
      if (boxes.length > 1 && (spreadL > 2 || spreadR > 2)) {
        add(
          primary,
          'edges-not-aligned',
          'review',
          'fields and primary button share left and right edges (±2px)',
          `left edges vary by ${px(spreadL)}, right edges by ${px(spreadR)}`,
        );
      }

      // Spacing and overlap between consecutive controls.
      for (let i = 1; i < boxes.length; i++) {
        const gap = boxes[i].r.top - boxes[i - 1].r.bottom;
        if (gap < -1) {
          add(
            boxes[i].el,
            'controls-overlap',
            'error',
            'no overlap with the control above',
            `overlaps by ${px(-gap)}`,
          );
        } else if (gap < 4) {
          add(
            boxes[i].el,
            'tight-spacing',
            'review',
            'at least 4px from the control above',
            `gap ${px(gap)}`,
          );
        }
      }

      // Labels: the nearest text element above each field box, within 48px.
      const candidates = [...container.querySelectorAll('*')].filter(
        (el) => visible(el) && textRect(el) && !el.closest(`[${attr}]`),
      );
      for (const b of boxes.filter((x) => x.input !== primary)) {
        let best: { el: Element; r: DOMRect; d: number } | null = null;
        for (const el of candidates) {
          if (b.el.contains(el)) continue;
          const r = textRect(el)!;
          const d = b.r.top - r.bottom;
          const overlapsX = r.right > b.r.left && r.left < b.r.right;
          if (d >= -2 && d <= 48 && overlapsX && (!best || d < best.d)) best = { el, r, d };
        }
        if (!best) continue;
        const offset = rtl ? b.r.right - best.r.right : best.r.left - b.r.left;
        if (Math.abs(offset) > 2) {
          add(
            best.el,
            'label-misaligned',
            'review',
            `label starts at the field's ${rtl ? 'right' : 'left'} edge (±2px)`,
            `offset ${px(offset)}`,
          );
        }
      }

      // Tap targets inside the form: WCAG 2.2 SC 2.5.8 (Target Size, Minimum), including its
      // spacing exception. A target under 24x24 CSS px still passes when a 24px-diameter circle
      // centred on its bounding box intersects no other target, and no such circle of another
      // undersized target. The inline, equivalent, user-agent and essential exceptions are not
      // evaluated. Both outcomes are reported, so an undersized target is never silently dropped.
      const TARGETS = 'button, a[href], input, [role="button"], select, textarea';
      const targets = [...document.querySelectorAll(TARGETS)]
        .filter(visible)
        .map((el) => ({ el, r: el.getBoundingClientRect() }));
      const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const small = (r: DOMRect) => r.width < 24 || r.height < 24;
      const related = (a: Element, b: Element) => a === b || a.contains(b) || b.contains(a);
      /** True when a circle (radius 12) at c overlaps rectangle r (touching does not count). */
      const circleHitsRect = (c: { x: number; y: number }, r: DOMRect) => {
        const dx = c.x - Math.max(r.left, Math.min(c.x, r.right));
        const dy = c.y - Math.max(r.top, Math.min(c.y, r.bottom));
        return dx * dx + dy * dy < 12 * 12;
      };
      for (const t of targets.filter((x) => container.contains(x.el) && small(x.r))) {
        const c = centre(t.r);
        const conflicts: string[] = [];
        for (const o of targets) {
          if (related(o.el, t.el)) continue;
          if (circleHitsRect(c, o.r)) {
            conflicts.push(`circle overlaps ${describe(o.el).slice(0, 50)}`);
          } else if (small(o.r)) {
            const oc = centre(o.r);
            if (Math.hypot(c.x - oc.x, c.y - oc.y) < 24) {
              conflicts.push(`circle overlaps the circle of ${describe(o.el).slice(0, 50)}`);
            }
          }
        }
        const size = `${px(t.r.width)}x${px(t.r.height)}`;
        if (conflicts.length) {
          add(
            t.el,
            'tap-target-small',
            'review',
            'at least 24x24px, or the 2.5.8 spacing exception',
            `${size}; spacing exception not met: ${conflicts.slice(0, 2).join('; ')}`,
          );
        } else {
          add(
            t.el,
            'tap-target-small-spaced',
            'review',
            'at least 24x24px, or the 2.5.8 spacing exception',
            `${size}; meets the spacing exception (24px circle touches no other target)`,
          );
        }
      }

      // Reading direction of the parts inside each field box (prefix, input, icon).
      for (const b of boxes.filter((x) => x.input !== primary)) {
        const kids = [...b.el.querySelectorAll('*')].filter((k) => {
          if (!visible(k)) return false;
          // Leaf-like parts only: no visible element children.
          return ![...k.children].some(visible);
        });
        const rects = kids.map((k) => ({ k, r: k.getBoundingClientRect() }));
        for (let i = 1; i < rects.length; i++) {
          const a = rects[i - 1];
          const n = rects[i];
          const sameLine = Math.min(a.r.bottom, n.r.bottom) - Math.max(a.r.top, n.r.top) > 4;
          if (!sameLine) continue;
          const wrong = rtl ? n.r.left > a.r.left + 1 : n.r.left < a.r.left - 1;
          if (wrong) {
            add(
              b.el,
              'direction-order',
              'review',
              `parts ordered ${rtl ? 'right-to-left' : 'left-to-right'} in DOM order`,
              `${describe(n.k)} follows ${describe(a.k)} in DOM order but is placed to its ${rtl ? 'right' : 'left'}`,
            );
            break;
          }
        }
      }
      return out;
    },
    { attr: MARK, language: options.language, markerStart: options.markerStart ?? 2000 },
  );
  await unmark(page);
  return issues;
}
