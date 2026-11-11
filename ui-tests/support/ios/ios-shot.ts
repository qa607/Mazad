import type { Browser } from '@playwright/test';
import type { IosDriver } from '@mobile/ios/ios.session';
import type { IosElement } from './ios-layout';

interface ScreenInfo {
  statusBarSize?: { width: number; height: number };
  scale?: number;
}

interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Width and height of a PNG, read from its IHDR header. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Screenshot of the app area only: the full-device screenshot cropped to Appium's viewport
 * rectangle, so the status bar (clock, battery, notifications) never reaches a baseline. The
 * crop is done in a local Chromium page at 1:1 pixel scale, with no extra dependency.
 */
export async function appAreaScreenshot(driver: IosDriver, browser: Browser): Promise<Buffer> {
  const png = Buffer.from(await driver.takeScreenshot(), 'base64');
  const rect = await driver.execute<ViewportRect, []>('mobile: viewportRect');
  // On the Simulator viewportRect starts at 0 (status bar included): crop by the status bar too.
  const info = await driver.execute<ScreenInfo, []>('mobile: deviceScreenInfo');
  const statusBar = Math.ceil((info.statusBarSize?.height ?? 0) * (info.scale ?? 1));
  const top = Math.max(rect.top, statusBar);
  const size = pngSize(png);
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(
      `<body style="margin:0"><img src="data:image/png;base64,${png.toString('base64')}"></body>`,
    );
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    return await page.screenshot({
      clip: { x: rect.left, y: top, width: rect.width, height: rect.height - (top - rect.top) },
      animations: 'disabled',
    });
  } finally {
    await context.close();
  }
}

/** The frame of a WebdriverIO element as an IosElement (for the layout rules). */
/** Any WebdriverIO element (or chainable element) that exposes its frame. */
interface FramedElement {
  getLocation(): Promise<{ x: number; y: number }>;
  getSize(): Promise<{ width: number; height: number }>;
  getAttribute(name: string): Promise<string | null>;
}

export async function frameOf(el: FramedElement, type: string): Promise<IosElement> {
  const [loc, size, label] = await Promise.all([
    el.getLocation(),
    el.getSize(),
    el.getAttribute('label').catch(() => ''),
  ]);
  return {
    type,
    label: label ?? '',
    name: '',
    value: '',
    placeholder: '',
    visible: true,
    enabled: true,
    x: loc.x,
    y: loc.y,
    width: size.width,
    height: size.height,
  };
}
