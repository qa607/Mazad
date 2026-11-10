import type { Page } from '@playwright/test';
import { LATIN_ALLOWED_IN_ARABIC, OTHER_LANGUAGE_SELECTORS } from '../data/ui-allowlists';
import type { PageIssue } from './layout-rules';

export interface L10nOptions {
  root?: string;
  language: 'en' | 'ar';
  markerStart?: number;
}

/**
 * Structural localization checks only (Phase 1 has no approved expected text):
 * - html lang and dir match the project language (error)
 * - raw translation keys or unrendered {{ }} placeholders in visible text (error)
 * - Latin-only interface text in Arabic, or Arabic interface text in English (review)
 * Interface text means header, footer, navigation, buttons, labels, links and placeholders.
 * Data such as car titles is not judged in Phase 1.
 */
export async function findL10nIssues(page: Page, options: L10nOptions): Promise<PageIssue[]> {
  return page.evaluate(
    ({ root, language, markerStart, latinAllowed, otherLanguageSelectors }) => {
      const issues: {
        rule: string;
        severity: 'error' | 'review';
        component: string;
        expected: string;
        actual: string;
        marker: number;
      }[] = [];
      let marker = markerStart;
      const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
      const LATIN = /[A-Za-z]/;
      const RAW_KEY = /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/;
      const PLACEHOLDER = /\{\{[^}]*\}\}/;
      const CHROME =
        'header, footer, nav, button, label, a, [role="button"], [role="tab"], th, legend';
      const otherLanguage = otherLanguageSelectors.join(', ');

      const describe = (el: Element): string => {
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${text ? ` "${text}"` : ''}`;
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
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };

      const html = document.documentElement;
      if (!root) {
        const lang = (html.getAttribute('lang') ?? '').toLowerCase();
        if (!lang.startsWith(language))
          add(html, 'html-lang', 'error', `lang="${language}…"`, `lang="${lang}"`);
        const dir = (html.getAttribute('dir') || getComputedStyle(html).direction).toLowerCase();
        const expectedDir = language === 'ar' ? 'rtl' : 'ltr';
        if (dir !== expectedDir)
          add(html, 'html-dir', 'error', `dir="${expectedDir}"`, `dir="${dir}"`);
      }

      const rootEl = root ? document.querySelector(root) : document.body;
      if (!rootEl) return issues;

      const elements = [...rootEl.querySelectorAll('*'), rootEl];
      for (const el of elements) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) || !isVisible(el))
          continue;
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim() ?? '')
          .filter(Boolean);
        const placeholder = el.getAttribute('placeholder')?.trim();
        const texts = placeholder ? [...own, placeholder] : own;
        if (!texts.length) continue;

        for (const text of texts) {
          if (RAW_KEY.test(text) || PLACEHOLDER.test(text)) {
            add(el, 'raw-translation-key', 'error', 'translated text', `"${text.slice(0, 60)}"`);
            continue;
          }
          const isChrome = Boolean(el.closest(CHROME)) || text === placeholder;
          if (!isChrome || (otherLanguage && el.closest(otherLanguage))) continue;
          if (language === 'ar' && LATIN.test(text) && !ARABIC.test(text)) {
            const allowed = latinAllowed.some((a) => text === a);
            const technical = /^[\w.+-]+@[\w.-]+$|^(https?:\/\/|www\.)/i.test(text);
            if (!allowed && !technical) {
              add(
                el,
                'latin-in-arabic-ui',
                'review',
                'Arabic interface text (or an approved exception)',
                `"${text.slice(0, 60)}"`,
              );
            }
          }
          if (language === 'en' && ARABIC.test(text)) {
            add(
              el,
              'arabic-in-english-ui',
              'review',
              'English interface text',
              `"${text.slice(0, 60)}"`,
            );
          }
        }
      }
      return issues;
    },
    {
      root: options.root ?? null,
      language: options.language,
      markerStart: options.markerStart ?? 0,
      latinAllowed: [...LATIN_ALLOWED_IN_ARABIC],
      otherLanguageSelectors: [...OTHER_LANGUAGE_SELECTORS],
    },
  );
}
