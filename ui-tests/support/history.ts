import type { Page } from '@playwright/test';

/** What browser Back did after an in-page view change. Observed only; nothing is assumed. */
export interface BackObservation {
  urlBefore: string;
  urlAfterOpen: string;
  urlAfterBack: string;
  /** history.length before and after opening the view: equal means no history entry was added. */
  historyLengthBefore: number;
  historyLengthAfterOpen: number;
  /** False when Back left the page (for example to the previous page or a blank tab). */
  stayedOnSameUrl: boolean;
}

const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'about:' ? url : `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
};

/**
 * Opens a view with `open`, presses browser Back once, and records what happened.
 * It never asserts an expected behaviour; the caller reports the observation.
 */
export async function observeBrowserBack(
  page: Page,
  open: () => Promise<void>,
): Promise<BackObservation> {
  const urlBefore = page.url();
  const historyLengthBefore = await page.evaluate(() => history.length);
  await open();
  const urlAfterOpen = page.url();
  const historyLengthAfterOpen = await page.evaluate(() => history.length);

  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const urlAfterBack = page.url();

  return {
    urlBefore: pathOf(urlBefore),
    urlAfterOpen: pathOf(urlAfterOpen),
    urlAfterBack: pathOf(urlAfterBack),
    historyLengthBefore,
    historyLengthAfterOpen,
    stayedOnSameUrl: pathOf(urlAfterBack) === pathOf(urlAfterOpen),
  };
}
