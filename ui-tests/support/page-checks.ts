import { test, type Locator, type Page } from '@playwright/test';
import type { Findings } from './findings';
import { findFormGeometryIssues } from './form-geometry';
import { findL10nIssues } from './l10n-checks';
import { findLayoutIssues } from './layout-rules';

export interface PageCheckOptions {
  /** Screen name used in findings and in the outline screenshot name. */
  screen: string;
  /** Limit the checks to one component (CSS selector). */
  root?: string;
  /** Also run the form geometry checks on this form. */
  form?: { fields: Locator[]; primary: Locator };
}

/**
 * Runs the layout (item 10), localization and (optionally) form geometry checks, adds the results to findings, and, when
 * there are any, attaches "<screen>-outline.png" with every flagged element outlined.
 * Runs after the pixel comparison, so the outlines never reach a baseline.
 */
export async function runPageChecks(page: Page, findings: Findings, options: PageCheckOptions) {
  const language = findings.language as 'en' | 'ar';
  const layout = await findLayoutIssues(page, { root: options.root, language });
  const l10n = await findL10nIssues(page, {
    root: options.root,
    language,
    markerStart: 1000,
  });
  const geometry = options.form
    ? await findFormGeometryIssues(page, { ...options.form, language, markerStart: 2000 })
    : [];
  const issues = [...layout, ...l10n, ...geometry];
  if (!issues.length) return;

  const screenshot = `${options.screen}-outline.png`;
  const style = await page.addStyleTag({
    content: '[data-ui-finding]{outline:3px solid #e00 !important;outline-offset:1px !important}',
  });
  const image = await page.screenshot({ fullPage: true, animations: 'disabled', scale: 'css' });
  await test.info().attach(screenshot, { body: image, contentType: 'image/png' });
  await style.evaluate((el) => el.parentNode?.removeChild(el));
  await page.evaluate(() =>
    document
      .querySelectorAll('[data-ui-finding]')
      .forEach((el) => el.removeAttribute('data-ui-finding')),
  );

  for (const issue of issues) {
    findings.add({
      screen: options.screen,
      component: issue.component,
      rule: issue.rule,
      severity: issue.severity,
      expected: issue.expected,
      actual: issue.actual,
      screenshot,
    });
  }
}
