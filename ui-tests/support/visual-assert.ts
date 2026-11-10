import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { DYNAMIC_MASKS, FULL_PAGE_MAX_DIFF_PIXELS } from '../data/ui-allowlists';

const NAME = /^[a-z0-9-]+\.png$/;
const COMPONENT_MAX_DIFF_RATIO = 0.001;
const PAGE_MAX_DIFF_RATIO = 0.01;

/**
 * Noise runs (VISUAL_MODE=noise) measure run-to-run differences: every pixel beyond the per-pixel
 * colour threshold (0.2) is counted, with zero tolerance, so Playwright reports the exact number
 * and saves actual and diff images. Check and capture runs use the normal tolerances.
 */
function tolerance(ratio: number, pixels?: number) {
  return process.env.VISUAL_MODE === 'noise'
    ? { maxDiffPixels: 0 }
    : { maxDiffPixelRatio: ratio, maxDiffPixels: pixels };
}

/**
 * Outside a capture run, a missing baseline is a hard failure that test.fail() cannot hide:
 * the annotation makes ui-guard-reporter fail the whole run.
 */
function requireBaseline(name: string, kind: 'screenshot' | 'snapshot' = 'screenshot'): void {
  if (!NAME.test(name)) throw new Error(`Screenshot name "${name}" must match ${NAME}.`);
  if (process.env.VISUAL_MODE === 'capture') return;
  const info = test.info();
  const file = info.snapshotPath(name, { kind });
  if (!fs.existsSync(file)) {
    const rel = path.relative(process.cwd(), file);
    info.annotations.push({ type: 'ui-missing-baseline', description: rel });
    throw new Error(
      `No baseline for "${name}" (${rel}). Baselines are added only with npm run ui:approve.`,
    );
  }
}

function masksFor(page: Page, screen: string): Locator[] {
  return (DYNAMIC_MASKS[screen] ?? []).map((selector) => page.locator(selector));
}

/** Full-page comparison. Soft, so layout and localization checks still run after a diff. */
export async function expectPageShot(page: Page, name: string): Promise<void> {
  requireBaseline(name);
  await expect.soft(page).toHaveScreenshot(name, {
    fullPage: true,
    ...tolerance(PAGE_MAX_DIFF_RATIO, FULL_PAGE_MAX_DIFF_PIXELS),
    mask: masksFor(page, name.replace(/\.png$/, '')),
  });
}

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The element's box in page coordinates, grown by `padding` CSS px on every side and kept
 * inside the document. Only the screenshot rectangle changes; the page is not touched.
 */
export async function paddedClip(locator: Locator, padding: number): Promise<Clip> {
  return locator.evaluate((el, pad) => {
    const r = el.getBoundingClientRect();
    const doc = document.documentElement;
    const left = Math.max(0, r.left + window.scrollX - pad);
    const top = Math.max(0, r.top + window.scrollY - pad);
    const right = Math.min(doc.scrollWidth, r.right + window.scrollX + pad);
    const bottom = Math.min(doc.scrollHeight, r.bottom + window.scrollY + pad);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, padding);
}

/**
 * Component comparison. With `padding`, the screenshot covers the element plus that many CSS px
 * on every side, so text at the element's edge (for example Arabic labels at the right edge)
 * is never cut by the crop.
 */
export async function expectLocatorShot(
  locator: Locator,
  name: string,
  options: { padding?: number } = {},
): Promise<void> {
  requireBaseline(name);
  const mask = masksFor(locator.page(), name.replace(/\.png$/, ''));
  if (!options.padding) {
    await expect.soft(locator).toHaveScreenshot(name, {
      ...tolerance(COMPONENT_MAX_DIFF_RATIO),
      mask,
    });
    return;
  }
  const clip = await paddedClip(locator, options.padding);
  await expect.soft(locator.page()).toHaveScreenshot(name, {
    fullPage: true,
    clip,
    ...tolerance(COMPONENT_MAX_DIFF_RATIO),
    mask,
  });
}

/**
 * Comparison of a PNG captured outside the browser (for example a native app screenshot).
 * Same rules as the other helpers: a missing baseline fails outside capture runs.
 */
export function expectImageShot(png: Buffer, name: string): void {
  requireBaseline(name, 'snapshot');
  expect.soft(png).toMatchSnapshot(name, { ...tolerance(COMPONENT_MAX_DIFF_RATIO) });
}
