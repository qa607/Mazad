import type { Page } from '@playwright/test';

const COOKIE_BANNER = '.cc-window';
const LOADERS = '[class*="loader"], [class*="spinner"], [class*="skeleton"], [class*="shimmer"]';

export interface StabilizeOptions {
  /** Decline the cookie banner before capture (default true). */
  declineCookies?: boolean;
}

/** Opens a guest page and waits until it is stable enough to capture. GET only. */
export async function gotoGuest(page: Page, url: string, options: StabilizeOptions = {}) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!response || response.status() >= 400) {
    throw new Error(`Could not open ${url}: HTTP ${response?.status() ?? 'no response'}`);
  }
  await stabilize(page, options);
}

/** Declines the cookie banner if it is shown. Clicking Decline is the only interaction. */
export async function declineCookieBanner(page: Page): Promise<void> {
  const banner = page.locator(COOKIE_BANNER);
  const shown = await banner
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await banner
    .locator('a, button')
    .filter({ hasText: /^\s*(Decline|رفض)\s*$/ })
    .first()
    .click();
  await banner.waitFor({ state: 'hidden', timeout: 10_000 });
}

export async function stabilize(page: Page, options: StabilizeOptions = {}): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  // No visible loader or skeleton.
  await page.waitForFunction(
    (selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)].every((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none';
      }),
    LOADERS,
    { timeout: 20_000 },
  );

  // Scroll through the page so lazy images load, then return to the top.
  await page.evaluate(async () => {
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 80; y += step, i++) {
      window.scrollTo(0, y);
      await pause(150);
    }
    window.scrollTo(0, 0);
    await pause(300);
  });

  // Every image that is actually drawn on the page has finished loading. Images that are not drawn
  // (zero size, hidden, or fully clipped, such as offscreen carousel slides) are ignored: with
  // loading="lazy" the browser may never start them. Drawn images that fail to load are reported
  // by the layout checks (rule image-not-loaded).
  await page.waitForFunction(
    () => {
      const drawn = (img: HTMLImageElement): boolean => {
        const r = img.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(img);
        if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
        const doc = document.documentElement;
        const left = r.left + window.scrollX;
        if (left + r.width <= 0 || left >= doc.scrollWidth) return false;
        for (let e = img.parentElement; e && e !== doc; e = e.parentElement) {
          const es = getComputedStyle(e);
          if (es.overflowX === 'visible' && es.overflowY === 'visible') continue;
          const c = e.getBoundingClientRect();
          if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) {
            return false;
          }
        }
        return true;
      };
      return [...document.images].filter(drawn).every((img) => img.complete);
    },
    undefined,
    { timeout: 30_000 },
  );

  // Page height unchanged across two samples 500 ms apart.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const h1 = document.documentElement.scrollHeight;
        setTimeout(() => resolve(document.documentElement.scrollHeight === h1), 500);
      }),
    undefined,
    { timeout: 15_000 },
  );

  if (options.declineCookies !== false) await declineCookieBanner(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
