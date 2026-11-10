import type { Page } from '@playwright/test';
import type { Severity } from './findings';

/** A problem found in the page, tied to an element marked with data-ui-finding="<marker>". */
export interface PageIssue {
  rule: string;
  severity: Severity;
  component: string;
  expected: string;
  actual: string;
  marker: number;
}

export interface LayoutRuleOptions {
  /** CSS selector to limit the checks to one component; the whole page when omitted. */
  root?: string;
  language: 'en' | 'ar';
  /** First marker number, so several rule sets can mark elements on the same page. */
  markerStart?: number;
}

/**
 * Text-layout rules (item 10): clipping, truncation, wrapping, overlap, off-screen content and
 * RTL direction/alignment, plus drawn images that failed to load. Spacing and colour details
 * are left to the pixel comparison, which catches them without inventing design rules.
 *
 * Severity: hard clipping, overlap, off-screen text, page-level horizontal scroll, wrong text
 * direction and drawn images that did not load are errors. Ellipsis/line-clamp truncation and wrapped controls are "review",
 * because they may be intentional design.
 */
export async function findLayoutIssues(
  page: Page,
  options: LayoutRuleOptions,
): Promise<PageIssue[]> {
  return page.evaluate(
    async ({ root, language, markerStart }) => {
      const issues: {
        rule: string;
        severity: 'error' | 'review';
        component: string;
        expected: string;
        actual: string;
        marker: number;
      }[] = [];
      let marker = markerStart;
      const rootEl: Element | null = root ? document.querySelector(root) : document.body;
      if (!rootEl) {
        issues.push({
          rule: 'component-missing',
          severity: 'error',
          component: root ?? 'body',
          expected: 'component present',
          actual: 'not found',
          marker: -1,
        });
        return issues;
      }
      const vw = document.documentElement.clientWidth;
      const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

      const describe = (el: Element): string => {
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
        const host = el.closest('header, footer, nav, main, section, form, [role="dialog"]');
        const where = host && host !== el ? `${host.tagName.toLowerCase()} › ` : '';
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${where}${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
      };
      const markEl = (el: Element): number => {
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
        issues.push({
          rule,
          severity,
          component: describe(el),
          expected,
          actual,
          marker: markEl(el),
        });

      const isVisible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        }
        return true;
      };
      const ownTextRect = (el: Element): DOMRect | null => {
        const rects: DOMRect[] = [];
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(...range.getClientRects());
        }
        const real = rects.filter((r) => r.width > 0 && r.height > 0);
        if (!real.length) return null;
        const left = Math.min(...real.map((r) => r.left));
        const top = Math.min(...real.map((r) => r.top));
        const right = Math.max(...real.map((r) => r.right));
        const bottom = Math.max(...real.map((r) => r.bottom));
        return new DOMRect(left, top, right - left, bottom - top);
      };
      const lineCount = (el: Element): number => {
        const tops = new Set<number>();
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
        }
        return tops.size;
      };
      const clipsX = (s: CSSStyleDeclaration) => s.overflowX === 'hidden' || s.overflowX === 'clip';
      const clipsY = (s: CSSStyleDeclaration) => s.overflowY === 'hidden' || s.overflowY === 'clip';
      /** Nearest ancestor that hides overflow or scrolls (carousels, scroll strips). */
      const clippingAncestor = (el: Element): Element | null => {
        for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return e;
        }
        return null;
      };

      // Page-level horizontal scroll (whole-page checks only).
      if (!root && document.documentElement.scrollWidth > vw + 1) {
        add(
          document.documentElement,
          'page-horizontal-overflow',
          'error',
          `no horizontal scroll at ${vw}px`,
          `content is ${document.documentElement.scrollWidth}px wide`,
        );
      }

      const textEls = [...rootEl.querySelectorAll('*'), rootEl].filter(
        (el) =>
          [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) &&
          !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) &&
          isVisible(el),
      );

      const boxes: { el: Element; rect: DOMRect }[] = [];
      for (const el of textEls) {
        const s = getComputedStyle(el);
        const he = el as HTMLElement;
        const rect = ownTextRect(el);
        if (!rect) continue;
        boxes.push({ el, rect });
        const text = (el.textContent ?? '').trim();

        // Truncation and clipping inside the element itself.
        const overflowsX = he.scrollWidth > he.clientWidth + 1 && he.clientWidth > 0;
        const overflowsY = he.scrollHeight > he.clientHeight + 1 && he.clientHeight > 0;
        if (s.textOverflow === 'ellipsis' && overflowsX) {
          add(
            el,
            'text-truncated',
            'review',
            'full text visible',
            `ellipsis; needs ${he.scrollWidth}px, has ${he.clientWidth}px`,
          );
        } else if (s.webkitLineClamp && s.webkitLineClamp !== 'none' && overflowsY) {
          add(
            el,
            'text-line-clamped',
            'review',
            'full text visible',
            `clamped to ${s.webkitLineClamp} line(s)`,
          );
        } else if ((clipsX(s) && overflowsX) || (clipsY(s) && overflowsY)) {
          add(
            el,
            'text-clipped',
            'error',
            'text fits its box',
            `needs ${he.scrollWidth}x${he.scrollHeight}px, box is ${he.clientWidth}x${he.clientHeight}px`,
          );
        }

        // Partly cut off by a container that hides overflow (fully hidden carousel slides are fine).
        const clipper = clippingAncestor(el);
        if (clipper) {
          const c = clipper.getBoundingClientRect();
          const cs = getComputedStyle(clipper);
          const outside =
            rect.right <= c.left ||
            rect.left >= c.right ||
            rect.bottom <= c.top ||
            rect.top >= c.bottom;
          const cutX = clipsX(cs) && (rect.left < c.left - 1 || rect.right > c.right + 1);
          const cutY = clipsY(cs) && (rect.top < c.top - 1 || rect.bottom > c.bottom + 1);
          if (!outside && (cutX || cutY)) {
            add(
              el,
              'text-clipped-by-container',
              'error',
              'text inside its container',
              `cut by ${describe(clipper).slice(0, 60)}`,
            );
          }
        } else if (rect.right > vw + 1 || rect.left < -1) {
          add(
            el,
            'text-off-screen',
            'error',
            `text within 0–${vw}px`,
            `text spans ${Math.round(rect.left)}–${Math.round(rect.right)}px`,
          );
        }

        // Controls whose label wraps.
        if (el.closest('button, a, label, [role="button"], [role="tab"], th')) {
          const lines = lineCount(el);
          if (lines > 1)
            add(el, 'control-text-wrapped', 'review', 'label on one line', `${lines} lines`);
        }

        // Direction and alignment of Arabic text.
        if (language === 'ar' && ARABIC.test(text)) {
          if (s.direction !== 'rtl')
            add(el, 'rtl-direction', 'error', 'direction: rtl', `direction: ${s.direction}`);
          else if (s.textAlign === 'left' && s.display !== 'inline') {
            add(
              el,
              'rtl-alignment',
              'review',
              'start/right alignment in Arabic',
              'text-align: left',
            );
          }
        }
      }

      // Images that are drawn on the page but did not load (broken, or still not loaded after
      // stabilize). Images that are not drawn (hidden, zero size, fully clipped) are ignored.
      const drawnImage = (img: HTMLImageElement): boolean => {
        const r = img.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || !isVisible(img)) return false;
        const left = r.left + window.scrollX;
        if (left + r.width <= 0 || left >= document.documentElement.scrollWidth) return false;
        for (let e = img.parentElement; e && e !== document.documentElement; e = e.parentElement) {
          const es = getComputedStyle(e);
          if (es.overflowX === 'visible' && es.overflowY === 'visible') continue;
          const c = e.getBoundingClientRect();
          if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) {
            return false;
          }
        }
        return true;
      };
      const images = [
        ...rootEl.querySelectorAll('img'),
        ...(rootEl instanceof HTMLImageElement ? [rootEl] : []),
      ];
      for (const img of images.filter(drawnImage)) {
        const src = (img.currentSrc || img.src || '').replace(/[?#].*$/, '').slice(-80);
        if (!img.complete) {
          add(img, 'image-not-loaded', 'error', 'image loaded', `still loading: ${src}`);
          continue;
        }
        const ok = await img.decode().then(
          () => true,
          () => false,
        );
        if (!ok) add(img, 'image-not-loaded', 'error', 'image loaded', `failed to load: ${src}`);
      }

      // Overlapping text: two text boxes intersect and one is not drawn over the other on purpose.
      const limited = boxes.slice(0, 500);
      for (let i = 0; i < limited.length; i++) {
        for (let j = i + 1; j < limited.length; j++) {
          const a = limited[i];
          const b = limited[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (w <= 2 || h <= 2) continue;
          const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
          if (w * h < smaller * 0.1) continue;
          const x = Math.max(a.rect.left, b.rect.left) + w / 2;
          const y = Math.max(a.rect.top, b.rect.top) + h / 2;
          const top = document.elementFromPoint(x, y);
          if (
            top &&
            !a.el.contains(top) &&
            !b.el.contains(top) &&
            !top.contains(a.el) &&
            !top.contains(b.el)
          )
            continue;
          add(
            a.el,
            'text-overlap',
            'error',
            'no overlapping text',
            `overlaps ${describe(b.el).slice(0, 60)}`,
          );
          markEl(b.el);
        }
      }
      return issues;
    },
    {
      root: options.root ?? null,
      language: options.language,
      markerStart: options.markerStart ?? 0,
    },
  );
}
